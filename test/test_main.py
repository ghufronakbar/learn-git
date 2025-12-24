# test/test_main.py
"""
check_pdf_signatures.py  (pyHanko 0.32.0 compatible)

Tujuan file ini:
1) "WHO SIGNED" mode:
   - Baca sertifikat penanda tangan (Subject/Issuer)
   - Baca metadata signature di PDF (mis. /Name, /M)
   - Baca waktu yang "dilaporkan" (self_reported_timestamp) -> ini bukan bukti trust, hanya klaim di signature

2) "VALIDATED" mode:
   - Integrity check (status.intact): apakah byte-range yang ditandatangani masih cocok
   - Crypto check (status.valid): apakah signature mathematically/cryptographically valid
   - Trust check (status.trusted): apakah chain sertifikat bisa dibangun ke trust root yang kita percayai

Catatan penting:
- Di script ini, trust_roots = [] (kosong), jadi status.trusted hampir pasti False
  (Bukan berarti signature jelek; hanya berarti "kita belum punya trust anchor/CA store").
"""

from __future__ import annotations

from pathlib import Path
import sys
import logging

from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext


def classify_signature(field_name: str, pdf_name_value: str | None, subject_hf: str) -> str:
    """
    Klasifikasi sederhana biar gampang kebaca:
    - Kalau field name prefix "Emet" atau PDF /Name = e-meterai_signatures atau subject mengandung "Meterai Elektronik"
      -> kemungkinan besar ini signature meterai (stamp/service), bukan orang.
    - Selain itu -> kemungkinan personal/organisasi.
    """
    subj = (subject_hf or "").lower()
    pdfn = (pdf_name_value or "").lower()
    if field_name.startswith("Emet") or "e-meterai" in pdfn or "meterai elektronik" in subj:
        return "E-METERAI / STAMP (bukan orang)"
    return "PERSONAL / ORGANISASI"


def best_effort_signing_time(status) -> str:
    """
    Di pyHanko 0.32.0 tidak ada status.signing_time.
    Yang tersedia:
      - status.timestamp_validity.timestamp (kalau ada timestamp token TSA dan diproses)
      - status.signer_reported_dt (waktu yang dilaporkan signer)
    """
    # timestamp_validity bisa None
    tv = getattr(status, "timestamp_validity", None)
    if tv is not None:
        ts = getattr(tv, "timestamp", None)
        if ts is not None:
            return f"{ts}  (from TSA timestamp token)"
    # fallback: signer_reported_dt
    srdt = getattr(status, "signer_reported_dt", None)
    if srdt is not None:
        return f"{srdt}  (signer-reported, not independently trusted)"
    return "N/A"


def main():
    # --- Optional: rapihin log supaya tidak spam stack trace path building ---
    logging.getLogger("pyhanko_certvalidator").setLevel(logging.ERROR)
    logging.getLogger("pyhanko.sign.validation").setLevel(logging.ERROR)

    # --- Tentukan path PDF ---
    default_pdf = Path(__file__).parent / "signed_contract.pdf"
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_pdf

    if not pdf_path.exists():
        print(f"ERROR: PDF not found: {pdf_path}")
        sys.exit(1)

    # --- ValidationContext ---
    # Trust roots kosong = kita "skip trust decision" (hasil trusted=False),
    # tapi tetap bisa cek intact/crypto validity.
    signer_vc = ValidationContext(trust_roots=[], allow_fetching=False)
    ts_vc = ValidationContext(trust_roots=[], allow_fetching=False)  # timestamp (TSA) context

    with open(pdf_path, "rb") as f:
        reader = PdfFileReader(f)
        embedded = reader.embedded_signatures

        if not embedded:
            print("No embedded signatures found.")
            return

        print(f"Found {len(embedded)} embedded signatures in: {pdf_path}\n")

        for idx, emb in enumerate(embedded, start=1):
            # =========================================================
            # PART A: WHO SIGNED (tanpa validasi)
            # =========================================================
            # signer_cert = certificate that claims to sign
            cert = emb.signer_cert
            subject_hf = cert.subject.human_friendly
            issuer_hf = cert.issuer.human_friendly

            sig_obj = emb.sig_object  # raw PDF signature dictionary
            pdf_name = sig_obj.get("/Name")  # kadang vendor name, mis. "VIDA" / "e-meterai_signatures"
            pdf_m = sig_obj.get("/M")        # PDF signing time string "D:YYYY..."

            # self_reported_timestamp: waktu yang diklaim signer di signature
            # (mirip dengan /M tapi bisa beda representation)
            srt = getattr(emb, "self_reported_timestamp", None)

            signature_type = classify_signature(emb.field_name, pdf_name, subject_hf)

            print("=" * 70)
            print(f"[{idx}] Signature field: {emb.field_name}")
            print(f"    Type guess: {signature_type}")
            print("    --- WHO SIGNED (raw reading) ---")
            print(f"    Subject (who): {subject_hf}")
            print(f"    Issuer  (CA) : {issuer_hf}")
            print(f"    PDF /Name    : {pdf_name}")
            print(f"    PDF /M       : {pdf_m}")
            print(f"    Self-reported time: {srt}")
            print()

            # =========================================================
            # PART B: VALIDATED (integrity, crypto, trust)
            # =========================================================
            # Ini yang bedain "sekadar baca info" vs "beneran validasi signature"
            #
            # - intact: dokumen (byte-range) masih sesuai saat ditandatangani
            # - valid : signature cryptographically valid terhadap public key di cert
            # - trusted: chain cert bisa ditelusuri sampai trust root yang kita percaya
            #
            # Karena trust_roots=[] -> trusted hampir pasti False.
            try:
                status = validate_pdf_signature(
                    emb,
                    signer_validation_context=signer_vc,
                    ts_validation_context=ts_vc,
                )
            except TypeError as e:
                # kalau environment beda / argumen tidak cocok
                print("    ERROR calling validate_pdf_signature():", e)
                continue
            except Exception as e:
                print("    Unexpected validation error:", repr(e))
                continue

            print("    --- VALIDATED (pyHanko) ---")
            print(f"    Integrity OK (status.intact): {getattr(status, 'intact', None)}")
            print(f"    Crypto OK    (status.valid) : {getattr(status, 'valid', None)}")
            print(f"    Trusted CA?  (status.trusted): {getattr(status, 'trusted', None)}")
            print(f"    Signing time (best-effort): {best_effort_signing_time(status)}")

            # =========================================================
            # PART C: "Penilaian" sederhana (human readable)
            # =========================================================
            intact = bool(getattr(status, "intact", False))
            crypto_ok = bool(getattr(status, "valid", False))
            trusted = bool(getattr(status, "trusted", False))

            # Penilaian:
            # - Kalau intact & crypto_ok -> teknis signature valid
            # - trusted True -> valid + dipercaya menurut trust store kita
            if intact and crypto_ok and trusted:
                verdict = "✅ VALID + TRUSTED (secara kripto & dipercaya trust store kamu)"
            elif intact and crypto_ok and not trusted:
                verdict = (
                    "✅ VALID secara kriptografi, tapi ❌ belum TRUSTED (trust_roots kosong / CA belum ditambahkan)"
                )
            elif intact and not crypto_ok:
                verdict = "⚠️ INTACT tapi signature gagal diverifikasi kripto (kemungkinan issue signature/cert)"
            else:
                verdict = "❌ TAMPERED / INVALID (intact=False) atau gagal validasi"

            print(f"    Verdict: {verdict}")

            # Tambahan interpretasi:
            if signature_type.startswith("E-METERAI"):
                print("    Note: Ini terlihat seperti signature layanan e-meterai (stamp), bukan tanda tangan orang.")
            else:
                print("    Note: Ini terlihat seperti tanda tangan personal/organisasi (cek CN/Subject).")

            print()

        print("=" * 70)
        print("DONE.")
        print(
            "\nTips:\n"
            "- Kalau kamu ingin Trusted CA? = True, kamu harus menambahkan trust roots CA terkait\n"
            "  (mis. root/intermediate VIDA, Peruri/Kominfo chain) ke ValidationContext.\n"
            "- Saat ini trust_roots=[] sengaja dipakai agar kita tetap bisa cek 'intact' & 'valid'\n"
            "  tanpa bergantung pada trust store OS."
        )


if __name__ == "__main__":
    main()
