# 1) buat private key
openssl genrsa -out dev.key 2048

# 2) buat self-signed cert (valid 2 tahun)
openssl req -new -x509 -key dev.key -out dev.crt -days 730 \
  -subj "/C=ID/O=MyCompany/OU=Warehouse/CN=Warehouse Manager Dev"

# 3) bundel jadi PKCS#12 (.p12)
openssl pkcs12 -export -out dev.p12 -inkey dev.key -in dev.crt \
  -passout pass:devpass


src/secret/signing/
  dev.key   # private key (RAHASIA)
  dev.crt   # certificate (public, tapi tetap jangan di-commit kalau gak perlu)
  dev.p12   # bundle cert+private key (ini yang paling praktis dipakai buat signing)
  README.md
