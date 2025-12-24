# test/test_check_sign_1.py
from pathlib import Path
from pypdf import PdfReader

pdf_path = Path(__file__).parent / "signed_contract.pdf"
reader = PdfReader(pdf_path)

fields = reader.get_fields() or {}
sig_fields = [f for f in fields.values() if f.field_type == "/Sig"]

for sig in sig_fields:
    sig_dict = sig.get_object()
    print("Field name:", sig.name)
    print("SubFilter:", sig_dict.get("/SubFilter"))
    print("Name:", sig_dict.get("/Name"))
    print("M (signing time):", sig_dict.get("/M"))
    print("-" * 40)
