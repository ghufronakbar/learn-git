# test/test_check_sign_2.py
from pathlib import Path
from pypdf import PdfReader
from cryptography.hazmat.primitives.serialization import pkcs7

pdf_path = Path(__file__).parent / "signed_contract.pdf"
reader = PdfReader(pdf_path)

fields = reader.get_fields() or {}

for f in fields.values():
    if f.field_type != "/Sig":
        continue

    field_obj = f.get_object()

    # 🔥 Signature dictionary ADA DI /V
    sig_dict = field_obj.get("/V")
    if sig_dict is None:
        print(f"\nSignature field {f.name} has no /V (unsigned)")
        continue

    sig_dict = sig_dict.get_object()

    # Ambil raw PKCS#7 bytes
    contents_obj = sig_dict.raw_get("/Contents")

    if hasattr(contents_obj, "original_bytes"):
        data = contents_obj.original_bytes.rstrip(b"\x00")
    else:
        data = bytes(contents_obj).rstrip(b"\x00")

    certs = pkcs7.load_der_pkcs7_certificates(data)

    print(f"\nSignature field: {f.name}")
    for cert in certs:
        print("  Subject:", cert.subject.rfc4514_string())
        print("  Issuer :", cert.issuer.rfc4514_string())
