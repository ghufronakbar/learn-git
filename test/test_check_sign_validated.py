# test/test_check_sign_validated.py
from pathlib import Path
import logging

from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko_certvalidator import ValidationContext

# (opsional) biar output nggak rame stack trace dari cert path building
logging.getLogger("pyhanko_certvalidator").setLevel(logging.ERROR)
logging.getLogger("pyhanko.sign.validation").setLevel(logging.ERROR)

pdf_path = Path(__file__).parent / "signed_contract.pdf"

# kosong = sengaja bikin trust check gagal (trusted=False)
signer_vc = ValidationContext(trust_roots=[], allow_fetching=False)  # :contentReference[oaicite:6]{index=6}

with open(pdf_path, "rb") as f:
    r = PdfFileReader(f)

    for emb in r.embedded_signatures:
        status = validate_pdf_signature(emb, signer_validation_context=signer_vc)  # :contentReference[oaicite:7]{index=7}

        cert = status.signing_cert

        # "waktu tanda tangan" best-effort:
        signing_dt = None
        if status.timestamp_validity is not None:
            signing_dt = status.timestamp_validity.timestamp
        else:
            signing_dt = status.signer_reported_dt  # :contentReference[oaicite:8]{index=8}

        print("\nSignature field:", emb.field_name)
        print("  Subject:", cert.subject.human_friendly)
        print("  Issuer :", cert.issuer.human_friendly)
        print("  Signing time (best-effort):", signing_dt)

        print("  Integrity OK:", status.intact)
        print("  Crypto OK   :", status.valid)
        print("  Trusted CA? :", status.trusted)  # ada properti trusted :contentReference[oaicite:9]{index=9}
