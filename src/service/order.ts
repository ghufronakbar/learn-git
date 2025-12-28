import { BadRequestError, NotFoundError } from "../utils/error";
import { PrismaService } from "./prisma-service";
import { FileService } from "./file";
import { X509Certificate, webcrypto, createVerify } from "node:crypto";
import { CreateOrderIssuedDTO } from "../validator/order";
import {
    PDFArray,
    PDFDict,
    PDFDocument,
    PDFHexString,
    PDFName,
    PDFNumber,
    PDFRef,
    PDFString,
    rgb,
    StandardFonts,
} from "pdf-lib";
import { AppStorage, OrderContract, OrderContractVersion, OrderIssued, OrderContractVersionSignatureField } from ".prisma/client";
import { FILE } from "../config/file"
// NEW
import sharp from "sharp";
import * as opentype from "opentype.js";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import { SUBFILTER_ADOBE_PKCS7_DETACHED as SUBFILTER_ADBE_PKCS7_DETACHED } from "@signpdf/utils";
import { Config } from "../config";

interface OrderIssuedRes extends OrderIssued {
    orderContract: OrderContractRes | null;
}

interface OrderContractRes extends OrderContract {
    orderContractVersions: OrderContractVersionRes[];
}

interface OrderContractVersionRes extends OrderContractVersion {
    file: AppStorage | null;
    orderContractVersionSignatureFields: OrderContractVersionSignatureField[];
}


export class OrderService {

    constructor(private db: PrismaService, private fileService: FileService) { }

    getAllOrderIssued = async (): Promise<OrderIssuedRes[]> => {
        const orderIssueds = await this.db.orderIssued.findMany({
            include: {
                orderContract: {
                    include: {
                        orderContractVersions: {
                            include: {
                                orderContractVersionSignatureFields: {
                                    orderBy: {
                                        createdAt: "desc"
                                    }
                                }
                            },
                            orderBy: {
                                createdAt: "desc"
                            }
                        },
                    }
                }
            }
        });
        const hashFiles: string[] = [];
        for (const orderIssued of orderIssueds) {
            for (const contractVersion of orderIssued?.orderContract?.orderContractVersions || []) {
                hashFiles.push(contractVersion.hashFile);
            }
        }
        const files = await this.fileService.getMultipleByHash(hashFiles);
        const returnData: OrderIssuedRes[] = orderIssueds.map(orderIssued => {
            return {
                id: orderIssued.id,
                issue: orderIssued.issue,
                warehouseName: orderIssued.warehouseName,
                createdAt: orderIssued.createdAt,
                updatedAt: orderIssued.updatedAt,
                orderContract: orderIssued.orderContract ? {
                    id: orderIssued.orderContract.id,
                    orderIssuedId: orderIssued.orderContract.orderIssuedId,
                    orderContractVersions: orderIssued.orderContract.orderContractVersions.map(contractVersion => {
                        const file = files.find(file => file.hash === contractVersion.hashFile);
                        return {
                            ...contractVersion,
                            file: file || null
                        }
                    })
                } : null
            }
        })
        return returnData;
    }

    getOrderIssuedById = async (orderIssuedId: number): Promise<OrderIssuedRes> => {
        const orderContract = await this.db.orderIssued.findUnique({
            where: {
                id: orderIssuedId
            },
            include: {
                orderContract: {
                    include: {
                        orderContractVersions: {
                            include: {
                                orderContractVersionSignatureFields: {
                                    orderBy: {
                                        createdAt: "desc"
                                    }
                                },
                            },
                            orderBy: {
                                createdAt: "desc"
                            }
                        },
                        orderIssued: true
                    }
                }
            }
        });
        if (!orderContract) throw new NotFoundError()
        const hashFiles: string[] = [];
        for (const contractVersion of orderContract?.orderContract?.orderContractVersions || []) {
            hashFiles.push(contractVersion.hashFile);
        }
        const files = await this.fileService.getMultipleByHash(hashFiles);
        const returnData: OrderIssuedRes = {
            id: orderContract.id,
            issue: orderContract.issue,
            warehouseName: orderContract.warehouseName,
            createdAt: orderContract.createdAt,
            updatedAt: orderContract.updatedAt,
            orderContract: orderContract.orderContract ? {
                id: orderContract.orderContract.id,
                orderIssuedId: orderContract.orderContract.orderIssuedId,
                orderContractVersions: orderContract.orderContract.orderContractVersions.map(contractVersion => {
                    const file = files.find(file => file.hash === contractVersion.hashFile);
                    return {
                        ...contractVersion,
                        file: file || null
                    }
                })
            } : null
        }
        return returnData;
    }

    createOrderContract = async (data: CreateOrderIssuedDTO): Promise<OrderIssued> => {
        const orderIssued = await this.db.orderIssued.create({
            data: {
                warehouseName: data.warehouseName,
                issue: data.issue,
            }
        })
        await this.createPdfAndUpload(data, orderIssued.id);
        return orderIssued;
    }

    private createPdfAndUpload = async (data: CreateOrderIssuedDTO, id: number): Promise<void> => {
        const pdf = await this.createContractTemplatePdf(data);
        const file = await this.fileService.uploadByBuffer(pdf);
        const signFields = await this.validateSignatureFields(file.pathFile);
        await this.db.orderIssued.update({
            where: {
                id
            },
            data: {
                orderContract: {
                    create: {
                        orderContractVersions: {
                            create: {
                                hashFile: file.hash,
                                orderContractVersionSignatureFields: signFields.length ? {
                                    createMany: {
                                        data: signFields.map((item) => ({
                                            byteRangeOk: item.byteRangeOk || false,
                                            cryptoOk: item.cryptoOk || false,
                                            integrityOk: item.integrityOk || false,
                                            signedAt: item.signedAt || new Date(),
                                            signatureField: item.signatureField,
                                            trustedCa: item.trustedCa || false,
                                            pdfM: item.pdfM,
                                            pdfName: item.pdfName,
                                            subject: item.subject,
                                            issuer: item.issuer,
                                        }))
                                    }
                                } : undefined
                            }
                        }
                    }
                }
            }
        })
    }

    signOrderContract = async (orderIssuedId: number) => {
        const check = await this.db.orderIssued.findUnique({
            where: { id: orderIssuedId },
            include: {
                orderContract: {
                    include: {
                        orderContractVersions: {
                            include: { orderContractVersionSignatureFields: true },
                            orderBy: { createdAt: "desc" },
                        },
                    },
                },
            },
        });

        if (!check) throw new NotFoundError("ORDER_ISSUED_NOT_FOUND");
        if (!check.orderContract) throw new NotFoundError("ORDER_CONTRACT_NOT_FOUND");
        if (!check.orderContract.orderContractVersions.length) throw new NotFoundError("ORDER_CONTRACT_VERSION_NOT_FOUND");

        // kamu bilang hanya boleh 1x tanda tangan
        if (check.orderContract.orderContractVersions.length > 1) {
            throw new BadRequestError("CONTRACT_ALREADY_SIGNED");
        }

        const originalVersion = check.orderContract.orderContractVersions[0];
        const file = await this.fileService.getByHash(originalVersion.hashFile);
        if (!file) throw new NotFoundError("FILE_NOT_FOUND");

        // 1) download pdf unsigned
        const pdfBytes = await this.downloadPdf(file.pathFile);
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

        // 2) render PNG signature dari nama warehouse manager (sharp)
        const signerName = check.warehouseName;
        const rect = getWarehouseSignatureRect(pdfDoc);
        const signaturePng = await renderSignaturePngFromName(
            signerName,
            rect.w,
            rect.h,
            FILE.SIGNING.SCRIPT_FONT!
        );

        // 3) stamp signature image (visible)
        await stampSignatureImage(pdfDoc, rect, signaturePng);

        // 4) add placeholder + sign (P12)
        const signedPdf = await signPdfWithP12(pdfDoc, rect, signerName);

        // 5) upload signed pdf → jadi versi baru
        const signedFile = await this.fileService.uploadByBuffer(signedPdf);

        // 6) ambil metadata+validasi dari PDF signed (pakai method kamu yang sudah “oke”)
        const signFields = await this.validateSignatureFields(signedFile.pathFile);
        if (!signFields.length) throw new BadRequestError("SIGN_FAILED_NO_FIELDS");

        // kalau kamu mau ketat: pastikan minimal 1 signature valid kripto
        const anyOk = signFields.some((s) => s.cryptoOk && s.integrityOk && s.byteRangeOk);
        if (!anyOk) throw new BadRequestError("SIGN_FAILED_CRYPTO_INVALID");

        // 7) simpan versi baru + signature fields
        await this.db.orderContract.update({
            where: { id: check.orderContract.id },
            data: {
                orderContractVersions: {
                    create: {
                        hashFile: signedFile.hash,
                        orderContractVersionSignatureFields: {
                            createMany: {
                                data: signFields.map((item) => ({
                                    signatureField: item.signatureField,
                                    pdfName: item.pdfName,
                                    pdfM: item.pdfM,
                                    subject: item.subject,
                                    issuer: item.issuer,
                                    cryptoOk: item.cryptoOk || false,
                                    byteRangeOk: item.byteRangeOk || false,
                                    integrityOk: item.integrityOk || false,
                                    trustedCa: item.trustedCa || false,
                                    signedAt: item.signedAt || new Date(),
                                })),
                            },
                        },
                    },
                },
            },
        });

        return { ok: true, signedHash: signedFile.hash };
    };

    // ============================================================
    // validateSignatureFields(url)
    // ============================================================
    private validateSignatureFields = async (url: string): Promise<InputSignatureField[]> => {
        const pdfBytes = await this.downloadPdf(url);

        // Parse PDF structure
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

        // Collect /FT /Sig fields
        const sigFields = this.collectSignatureFields(pdfDoc);

        const results: InputSignatureField[] = [];

        for (const sf of sigFields) {
            const sigDict = sf.sigDict;

            // --- RAW META (/Name, /M) ---
            const pdfName = this.decodePdfText(
                this.tryLookup(sigDict, "Name", PDFString) ??
                this.tryLookup(sigDict, "Name", PDFHexString)
            );
            const pdfM = this.decodePdfText(
                this.tryLookup(sigDict, "M", PDFString) ??
                this.tryLookup(sigDict, "M", PDFHexString)
            );

            // signedAt best-effort dari /M (kalau tidak ada -> now)
            const signedAt = pdfM ? this.parsePdfDate(pdfM) ?? new Date() : new Date();

            // --- VALIDATION INPUTS (/ByteRange, /Contents, /SubFilter) ---
            const byteRangeArr = this.tryLookup<{ size?: () => number, get?: (idx: number) => PDFNumber }>(sigDict, "ByteRange", PDFArray);
            const contentsBytes = this.getContentsBytes(sigDict);

            const subFilterName = this.tryLookup<{ asString: () => string }>(sigDict, "SubFilter", PDFName);
            const subFilter = subFilterName?.asString?.() ?? ""; // contoh "/adbe.pkcs7.detached"

            // --- flags default ---
            let byteRangeOk = false;
            let cryptoOk = false;
            let integrityOk = false;
            const trustedCa = false; // (belum pasang trust store)

            let subject: string | undefined;
            let issuer: string | undefined;

            // --- ByteRange check ---
            let br: number[] = [];
            if (byteRangeArr) {
                br = [...Array(byteRangeArr?.size?.() ?? 0)].map((_, idx) => {
                    const n = byteRangeArr?.get?.(idx);
                    return n instanceof PDFNumber ? n.asNumber() : Number(String(n));
                });
                byteRangeOk = this.byteRangeSanityCheck(br, pdfBytes.length);
            }

            // --- crypto verify (best-effort) ---
            if (byteRangeOk && contentsBytes) {
                const [a, b, c, d] = br;
                const signedBytes = Buffer.concat([
                    pdfBytes.subarray(a, a + b),
                    pdfBytes.subarray(c, c + d),
                ]);

                // 1) Coba verifikasi via CMS/PKCS7 (umum: adbe.pkcs7.detached, ETSI.CAdES.detached, dll)
                //    /Contents sering padded -> potong DER dulu.
                const padded = contentsBytes;
                const derCandidate = this.sliceDerFromPadded(padded);

                try {
                    const cmsRes = await this.verifyCmsDetachedPkijs(derCandidate, signedBytes);
                    cryptoOk = cmsRes.ok;

                    if (cmsRes.signerCertDer) {
                        const x509 = new X509Certificate(Buffer.from(cmsRes.signerCertDer));
                        subject = x509.subject;
                        issuer = x509.issuer;
                    }
                } catch (e) {
                    // 2) Fallback: beberapa PDF pakai /SubFilter = adbe.x509.rsa_sha1
                    //    Dalam mode itu /Contents bukan CMS, tapi raw RSA signature.
                    //    Kita coba verify PKCS#1 SHA1 dengan cert dari /Cert.
                    if (subFilter === "/adbe.x509.rsa_sha1") {
                        try {
                            const certDer = this.getCertFromSigDict(sigDict);
                            if (certDer) {
                                const x509 = new X509Certificate(Buffer.from(certDer));
                                subject = x509.subject;
                                issuer = x509.issuer;

                                const sigRaw = this.trimTrailingZeros(padded);
                                const v = createVerify("RSA-SHA1");
                                v.update(signedBytes);
                                v.end();
                                cryptoOk = v.verify(x509.publicKey, sigRaw);
                            }
                        } catch {
                            cryptoOk = false;
                        }
                    } else {
                        // kalau bukan x509.rsa_sha1, kita biarkan gagal di TS layer (tetap bisa simpan META)
                        cryptoOk = false;
                    }
                }
            }

            integrityOk = Boolean(byteRangeOk && cryptoOk);

            // NOTE: kamu bisa memutuskan apakah signatureField/pdfName/pdfM boleh null.
            // Di schema kamu signatureField/pdfName/pdfM wajib string, jadi kita fallback "".
            results.push({
                signatureField: sf.fieldName ?? "",
                pdfName: pdfName ?? "",
                pdfM: pdfM ?? "",
                subject,
                issuer,
                cryptoOk,
                byteRangeOk,
                integrityOk,
                trustedCa,
                signedAt,
            });
        }

        // filter: minimal punya fieldName dan meta
        return results.filter((r) => r.signatureField && r.pdfM);
    };

    // ============================================================
    // Helpers
    // ============================================================

    private downloadPdf = async (url: string): Promise<Buffer> => {
        const res = await fetch(url);
        if (!res.ok) throw new BadRequestError("FAILED_DOWNLOAD_PDF");
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
    };

    private decodePdfText = (obj: unknown): string | undefined => {
        if (obj instanceof PDFString) return obj.decodeText();
        if (obj instanceof PDFHexString) return obj.decodeText();
        return undefined;
    };

    private tryLookup = <T>(dict: PDFDict, key: string, type: any): T | undefined => {
        try {
            return dict.lookupMaybe(PDFName.of(key), type) as T;
        } catch {
            return undefined;
        }
    };

    private lookupAny = (dict: PDFDict, key: string): any | undefined => {
        return dict.lookup(PDFName.of(key));
    };

    private lookupInheritableAny = (dict: PDFDict, key: string, maxDepth = 20): any | undefined => {
        let cur: PDFDict | undefined = dict;
        for (let i = 0; i < maxDepth && cur; i++) {
            const v = this.lookupAny(cur, key);
            if (v !== undefined) return v;
            cur = cur.lookupMaybe(PDFName.of("Parent"), PDFDict);
        }
        return undefined;
    };

    private collectAllFieldDicts = (doc: PDFDocument): PDFDict[] => {
        const out: PDFDict[] = [];
        const seen = new Set<string>();

        const acroForm = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
        const fields = acroForm?.lookupMaybe(PDFName.of("Fields"), PDFArray);
        if (!fields) return out;

        const ctx = doc.context;

        const walk = (refOrDict: any) => {
            const dict = refOrDict instanceof PDFDict ? refOrDict : ctx.lookup(refOrDict, PDFDict);

            if (refOrDict instanceof PDFRef) {
                const k = `${refOrDict.objectNumber}:${refOrDict.generationNumber}`;
                if (seen.has(k)) return;
                seen.add(k);
            }

            out.push(dict);

            const kids = dict.lookupMaybe(PDFName.of("Kids"), PDFArray);
            if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.get(i));
        };

        for (let i = 0; i < fields.size(); i++) walk(fields.get(i));
        return out;
    };

    private collectSignatureFields = (doc: PDFDocument): { fieldName: string; sigDict: PDFDict }[] => {
        const allFields = this.collectAllFieldDicts(doc);
        const sigFields: { fieldName: string; sigDict: PDFDict }[] = [];

        for (const f of allFields) {
            const ft = this.lookupInheritableAny(f, "FT");
            const isSig = ft instanceof PDFName && ft.asString() === "/Sig";
            if (!isSig) continue;

            const vObj = this.lookupInheritableAny(f, "V");
            const sigDict = vObj instanceof PDFDict ? vObj : undefined;
            if (!sigDict) continue;

            const tObj = this.lookupInheritableAny(f, "T");
            const fieldName = this.decodePdfText(tObj) ?? "(unknown-field-name)";

            sigFields.push({ fieldName, sigDict });
        }
        return sigFields;
    };

    private getContentsBytes = (sigDict: PDFDict): Uint8Array | null => {
        const hex = this.tryLookup<PDFHexString>(sigDict, "Contents", PDFHexString);
        if (hex) return hex.asBytes();

        const str = this.tryLookup<PDFString>(sigDict, "Contents", PDFString);
        if (str) return str.asBytes();

        return null;
    };

    private getCertFromSigDict = (sigDict: PDFDict): Uint8Array | null => {
        // /Cert bisa PDFString/PDFHexString atau PDFArray of strings
        const certStr =
            this.tryLookup<PDFString>(sigDict, "Cert", PDFString) ??
            this.tryLookup<PDFHexString>(sigDict, "Cert", PDFHexString);
        if (certStr) return certStr.asBytes();

        const certArr = this.tryLookup<PDFArray>(sigDict, "Cert", PDFArray);
        if (certArr && certArr.size() > 0) {
            const first = certArr.get(0);
            if (first instanceof PDFString || first instanceof PDFHexString) return first.asBytes();
        }
        return null;
    };

    private parsePdfDate = (pdfDate: string): Date | null => {
        try {
            let s = pdfDate.trim();
            if (s.startsWith("D:")) s = s.slice(2);

            const digits = s.slice(0, 14);
            if (digits.length < 14) return null;

            const y = Number(digits.slice(0, 4));
            const mo = Number(digits.slice(4, 6));
            const d = Number(digits.slice(6, 8));
            const hh = Number(digits.slice(8, 10));
            const mm = Number(digits.slice(10, 12));
            const ss = Number(digits.slice(12, 14));

            const tz = s.slice(14);
            if (!tz || tz.startsWith("Z")) {
                return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
            }

            const signChar = tz[0];
            if (signChar !== "+" && signChar !== "-") {
                return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
            }

            const sign = signChar === "+" ? 1 : -1;
            const tzh = Number(tz.slice(1, 3));
            const tzMinMatch = tz.match(/['’](\d{2})/);
            const tzm = tzMinMatch ? Number(tzMinMatch[1]) : 0;

            const offsetMinutes = sign * (tzh * 60 + tzm);
            const utcMs = Date.UTC(y, mo - 1, d, hh, mm, ss) - offsetMinutes * 60_000;
            return new Date(utcMs);
        } catch {
            return null;
        }
    };

    private byteRangeSanityCheck = (br: number[], fileLen: number): boolean => {
        if (br.length < 4) return false;
        const [a, b, c, d] = br;
        if (![a, b, c, d].every((n) => Number.isFinite(n) && n >= 0)) return false;
        if (a + b > fileLen) return false;
        if (c + d > fileLen) return false;
        return true;
    };

    private trimTrailingZeros = (bytes: Uint8Array): Uint8Array => {
        let end = bytes.length;
        while (end > 0 && bytes[end - 1] === 0x00) end--;
        return bytes.slice(0, end);
    };

    private sliceDerFromPadded = (buf: Uint8Array): Uint8Array => {
        // /Contents sering padded (0x00). Potong sesuai DER length.
        let i = 0;
        while (i < buf.length && buf[i] === 0x00) i++;
        if (i >= buf.length) return buf;

        // DER SEQUENCE biasanya 0x30
        if (buf[i] !== 0x30) return buf;

        if (i + 2 > buf.length) return buf;
        const lenByte = buf[i + 1];

        // short form
        if (lenByte < 0x80) {
            const total = 2 + lenByte;
            return buf.slice(i, i + total);
        }

        // indefinite length
        if (lenByte === 0x80) {
            for (let j = buf.length - 2; j > i; j--) {
                if (buf[j] === 0x00 && buf[j + 1] === 0x00) return buf.slice(i, j + 2);
            }
            return buf;
        }

        // long form
        const numLenBytes = lenByte & 0x7f;
        if (i + 2 + numLenBytes > buf.length) return buf;

        let len = 0;
        for (let k = 0; k < numLenBytes; k++) len = (len << 8) | buf[i + 2 + k];
        const header = 2 + numLenBytes;
        const total = header + len;
        return buf.slice(i, i + total);
    };

    private toArrayBuffer = (u8: Uint8Array): ArrayBuffer | SharedArrayBuffer => {
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    };

    // ===================== PKI.js verify =====================

    private pkijsReady = false;

    private ensurePkijsEngine = async () => {
        if (this.pkijsReady) return;
        const pkijs: any = await import("pkijs");

        // Set engine untuk PKI.js di Node (WebCrypto)
        pkijs.setEngine(
            "node",
            webcrypto as any,
            new pkijs.CryptoEngine({
                name: "node",
                crypto: webcrypto as any,
                subtle: (webcrypto as any).subtle,
            })
        );

        this.pkijsReady = true;
    };

    private verifyCmsDetachedPkijs = async (
        cmsDer: Uint8Array,
        signedBytes: Uint8Array
    ): Promise<{ ok: boolean; signerCertDer?: Uint8Array }> => {
        await this.ensurePkijsEngine();
        const pkijs: any = await import("pkijs");
        const asn1js: any = await import("asn1js");

        const asn1 = asn1js.fromBER(this.toArrayBuffer(cmsDer));
        if (asn1.offset === -1) throw new Error("ASN.1 parse failed");

        // Coba parse sebagai ContentInfo, fallback SignedData
        let signedData: any;
        try {
            const ci = new pkijs.ContentInfo({ schema: asn1.result });
            signedData = new pkijs.SignedData({ schema: ci.content });
        } catch {
            signedData = new pkijs.SignedData({ schema: asn1.result });
        }

        const ok: boolean = await signedData.verify({
            signer: 0,
            data: this.toArrayBuffer(signedBytes),
            checkChain: false,
        });

        // Best-effort ambil cert signer
        let signerCertDer: Uint8Array | undefined;
        try {
            const signerInfo = signedData.signerInfos?.[0];
            const certs: any[] = signedData.certificates ?? [];
            const sid = signerInfo?.sid;

            const sidSerialHex: string | null =
                sid?.serialNumber?.valueBlock?.valueHex
                    ? Buffer.from(sid.serialNumber.valueBlock.valueHex).toString("hex").toUpperCase()
                    : null;

            if (sidSerialHex && certs.length) {
                for (const c of certs) {
                    const der = Buffer.from(c.toSchema().toBER(false));
                    const x = new X509Certificate(der);
                    const certSerial = x.serialNumber.replace(/[^0-9A-F]/gi, "").toUpperCase();
                    if (certSerial === sidSerialHex.replace(/[^0-9A-F]/gi, "")) {
                        signerCertDer = new Uint8Array(der);
                        break;
                    }
                }
            }

            if (!signerCertDer && certs[0]) {
                signerCertDer = new Uint8Array(Buffer.from(certs[0].toSchema().toBER(false)));
            }
        } catch {
            // ignore
        }

        return { ok: Boolean(ok), signerCertDer };
    };


    createContractTemplatePdf = async (data: CreateOrderIssuedDTO): Promise<Buffer> => {
        const pdfDoc = await PDFDocument.create();

        const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

        // A4 in points (pdf-lib pakai point)
        const A4 = { width: 595.28, height: 841.89 };
        const margin = 40;

        const fontSize = 12;
        const lineHeight = fontSize * 1.6;

        const titleSize = 14;
        const titleGap = 30;

        const contentGapAfter = 40;

        // Signature layout
        const signBoxW = 200;
        const signBoxH = 80;
        const signGap = 10;
        const signatureBlockH = signBoxH + signGap + lineHeight + 10; // box + jarak + nama
        const signatureBottomPadding = 0;

        // --- helpers ---
        const toPlainText = (html: string) => {
            // Convert beberapa tag umum jadi newline biar lebih “mirip”
            let s = html ?? "";
            s = s.replace(/<br\s*\/?>/gi, "\n");
            s = s.replace(/<\/p>/gi, "\n\n");
            s = s.replace(/<\/div>/gi, "\n");
            // strip tag lain
            s = s.replace(/<[^>]*>/g, "");
            // decode entity minimal (kalau perlu lebih lengkap, bisa pakai library entities)
            s = s.replace(/&nbsp;/g, " ");
            s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
            // normalize whitespace
            s = s.replace(/\r\n/g, "\n");
            return s.trim();
        };

        const splitParagraphs = (text: string) => {
            // pisah paragraf dari double newline
            return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        };

        const wrapLine = (text: string, maxWidth: number, font: any, size: number) => {
            // word-wrap sederhana
            const words = text.split(/\s+/).filter(Boolean);
            const lines: string[] = [];
            let current = "";

            for (const w of words) {
                const test = current ? `${current} ${w}` : w;
                const width = font.widthOfTextAtSize(test, size);
                if (width <= maxWidth) {
                    current = test;
                } else {
                    if (current) lines.push(current);
                    // kalau 1 kata kepanjangan, paksa pecah (fallback)
                    if (font.widthOfTextAtSize(w, size) > maxWidth) {
                        let chunk = "";
                        for (const ch of w) {
                            const t = chunk + ch;
                            if (font.widthOfTextAtSize(t, size) <= maxWidth) chunk = t;
                            else {
                                if (chunk) lines.push(chunk);
                                chunk = ch;
                            }
                        }
                        current = chunk;
                    } else {
                        current = w;
                    }
                }
            }
            if (current) lines.push(current);
            return lines;
        };

        const drawJustifiedLine = (
            page: any,
            line: string,
            x: number,
            y: number,
            maxWidth: number,
            font: any,
            size: number,
            isLastLine: boolean
        ) => {
            // Simple justify: distribusi extra space antar kata
            if (isLastLine || !line.includes(" ")) {
                page.drawText(line, { x, y, size, font });
                return;
            }

            const words = line.split(" ");
            const wordsWidth = words.reduce((acc: number, w: string) => acc + font.widthOfTextAtSize(w, size), 0);
            const gaps = words.length - 1;
            if (gaps <= 0) {
                page.drawText(line, { x, y, size, font });
                return;
            }

            const spaceWidth = font.widthOfTextAtSize(" ", size);
            const baseLineWidth = wordsWidth + gaps * spaceWidth;

            const extra = maxWidth - baseLineWidth;
            if (extra <= 0) {
                page.drawText(line, { x, y, size, font });
                return;
            }

            const extraPerGap = extra / gaps;

            let cursorX = x;
            for (let i = 0; i < words.length; i++) {
                const w = words[i];
                page.drawText(w, { x: cursorX, y, size, font });
                cursorX += font.widthOfTextAtSize(w, size);
                if (i < gaps) cursorX += spaceWidth + extraPerGap;
            }
        };

        const newPage = () => pdfDoc.addPage([A4.width, A4.height]);

        let page = newPage();
        let y = A4.height - margin;

        const maxTextWidth = A4.width - margin * 2;

        // --- Title ---
        const title = (data.issue ?? "").toUpperCase();
        const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
        const titleX = Math.max(margin, (A4.width - titleWidth) / 2);

        y -= titleSize;
        page.drawText(title, { x: titleX, y, size: titleSize, font: fontBold });
        y -= titleGap;

        // --- Body text ---
        const plainContent = toPlainText(`Laporan Pengiriman ${data.issue} oleh ${data.warehouseName}`);
        const paragraphs = splitParagraphs(plainContent);

        // Sisakan ruang signature di halaman terakhir (bottom)
        const bottomLimit = margin + signatureBlockH + signatureBottomPadding;

        for (let pi = 0; pi < paragraphs.length; pi++) {
            const p = paragraphs[pi];

            const lines = wrapLine(p, maxTextWidth, fontRegular, fontSize);

            for (let li = 0; li < lines.length; li++) {
                // kalau y sudah mepet bawah, buat halaman baru
                if (y - lineHeight < bottomLimit) {
                    page = newPage();
                    y = A4.height - margin;
                }

                const isLastLineOfParagraph = li === lines.length - 1;
                drawJustifiedLine(
                    page,
                    lines[li],
                    margin,
                    y,
                    maxTextWidth,
                    fontRegular,
                    fontSize,
                    isLastLineOfParagraph
                );
                y -= lineHeight;
            }

            // gap antar paragraf
            y -= lineHeight * 0.6;

            // kalau terlalu mepet, pindah halaman
            if (y < bottomLimit) {
                page = newPage();
                y = A4.height - margin;
            }
        }

        // extra gap sebelum signature (mirip HTML margin-bottom 40px)
        y -= contentGapAfter;

        // Pastikan signature muat; kalau tidak, pindah ke halaman baru
        if (y < bottomLimit + 20) {
            page = newPage();
            y = A4.height - margin;
        }

        // --- Signature box (kanan) ---
        const boxX = A4.width - margin - signBoxW;
        const boxY = margin + lineHeight + 10; // posisi dari bawah halaman (stabil)

        // kotak tanda tangan
        page.drawRectangle({
            x: boxX,
            y: boxY + lineHeight + signGap,
            width: signBoxW,
            height: signBoxH,
            borderWidth: 1,
            borderColor: rgb(0, 0, 0),
            color: rgb(0, 0, 0),
            opacity: 0,        // fill transparan
            borderOpacity: 1,  // outline tetap terlihat
        });

        // TODO: SIG TANDA TANGAN
        // applicant bold di bawah box
        const applicant = data.warehouseName
        const applicantWidth = fontBold.widthOfTextAtSize(applicant, fontSize);
        page.drawText(applicant, {
            x: boxX + (signBoxW - applicantWidth) / 2,
            y: boxY,
            size: fontSize,
            font: fontBold,
        });

        const bytes = await pdfDoc.save(); // Uint8Array
        return Buffer.from(bytes);
    };

}

type InputSignatureField = {
    signatureField: string;
    pdfName: string;
    pdfM: string;
    subject?: string;
    issuer?: string;
    cryptoOk?: boolean;
    byteRangeOk?: boolean;
    integrityOk?: boolean;
    trustedCa?: boolean;
    signedAt?: Date;
}

// ===================================================================
// Helper: hitung area signature (HARUS konsisten dg template kamu)
// ===================================================================
type SignatureRect = { pageIndex: number; x: number; y: number; w: number; h: number };

function getWarehouseSignatureRect(pdfDoc: PDFDocument): SignatureRect {
    // Selaras dengan template kamu (A4 + bottom-right box)
    const pages = pdfDoc.getPages();
    const pageIndex = Math.max(0, pages.length - 1); // taruh di halaman terakhir

    // A4 in points (template kamu pakai angka ini)
    const A4_WIDTH = 595.28;
    const margin = 40;
    const fontSize = 12;
    const lineHeight = fontSize * 1.6;

    const signBoxW = 200;
    const signBoxH = 80;
    const signGap = 10;

    const boxX = A4_WIDTH - margin - signBoxW;
    const boxY = margin + lineHeight + 10; // sama persis dengan createContractTemplatePdf kamu

    // kotak tanda tangan kamu digambar di:
    // y = boxY + lineHeight + signGap
    const x = boxX;
    const y = boxY + lineHeight + signGap;
    const w = signBoxW;
    const h = signBoxH;

    return { pageIndex, x, y, w, h };
}

// ===================================================================
// Helper: render signature PNG dari nama pakai opentype.js + sharp
// (Tidak bergantung font OS; pakai FILE.SIGNING.SCRIPT_FONT milikmu)
// ===================================================================
function bufferToArrayBuffer(buf: Buffer): ArrayBuffer | SharedArrayBuffer {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function renderSignaturePngFromName(
    name: string,
    width: number,
    height: number,
    fontBuf: Buffer
): Promise<Buffer> {
    const font = opentype.parse(bufferToArrayBuffer(fontBuf));
    const baseSize = 96; // base font size untuk bikin path

    // Path berbasis vektor, bukan <text>, jadi aman dirender oleh sharp
    const path = font.getPath(name, 0, 0, baseSize);
    const bbox = path.getBoundingBox();

    const pad = 6;
    const textW = Math.max(1, bbox.x2 - bbox.x1);
    const textH = Math.max(1, bbox.y2 - bbox.y1);

    const scale = Math.min((width - 2 * pad) / textW, (height - 2 * pad) / textH);

    // opentype y-axis naik ke atas, SVG y-axis turun ke bawah → flip dengan scaleY negatif
    const tx = pad - bbox.x1 * scale;
    const ty = pad + bbox.y2 * scale;

    const d = path.toPathData(2);

    const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="transparent"/>
    <g transform="translate(${tx}, ${ty}) scale(${scale}, ${-scale})">
      <path d="${d}" fill="black"/>
    </g>
  </svg>`;

    return sharp(Buffer.from(svg)).png().toBuffer();
}

// ===================================================================
// Helper: embed signature PNG ke PDF (visible signature appearance)
// ===================================================================
async function stampSignatureImage(
    pdfDoc: PDFDocument,
    rect: SignatureRect,
    png: Buffer
) {
    const pages = pdfDoc.getPages();
    const page = pages[rect.pageIndex];

    const img = await pdfDoc.embedPng(png);

    // sedikit padding biar tidak mepet border
    const pad = 6;
    page.drawImage(img, {
        x: rect.x + pad,
        y: rect.y + pad,
        width: rect.w - pad * 2,
        height: rect.h - pad * 2,
    });

    // opsional: kasih teks kecil “Signed in system”
    page.drawText("Signed electronically", {
        x: rect.x,
        y: rect.y - 10,
        size: 8,
        color: rgb(0, 0, 0),
    });
}

// ===================================================================
// Helper: add placeholder + sign dengan P12
// ===================================================================
async function signPdfWithP12(pdfDoc: PDFDocument, rect: SignatureRect, signerName: string): Promise<Buffer> {
    const cfg = new Config()
    const passphrase = cfg.signPdf.SIGN_P12_PASSPHRASE

    // 1) add placeholder (/Sig, /ByteRange, /Contents padding)
    pdflibAddPlaceholder({
        pdfDoc,
        reason: "Warehouse delivery approval",
        contactInfo: "Nextar74 demo",
        name: signerName,
        location: "Warehouse",
        signingTime: new Date(),
        signatureLength: 8192,
        subFilter: SUBFILTER_ADBE_PKCS7_DETACHED, // "adbe.pkcs7.detached"
        // widgetRect = [llx, lly, urx, ury]
        widgetRect: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h],
        // beberapa versi support pageNumber; kalau tidak ada juga biasanya tetap jalan (default last/first)
        pageNumber: rect.pageIndex,
    } as any);

    // penting untuk kompatibilitas placeholder/signing flow
    const pdfWithPlaceholderBytes = await pdfDoc.save({ useObjectStreams: false }); // :contentReference[oaicite:4]{index=4}
    const pdfWithPlaceholder = Buffer.from(pdfWithPlaceholderBytes);

    // 2) sign placeholder
    const { default: SignPdf } = await import("@signpdf/signpdf");
    const signpdf = SignPdf

    const signer = new P12Signer(FILE.SIGNING.P12_KEY!, { passphrase });
    const signedPdf: Buffer = await signpdf.sign(pdfWithPlaceholder, signer);

    return signedPdf;
}