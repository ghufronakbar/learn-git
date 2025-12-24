# test/test_who_signed.py
from pathlib import Path
from pyhanko.pdf_utils.reader import PdfFileReader

pdf_path = Path(__file__).parent / "signed_contract.pdf"

with open(pdf_path, "rb") as f:
    r = PdfFileReader(f)

    for emb in r.embedded_signatures:
        cert = emb.signer_cert  # certificate of the signer :contentReference[oaicite:2]{index=2}

        print("\nSignature field:", emb.field_name)
        print("  Subject:", cert.subject.human_friendly)
        print("  Issuer :", cert.issuer.human_friendly)

        # waktu yang dilaporkan signer (kalau ada)
        print("  Signer-reported time:", emb.self_reported_timestamp)  # :contentReference[oaicite:3]{index=3}

        # kadang PDF juga punya metadata /Name atau /M (tidak selalu ada)
        so = emb.sig_object
        print("  PDF /Name:", so.get("/Name"))
        print("  PDF /M   :", so.get("/M"))
