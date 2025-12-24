// test/test-ninja.ts
//
// Gabungan 2 mode:
//
// (A) RAW / META (best-effort):
//     - Coba ambil nama field signature (/T) + PDF signature dictionary (/V)
//     - Ambil /Name dan /M langsung dari PDF (tanpa validasi kriptografi)
//
// (B) VALIDATED (pakai @ninja-labs/verify-pdf):
//     - integrity     : dokumen tidak diubah setelah signature (ByteRange cocok)
//     - authenticity  : chain certificate sampai root CA tepercaya
//     - expired       : ada cert yang expired
//     - verified      : status overall
//
// Cara pakai:
//   npm i -D typescript ts-node @types/node
//   npm i @ninja-labs/verify-pdf
//   npx ts-node test/test-main.ts test/signed_contract.pdf
//
// Kalau tidak kasih argumen, default: test/signed_contract.pdf

import fs from "node:fs";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import verifyPDF from "@ninja-labs/verify-pdf";

type RawSigMeta = {
    fieldName: string;
    vRef?: string;        // contoh: "12 0 R"
    pdfName?: string;     // /Name
    pdfM?: string;        // /M (PDF date string)
    signerReportedTime?: Date; // parsed dari /M
};

function parsePdfDate(pdfDate: string): Date | null {
    // Support PDF date format:
    // D:YYYYMMDDHHmmSSOHH'mm' (O = + / -), atau Z
    // Komponen bisa tidak lengkap (PDF spec mengizinkan), kita default-kan.

    try {
        let s = pdfDate.trim();

        // buang null byte kalau ada
        s = s.replace(/\0/g, "");

        if (s.startsWith("D:")) s = s.slice(2);

        // ambil komponen date secara fleksibel
        // YYYY (required), sisanya optional
        const m = s.match(
            /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([\s\S]*)?$/
        );
        if (!m) return null;

        const year = Number(m[1]);
        const month = m[2] ? Number(m[2]) : 1;
        const day = m[3] ? Number(m[3]) : 1;
        const hour = m[4] ? Number(m[4]) : 0;
        const minute = m[5] ? Number(m[5]) : 0;
        const second = m[6] ? Number(m[6]) : 0;

        // validasi range dasar
        if (
            !Number.isFinite(year) ||
            month < 1 || month > 12 ||
            day < 1 || day > 31 ||
            hour < 0 || hour > 23 ||
            minute < 0 || minute > 59 ||
            second < 0 || second > 59
        ) {
            return null;
        }

        const tzRaw = (m[7] ?? "").trim();
        if (!tzRaw) {
            const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
            return Number.isFinite(dt.getTime()) ? dt : null;
        }

        if (tzRaw.startsWith("Z")) {
            const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
            return Number.isFinite(dt.getTime()) ? dt : null;
        }

        // contoh: +07'00' atau +07'00 or +0700
        const tzMatch = tzRaw.match(/^([+\-])(\d{2})'?(\d{2})'?/);
        if (!tzMatch) {
            const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
            return Number.isFinite(dt.getTime()) ? dt : null;
        }

        const sign = tzMatch[1] === "+" ? 1 : -1;
        const tzh = Number(tzMatch[2]);
        const tzm = Number(tzMatch[3]);

        if (tzh < 0 || tzh > 23 || tzm < 0 || tzm > 59) return null;

        const offsetMinutes = sign * (tzh * 60 + tzm);

        // local time with offset → UTC
        const utcMs =
            Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;

        const dt = new Date(utcMs);
        return Number.isFinite(dt.getTime()) ? dt : null;
    } catch {
        return null;
    }
}


function isValidDate(d: unknown): d is Date {
    return d instanceof Date && Number.isFinite(d.getTime());
}

function hexToLatin1String(hex: string): string {
    // PDF bisa simpan string sebagai <...> (hex string). Kita decode jadi bytes (latin1).
    const clean = hex.replace(/\s+/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 2) {
        bytes.push(parseInt(clean.slice(i, i + 2), 16));
    }
    return Buffer.from(bytes).toString("latin1");
}

function extractRawSignatureMeta(pdfBuffer: Buffer): RawSigMeta[] {
    // Best-effort parsing (regex scanning), bukan parser PDF full.
    // Tapi sering cukup untuk kasus umum: field /FT /Sig punya /T dan /V (obj ref),
    // lalu signature dictionary (obj /V) punya /Name dan /M.

    const pdfText = pdfBuffer.toString("latin1");
    const results: RawSigMeta[] = [];

    // Cari field signature: "/FT /Sig ... /T (fieldName) ... /V 12 0 R"
    const sigFieldRegex =
        /\/FT\s*\/Sig[\s\S]{0,2500}?\/T\s*(\(([^)]*)\)|<([0-9A-Fa-f\s]+)>)[\s\S]{0,2500}?\/V\s*([0-9]+\s+[0-9]+\s+R)/g;

    let m: RegExpExecArray | null;
    while ((m = sigFieldRegex.exec(pdfText)) !== null) {
        const parenName = m[2];
        const hexName = m[3];
        const fieldName = parenName ?? (hexName ? hexToLatin1String(hexName) : "UNKNOWN");
        const vRef = m[4];

        results.push({ fieldName, vRef });
    }

    // Untuk tiap field yang punya /V ref, cari object-nya dan ambil /Name, /M
    for (const r of results) {
        if (!r.vRef) continue;
        const refMatch = r.vRef.match(/(\d+)\s+(\d+)\s+R/);
        if (!refMatch) continue;

        const objNum = refMatch[1];
        const genNum = refMatch[2];

        const objRegex = new RegExp(
            String.raw`${objNum}\s+${genNum}\s+obj[\s\S]*?endobj`,
            "g"
        );
        const objBlock = objRegex.exec(pdfText)?.[0];
        if (!objBlock) continue;

        // /Name bisa (.. ) atau <...>
        const nameMatch = objBlock.match(/\/Name\s*(\(([^)]*)\)|<([0-9A-Fa-f\s]+)>)/);
        if (nameMatch) {
            r.pdfName = nameMatch[2] ?? (nameMatch[3] ? hexToLatin1String(nameMatch[3]) : undefined);
        }

        const mMatch = objBlock.match(/\/M\s*(\(([^)]*)\)|<([0-9A-Fa-f\s]+)>)/);
        if (mMatch) {
            r.pdfM = mMatch[2] ?? (mMatch[3] ? hexToLatin1String(mMatch[3]) : undefined);
            if (r.pdfM) {
                r.signerReportedTime = parsePdfDate(r.pdfM) ?? undefined;
            }
        }
    }

    return results;
}

function printSectionTitle(title: string) {
    console.log("\n" + "=".repeat(80));
    console.log(title);
    console.log("=".repeat(80));
}

function safeX509FromPem(pem?: string): X509Certificate | null {
    try {
        if (!pem) return null;
        return new X509Certificate(pem);
    } catch {
        return null;
    }
}

function pickSignerCert(signatureItem: any): any | null {
    // verify-pdf biasanya mengembalikan certificates/chain; kita ambil yang clientCertificate=true kalau ada.
    const certs: any[] =
        signatureItem?.certificates ??
        signatureItem?.certificateChain ??
        signatureItem?.certs ??
        [];

    if (!Array.isArray(certs) || certs.length === 0) return null;
    return certs.find((c) => c.clientCertificate) ?? certs[0];
}

function normalizeSignaturesArray(verifyOut: any): any[] {
    const s = verifyOut?.signatures;
    if (!s) return [];
    return Array.isArray(s) ? s : [s];
}

async function main() {
    const inputArg = process.argv[2];
    const pdfPath = inputArg
        ? path.resolve(process.cwd(), inputArg)
        : path.resolve(process.cwd(), "test/signed_contract.pdf");

    if (!fs.existsSync(pdfPath)) {
        console.error(`PDF not found: ${pdfPath}`);
        process.exit(1);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);

    // (A) RAW META
    printSectionTitle("(A) RAW META (best-effort dari struktur PDF)");
    const rawMetas = extractRawSignatureMeta(pdfBuffer);

    if (rawMetas.length === 0) {
        console.log("Tidak ketemu /FT /Sig via regex scanning. (PDF bisa pakai struktur lain)");
    } else {
        for (const r of rawMetas) {
            console.log(`\nSignature field: ${r.fieldName}`);
            if (isValidDate(r.signerReportedTime)) {
                console.log(`  Signer-reported time (parsed): ${r.signerReportedTime.toISOString()}`);
            } else if (r.pdfM) {
                console.log(`  Signer-reported time (parsed): (failed to parse) raw=${r.pdfM}`);
            }

            if (r.pdfName) console.log(`  PDF /Name: ${r.pdfName}`);
            if (r.pdfM) console.log(`  PDF /M   : ${r.pdfM}`);
            if (!r.pdfM && !r.pdfName) {
                console.log("  (Tidak berhasil extract /Name atau /M dari signature dictionary)");
            }
        }
    }

    // (B) VALIDATED (verify-pdf)
    printSectionTitle("(B) VALIDATED (pakai @ninja-labs/verify-pdf)");

    const verifyOut: any = verifyPDF(pdfBuffer);
    const { verified, authenticity, integrity, expired } = verifyOut;

    console.log("Overall result:");
    console.log("  integrity    :", Boolean(integrity));
    console.log("  authenticity :", Boolean(authenticity));
    console.log("  expired      :", Boolean(expired));
    console.log("  verified     :", Boolean(verified));

    const sigs = normalizeSignaturesArray(verifyOut);

    if (sigs.length === 0) {
        console.log("\nTidak ada signatures[] dari verify-pdf.");
        return;
    }

    // coba mapping signature → fieldName berdasarkan urutan (best-effort)
    const rawByIndex = rawMetas.length === sigs.length ? rawMetas : [];

    for (let i = 0; i < sigs.length; i++) {
        const sigItem = sigs[i];
        const signerCertInfo = pickSignerCert(sigItem);

        const pem = signerCertInfo?.pemCertificate as string | undefined;
        const x509 = safeX509FromPem(pem);

        const issuedTo = signerCertInfo?.issuedTo;
        const issuedBy = signerCertInfo?.issuedBy;

        const signatureMeta = sigItem?.signatureMeta ?? sigItem?.meta ?? {};
        const metaName = signatureMeta?.Name ?? signatureMeta?.name; // biasanya "Name" dari PDF signature dict

        // fieldName: dari RAW meta kalau bisa
        const fieldName = rawByIndex[i]?.fieldName ?? `#${i + 1}`;

        console.log(`\nSignature: ${fieldName}`);
        console.log("  Subject:", x509?.subject ?? issuedTo ?? "(unknown)");
        console.log("  Issuer :", x509?.issuer ?? issuedBy ?? "(unknown)");

        if (metaName) console.log("  PDF /Name (from signatureMeta):", metaName);

        // Kalau RAW punya /M, tampilkan juga (lebih mirip output Python kamu)
        const rawM = rawByIndex[i]?.pdfM;
        const rawTime = rawByIndex[i]?.signerReportedTime;
        if (rawM) console.log("  PDF /M (raw):", rawM);
        if (isValidDate(rawTime)) {
            console.log("  Signing time (best-effort):", rawTime.toISOString());
        } else if (rawM) {
            console.log("  Signing time (best-effort): (failed to parse) raw=", rawM);
        }


        // Interpretasi status ala output Python kamu:
        // - "Integrity OK" ~ integrity (dokumen tidak berubah relatif ke signature)
        // - "Trusted CA?"  ~ authenticity (chain ke root tepercaya)
        console.log("  Integrity OK:", Boolean(integrity));
        console.log("  Trusted CA? :", Boolean(authenticity));
        console.log("  Expired?    :", Boolean(expired));
        console.log("  Verified?   :", Boolean(verified));
    }

    printSectionTitle("Catatan interpretasi cepat");
    console.log(
        [
            "- Kalau Integrity OK = true tapi Trusted CA? = false:",
            "  artinya signature-nya secara kripto cocok (dokumen tidak ketamper),",
            "  tapi rantai sertifikat tidak bisa divalidasi sampai root CA yang dipercaya oleh library.",
            "  Ini mirip output Python kamu: Crypto OK True, Integrity OK True, Trusted CA False.",
        ].join("\n")
    );
}

main().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
});
