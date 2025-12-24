import { BadRequestError, NotFoundError } from "../utils/error";
import { PrismaService } from "./prisma-service";
import { FileService } from "./file";
import { X509Certificate, webcrypto, createVerify } from "node:crypto";
import { CreateContractDTO, SignContractDTO } from "../validator/contract";
import {
    PDFArray,
    PDFDict,
    PDFDocument,
    PDFHexString,
    PDFName,
    PDFNumber,
    PDFRef,
    PDFString,
} from "pdf-lib";
import { AppStorage, Contract, ContractVersion, SignatureField } from ".prisma/client";

interface ContractRes extends Contract {
    contractVersions: ContractVersionRes[];
}

interface ContractVersionRes extends ContractVersion {
    signatureFields: SignatureField[];
    file: AppStorage | null; // if null expected error
}

export class ContractService {

    constructor(private db: PrismaService, private fileService: FileService) { }

    getAllContracts = async (): Promise<ContractRes[]> => {
        const contracts = await this.db.contract.findMany({
            include: {
                contractVersions: {
                    include: {
                        signatureFields: true
                    },
                    orderBy: {
                        createdAt: "desc"
                    }
                }
            }
        });
        const hashFiles: string[] = [];
        for (const contract of contracts) {
            for (const contractVersion of contract.contractVersions) {
                hashFiles.push(contractVersion.hashFile);
            }
        }
        const files = await this.fileService.getMultipleByHash(hashFiles);
        const returnData: ContractRes[] = contracts.map(contract => {
            return {
                ...contract,
                contractVersions: contract.contractVersions.map(contractVersion => {
                    const file = files.find(file => file.hash === contractVersion.hashFile);
                    return {
                        ...contractVersion,
                        file: file || null
                    }
                })
            }
        })
        return returnData;
    }

    getContractById = async (contractId: number): Promise<ContractRes> => {
        const contract = await this.db.contract.findUnique({
            where: { id: contractId }, include: {
                contractVersions: {
                    include: {
                        signatureFields: true
                    }
                }
            }
        });
        if (!contract) throw new NotFoundError()
        const hashFiles: string[] = [];
        for (const contractVersion of contract.contractVersions) {
            hashFiles.push(contractVersion.hashFile);
        }
        const files = await this.fileService.getMultipleByHash(hashFiles);
        const returnData: ContractRes = {
            ...contract,
            contractVersions: contract.contractVersions.map(contractVersion => {
                const file = files.find(file => file.hash === contractVersion.hashFile);
                return {
                    ...contractVersion,
                    file: file || null
                }
            })
        }
        return returnData;
    }

    createContract = async (data: CreateContractDTO): Promise<ContractRes> => {
        const [file, isUsed] = await Promise.all([this.fileService.getByHash(data.hash),
        this.db.contractVersion.findFirst({ where: { hashFile: data.hash } })
        ])
        if (!file) throw new NotFoundError("FILE_NOT_FOUND")
        if (isUsed) throw new BadRequestError("FILE_ALREADY_USED_IN_ANOTHER_CONTRACT_VERSION")
        const signatureFields = await this.validateSignatureFields(file.pathFile);
        if (signatureFields.length === 0) throw new BadRequestError("NO_SIGNATURE_FIELDS")
        const createdContract = await this.db.contract.create({
            data: {
                contractVersions: {
                    create: {
                        hashFile: file.hash,
                        signatureFields: {
                            createMany: {
                                data: signatureFields.map(item => ({
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
                        }
                    }
                }
            },
            include: {
                contractVersions: {
                    include: {
                        signatureFields: true
                    },
                    orderBy: {
                        createdAt: "desc"
                    }
                }
            }
        });

        const returnData: ContractRes = {
            ...createdContract,
            contractVersions: createdContract.contractVersions.map(contractVersion => {
                return {
                    ...contractVersion,
                    file: file || null
                }
            })
        }
        return returnData;
    }

    signContract = async (data: SignContractDTO): Promise<ContractRes> => {
        const [file, isUsed, contract] = await Promise.all([this.fileService.getByHash(data.hash),
        this.db.contractVersion.findFirst({ where: { hashFile: data.hash } }),
        this.getContractById(data.contractId)
        ])
        if (!file) throw new NotFoundError("FILE_NOT_FOUND")
        if (!contract) throw new NotFoundError("CONTRACT_NOT_FOUND")
        if (isUsed) throw new BadRequestError("FILE_ALREADY_USED_IN_ANOTHER_CONTRACT_VERSION")
        const signatureFields = await this.validateSignatureFields(file.pathFile);
        if (signatureFields.length === 0) throw new BadRequestError("NO_SIGNATURE_FIELDS")

        // declare past sign
        const pastSignatures: string[] = []
        for (const contractVersion of contract.contractVersions) {
            for (const signatureField of contractVersion.signatureFields) {
                pastSignatures.push(signatureField.signatureField)
            }
        }

        // declare new sign
        const newSignatures: string[] = []
        for (const signatureField of signatureFields) {
            newSignatures.push(signatureField.signatureField)
        }

        // check if past signatures must in new signatures
        for (const pastSignature of pastSignatures) {
            if (!newSignatures.includes(pastSignature)) throw new BadRequestError("PAST_SIGNATURE_NOT_IN_NEW_SIGNATURES")
        }

        // check if all past signature is same with new signature (error bcs we need new signature)
        let isNewSignExist = false
        for (const newSign of newSignatures) {
            if (!pastSignatures.includes(newSign)) isNewSignExist = true
        }

        if (!isNewSignExist) throw new BadRequestError("NEW_SIGNATURE_NOT_EXIST")

        const newContractVersion = await this.db.contractVersion.create({
            data: {
                hashFile: file.hash,
                contractId: data.contractId,
                signatureFields: {
                    createMany: {
                        data: signatureFields.map(item => ({
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
                }
            },
            include: {
                signatureFields: true
            }
        })

        const hashFiles: string[] = [];
        for (const contractVersion of contract.contractVersions) {
            hashFiles.push(contractVersion.hashFile);
        }
        const files = await this.fileService.getMultipleByHash([...hashFiles, file.hash])

        const returnData: ContractRes = {
            ...contract,
            contractVersions: contract.contractVersions.map(contractVersion => {
                const findFile = files.find(file => file.hash === contractVersion.hashFile);
                return {
                    ...contractVersion,
                    file: findFile || null
                }
            })
        }

        const resNewContractVersion = files.find(file => file.hash === newContractVersion.hashFile)

        returnData.contractVersions.push({
            ...newContractVersion,
            signatureFields: newContractVersion.signatureFields.map(signatureField => {
                return {
                    ...signatureField,
                    file: resNewContractVersion || null
                }
            }),
            file: resNewContractVersion || null
        })

        returnData.contractVersions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

        return returnData;
    }

    getBufferFile = async (contractId: number, versionId: number): Promise<Buffer> => {
        const vers = await this.db.contractVersion.findFirst({ where: { contractId, id: versionId } })
        if (!vers) throw new NotFoundError("VERSION_NOT_FOUND")
        const file = await this.fileService.getByHash(vers.hashFile)
        if (!file) throw new NotFoundError("FILE_NOT_FOUND")
        const buffer = await this.downloadPdf(file.pathFile);
        return buffer;
    }

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