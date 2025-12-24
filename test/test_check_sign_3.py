# test/test_check_sign_3.py
from pathlib import Path
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko_certvalidator import ValidationContext

pdf_path = Path(__file__).parent / "signed_contract.pdf"

# 🔥 Empty trust store = skip CA validation
signer_vc = ValidationContext(
    trust_roots=[],
    allow_fetching=False
)

with open(pdf_path, "rb") as f:
    reader = PdfFileReader(f)
    sigs = reader.embedded_signatures

    for sig in sigs:
        status = validate_pdf_signature(
            sig,
            signer_validation_context=signer_vc  # ✅ INI YANG BENAR
        )

        cert = status.signing_cert

        print("\nSignature field:", sig.field_name)
        print("  Subject:", cert.subject.human_friendly)
        print("  Issuer :", cert.issuer.human_friendly)
        print("  Signing time:", status.signing_time)
        print("  Integrity OK:", status.intact)
        print("  Cryptographically OK:", status.valid)
