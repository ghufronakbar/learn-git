// test/test-pdf-lib.ts
//
// Tujuan: “versi TS” yang semirip mungkin dengan output Python kamu.
//
// OUTPUT dibagi 2 bagian:
//
// (A) RAW META
//   - Baca signature fields dari struktur PDF (AcroForm -> Fields -> Kids)
//   - Untuk setiap signature field:
//       * field name (dari /T, inheritable)
//       * PDF signature dict (/V) -> ambil /Name dan /M (decoded bener oleh pdf-lib)
//       * parse /M jadi Date (signer-reported time)
//
// (B) VALIDATED (Crypto/Integrity best-effort)
//   - Ambil /ByteRange dan /Contents dari signature dictionary
//   - Bangun bytes yang disign sesuai ByteRange
//   - Verifikasi CMS signature (PKCS#7/CMS) terhadap bytes tsb pakai PKI.js
//
// Penting:
// - "Signer-reported time" dari /M itu *self-reported* (bukan bukti waktu tepercaya),
//   kecuali kamu juga validasi timestamp token + chain trust.
//
// - "Trusted CA?" sengaja FALSE karena kita tidak pasang trust roots (mirip output Python kamu).
//
// Install deps:
//   npm i pdf-lib pkijs asn1js
//
// Run:
//   npx ts-node test/test-pdf-lib.ts test/signed_contract.pdf
//   (kalau tanpa argumen, default: test/signed_contract.pdf)

import fs from "node:fs";
import path from "node:path";
import { X509Certificate, webcrypto } from "node:crypto";
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

type SigField = {
    fieldName: string;
    fieldDict: PDFDict;
    sigDict: PDFDict;
};

type SigResult = {
    fieldName: string;

    pdfName?: string;
    pdfM?: string;
    signerReportedTime?: Date | null;

    // dari cert (kalau bisa diambil)
    subject?: string;
    issuer?: string;

    // Validasi
    byteRangeOk?: boolean;
    cryptoOk?: boolean;
    integrityOk?: boolean;
    trustedCa?: boolean;
};

// ------------------------- helpers: printing -------------------------

function printTitle(title: string) {
    console.log("\n" + "=".repeat(80));
    console.log(title);
    console.log("=".repeat(80));
}

// ------------------------- helpers: PDF parsing -------------------------

/**
 * decode string PDF dengan benar (termasuk escape \ddd seperti \072 -> ':')
 * pdf-lib sudah handle ini lewat decodeText()
 */
function decodePdfText(obj: unknown): string | undefined {
    if (obj instanceof PDFString) return obj.decodeText();
    if (obj instanceof PDFHexString) return obj.decodeText();
    return undefined;
}

/**
 * Ambil nilai dari dict TANPA memaksa tipe.
 * Ini penting karena pdf-lib@1.17.1: lookupMaybe(key, type) wajib ada `type`. :contentReference[oaicite:6]{index=6}
 */
function lookupAny(dict: PDFDict, key: string): any | undefined {
    return dict.lookup(PDFName.of(key));
}

/**
 * Properti field kadang diwariskan dari /Parent (AcroForm fields bisa nested).
 * Kita cari sampai maxDepth biar aman.
 */
function lookupInheritableAny(dict: PDFDict, key: string, maxDepth = 20): any | undefined {
    let cur: PDFDict | undefined = dict;
    for (let i = 0; i < maxDepth && cur; i++) {
        const v = lookupAny(cur, key);
        if (v !== undefined) return v;
        // Parent harus PDFDict; gunakan lookupMaybe dengan type biar deref ref juga
        cur = cur.lookupMaybe(PDFName.of("Parent"), PDFDict);
    }
    return undefined;
}

function collectAllFieldDicts(doc: PDFDocument): PDFDict[] {
    const out: PDFDict[] = [];
    const seen = new Set<string>();

    const acroForm = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
    const fields = acroForm?.lookupMaybe(PDFName.of("Fields"), PDFArray);
    if (!fields) return out;

    const ctx = doc.context;

    const walk = (refOrDict: any) => {
        const dict = refOrDict instanceof PDFDict ? refOrDict : ctx.lookup(refOrDict, PDFDict);

        // Dedup kalau ada PDFRef
        if (refOrDict instanceof PDFRef) {
            const k = `${refOrDict.objectNumber}:${refOrDict.generationNumber}`;
            if (seen.has(k)) return;
            seen.add(k);
        }

        out.push(dict);

        const kids = dict.lookupMaybe(PDFName.of("Kids"), PDFArray);
        if (kids) {
            for (let i = 0; i < kids.size(); i++) {
                walk(kids.get(i));
            }
        }
    };

    for (let i = 0; i < fields.size(); i++) walk(fields.get(i));
    return out;
}

/**
 * PDF date: D:YYYYMMDDHHmmSSOHH'mm' atau Z
 * contoh: D:20251122021547+07'00'
 */
function parsePdfDate(pdfDate: string): Date | null {
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
}

// ------------------------- helpers: signature bytes -------------------------

function sliceDerFromPadded(buf: Uint8Array): Uint8Array {
    // skip leading 0x00 (kadang ada)
    let i = 0;
    while (i < buf.length && buf[i] === 0x00) i++;

    if (i >= buf.length) return buf;
    if (buf[i] !== 0x30) {
        // bukan SEQUENCE -> kemungkinan bukan CMS ContentInfo/SignedData
        return buf;
    }

    if (i + 2 > buf.length) return buf;

    const lenByte = buf[i + 1];

    // Short form length
    if (lenByte < 0x80) {
        const total = 2 + lenByte;
        return buf.slice(i, i + total);
    }

    // Indefinite length (jarang di CMS DER, tapi aman)
    if (lenByte === 0x80) {
        // cari end-of-contents 00 00
        for (let j = buf.length - 2; j > i; j--) {
            if (buf[j] === 0x00 && buf[j + 1] === 0x00) {
                return buf.slice(i, j + 2);
            }
        }
        return buf;
    }

    // Long form length
    const numLenBytes = lenByte & 0x7f;
    if (i + 2 + numLenBytes > buf.length) return buf;

    let len = 0;
    for (let k = 0; k < numLenBytes; k++) {
        len = (len << 8) | buf[i + 2 + k];
    }
    const header = 2 + numLenBytes;
    const total = header + len;
    return buf.slice(i, i + total);
}


function toArrayBuffer(u8: Uint8Array): ArrayBuffer | SharedArrayBuffer {
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function byteRangeSanityCheck(br: number[], fileLen: number): boolean {
    // br: [a, b, c, d]
    if (br.length < 4) return false;
    const [a, b, c, d] = br;
    if (![a, b, c, d].every((n) => Number.isFinite(n) && n >= 0)) return false;
    if (a + b > fileLen) return false;
    if (c + d > fileLen) return false;
    // umumnya a=0, dan a+b <= c (gap itu /Contents). Tapi beberapa PDF bisa beda.
    return true;
}

// ------------------------- CMS verify (PKI.js) -------------------------

let pkijsEngineReady = false;

/**
 * PKI.js butuh crypto engine global.
 * setEngine(name, crypto, subtle) ada di dokumentasi global PKI.js. :contentReference[oaicite:7]{index=7}
 * Node menyediakan WebCrypto via require('node:crypto').webcrypto. :contentReference[oaicite:8]{index=8}
 */
async function ensurePkijsEngine() {
    if (pkijsEngineReady) return;

    const pkijs: any = await import("pkijs");
    // setEngine("name", crypto, subtleOrEngine)
    // Pola ini umum dipakai untuk environment Node.
    pkijs.setEngine(
        "node",
        webcrypto as any,
        new pkijs.CryptoEngine({
            name: "node",
            crypto: webcrypto as any,
            subtle: (webcrypto as any).subtle,
        })
    );

    pkijsEngineReady = true;
}

/**
 * Verify CMS detached signature terhadap signedBytes.
 * PKI.js SignedData.verify() menerima "data" untuk detached content. :contentReference[oaicite:9]{index=9}
 */
async function verifyCmsDetached(
    cmsPadded: Uint8Array,
    signedBytes: Uint8Array
): Promise<{ ok: boolean; signerCertDer?: Uint8Array; kind: "ContentInfo" | "SignedData" }> {
    await ensurePkijsEngine();

    const pkijs: any = await import("pkijs");
    const asn1js: any = await import("asn1js");

    // potong padding berdasarkan DER length
    const cmsDer = sliceDerFromPadded(cmsPadded);

    // DEBUG ringan: lihat apakah mulai dengan 0x30
    // console.log("  Contents[0..8] =", Buffer.from(cmsDer.slice(0, 8)).toString("hex"));

    const asn1 = asn1js.fromBER(toArrayBuffer(cmsDer));
    if (asn1.offset === -1) throw new Error("ASN.1 fromBER failed (Contents bukan ASN.1 valid)");

    let signedData: any;
    let kind: "ContentInfo" | "SignedData" = "ContentInfo";

    try {
        // 1) coba anggap ContentInfo (CMS normal)
        const ci = new pkijs.ContentInfo({ schema: asn1.result });
        if (ci.contentType !== pkijs.ContentInfo.SIGNED_DATA) {
            throw new Error("CMS ContentInfo bukan SignedData");
        }
        signedData = new pkijs.SignedData({ schema: ci.content });
        kind = "ContentInfo";
    } catch {
        // 2) fallback: mungkin isinya SignedData langsung (tanpa wrapper ContentInfo)
        signedData = new pkijs.SignedData({ schema: asn1.result });
        kind = "SignedData";
    }

    const ok: boolean = await signedData.verify({
        signer: 0,
        data: toArrayBuffer(signedBytes),
        checkChain: false,
    });

    return { ok: Boolean(ok), signerCertDer: undefined, kind };
}


function tryLookup<T>(
    dict: PDFDict,
    key: string,
    type: any
): T | undefined {
    try {
        return dict.lookupMaybe(PDFName.of(key), type) as T;
    } catch {
        return undefined;
    }
}

function getContentsBytes(sigDict: PDFDict): Uint8Array | null {
    const hex = tryLookup<PDFHexString>(sigDict, "Contents", PDFHexString);
    if (hex) return hex.asBytes(); // pdf-lib decode hex -> bytes bener :contentReference[oaicite:2]{index=2}

    const str = tryLookup<PDFString>(sigDict, "Contents", PDFString);
    if (str) return str.asBytes(); // kalau ternyata string biasa (rare)
    return null;
}


// ------------------------- main -------------------------

async function main() {
    const inputArg = process.argv[2];
    console.log("Input arg:", inputArg || "(default)");
    const pdfPath = inputArg
        ? path.resolve(process.cwd(), inputArg)
        : path.resolve(process.cwd(), "test/signed_contract.pdf");

    if (!fs.existsSync(pdfPath)) {
        console.error(`PDF not found: ${pdfPath}`);
        process.exit(1);
    }

    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // 1) collect signature fields
    const allFields = collectAllFieldDicts(pdfDoc);

    const sigFields: SigField[] = [];
    for (const f of allFields) {
        const ft = lookupInheritableAny(f, "FT");
        const isSig = ft instanceof PDFName && ft.asString() === "/Sig";
        if (!isSig) continue;

        const vObj = lookupInheritableAny(f, "V");
        const sigDict = vObj instanceof PDFDict ? vObj : undefined;
        if (!sigDict) continue;

        const tObj = lookupInheritableAny(f, "T");
        const fieldName = decodePdfText(tObj) ?? "(unknown-field-name)";

        sigFields.push({ fieldName, fieldDict: f, sigDict });
    }

    // (A) RAW META
    printTitle("(A) RAW META (dibaca dari struktur PDF via pdf-lib)");

    if (sigFields.length === 0) {
        console.log("Tidak ketemu signature fields (/FT /Sig).");
        process.exit(0);
    }

    const results: SigResult[] = [];

    for (const s of sigFields) {
        // /Name & /M bisa PDFString atau PDFHexString
        const nameObj =
            s.sigDict.lookupMaybe(PDFName.of("Name"), PDFString, PDFHexString) ??
            undefined;
        const mObj =
            s.sigDict.lookupMaybe(PDFName.of("M"), PDFString, PDFHexString) ??
            undefined;

        const pdfName = nameObj ? nameObj.decodeText() : undefined;
        const pdfM = mObj ? mObj.decodeText() : undefined;
        const signerReportedTime = pdfM ? parsePdfDate(pdfM) : null;

        console.log(`\nSignature field: ${s.fieldName}`);
        console.log(`  PDF /Name: ${pdfName ?? "(missing)"}`);
        console.log(`  PDF /M   : ${pdfM ?? "(missing)"}`);
        console.log(
            `  Signer-reported time: ${signerReportedTime ? signerReportedTime.toISOString() : "(unknown)"
            }`
        );

        results.push({
            fieldName: s.fieldName,
            pdfName,
            pdfM,
            signerReportedTime,
        });
    }

    // (B) VALIDATED
    printTitle("(B) VALIDATED (Crypto/Integrity check via ByteRange + CMS verify)");

    for (let i = 0; i < sigFields.length; i++) {
        const s = sigFields[i];
        const sigDict = s.sigDict;


        const byteRangeArr = sigDict.lookupMaybe(PDFName.of("ByteRange"), PDFArray);

        // DEBUG: lihat subfilter dulu
        const subFilter = tryLookup<any>(sigDict, "SubFilter", PDFName);
        console.log("  SubFilter:", subFilter?.asString?.() ?? "(unknown)");

        const contentsBytes = getContentsBytes(sigDict);


        // /Contents biasanya hex string, tapi kadang bisa normal string
        const contentsHex = sigDict.lookupMaybe(PDFName.of("Contents"), PDFHexString);
        // const contentsStr = sigDict.lookupMaybe(PDFName.of("Contents"), PDFString);
        console.log("test===")
        const contentsObj = contentsHex

        console.log(`\nSignature field: ${s.fieldName}`);

        if (!byteRangeArr || !contentsBytes) {
            console.log("  (Tidak ada /ByteRange atau /Contents → tidak bisa verify)");
            continue;
        }

        const cmsPadded = contentsBytes;


        // ByteRange -> number[]
        const br = [...Array(byteRangeArr.size())].map((_, idx) => {
            const n = byteRangeArr.get(idx);
            return n instanceof PDFNumber ? n.asNumber() : Number(String(n));
        });

        const byteRangeOk = byteRangeSanityCheck(br, pdfBytes.length);
        if (!byteRangeOk) {
            console.log("  ByteRange tidak valid:", br);
            continue;
        }

        const [a, b, c, d] = br;
        const part1 = pdfBytes.subarray(a, a + b);
        const part2 = pdfBytes.subarray(c, c + d);
        const signedBytes = Buffer.concat([part1, part2]);

        // CMS bytes dari /Contents, buang padding 0x00


        let cryptoOk = false;
        let subject: string | undefined;
        let issuer: string | undefined;

        const cmsRaw = contentsObj?.asBytes();
        const { ok, kind } = await verifyCmsDetached(cmsPadded, signedBytes);
        cryptoOk = ok;
        console.log("  Parsed as :", kind);
        if (!ok || cmsRaw === undefined) {
            console.log("  Verify error:", kind);
            continue;
        }
        try {
            const { ok, signerCertDer } = await verifyCmsDetached(cmsRaw, signedBytes);
            cryptoOk = ok;

            if (signerCertDer) {
                const x509 = new X509Certificate(Buffer.from(signerCertDer));
                subject = x509.subject;
                issuer = x509.issuer;
            }
        } catch (e: any) {
            console.log("  Verify error:", e?.message ?? e);
            continue;
        }

        // Interpretasi:
        // - integrityOk: ByteRange sane + signature crypto verify OK
        // - trustedCa: belum dicek (trust store kosong) -> false
        const integrityOk = Boolean(byteRangeOk && cryptoOk);
        const trustedCa = false;

        console.log("  Subject:", subject ?? "(unknown)");
        console.log("  Issuer :", issuer ?? "(unknown)");
        console.log("  ByteRange OK:", byteRangeOk);
        console.log("  Crypto OK   :", cryptoOk);
        console.log("  Integrity OK:", integrityOk);
        console.log("  Trusted CA? :", trustedCa);

        // simpan ke results biar bisa dipakai kalau mau rekap
        results[i] = {
            ...results[i],
            subject,
            issuer,
            byteRangeOk,
            cryptoOk,
            integrityOk,
            trustedCa,
        };
    }

    printTitle("Catatan interpretasi (biar nyambung dengan output Python kamu)");
    console.log(
        [
            "- Kalau Crypto OK = true:",
            "  artinya signature CMS valid terhadap bytes yang ditentukan oleh /ByteRange (secara kriptografi cocok).",
            "- Kalau Integrity OK = true:",
            "  artinya (best-effort) dokumen tidak berubah pada area yang ditandatangani (sesuai ByteRange).",
            "- Trusted CA? = false:",
            "  artinya script ini BELUM melakukan validasi rantai sertifikat sampai root CA yang kamu percaya.",
            "  (Sama dengan Python kamu: Trusted CA? False).",
            "",
            "Identitas 'siapa yang tanda tangan':",
            "- Lihat Subject certificate.",
            "  * e-meterai biasanya subject = entitas meterai (bukan orang).",
            "  * signature personal biasanya subject punya CN orang (contoh: Ghufron Akbar Maulana).",
        ].join("\n")
    );
}

main().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
});
