# TL;DR

## Macam key
- `.key` = private key untuk buat sign
- `.crt` = identity untuk buat pubkey, subject, issuer, validFrom & validTo (menggunakan .key untuk membuatnya)
- `.p12` container yang isinya .key .crt di protect password

*untuk rotasi sama, buat `.key` `.crt` `.p12` secara berurutan*

## Fungsi key di code
- `.crt` untuk validasi esign terutama untuk `trustedByOwnCA` / `.crt` internal kita sendiri 
- `.p12` untuk attempt esign (terutama untuk kebanyakan libs karena sudah memuat keduanya)

## Pustaka
- exp adalah expired date `.crt` nya. semisal `.crt` exp 30 hari dibuat pada tanggal **01-01-2026** maka exp **31-01-2026**, dan dokumen yang di tanda tangani pada tanggal **05-01-2026**, certnya juga exp **31-01-2026**

## Question
*setelah exp apakah masih bisa attempt esign?*
-> masih bisa dan valid secara kriptografi, tapi seperti yg dijelaskan di pustaka, dia exp & masih bisa di cek validitasnya

## Note
- untuk signed time, itu pakai timestamptz server,  secara policy hanya berlaku di internal bukan universal. jika ingin universal harus pakai trusted timestamp (tsa/rfc3161)

## Performance
- Generate PDF (pdf-lib create template) : CPU low, RAM medium
- Processing Image (sharp) : CPU high, RAM medium
- Add Placeholder (pdflibAddPlaceholder) : CPU low, RAM low
- Signing PKCS#7 pakai P12 (@signpdf/* + P12Signer) : CPU high, RAM medium
- Validate/verify signature (ByteRange check + PKI.js verify) : CPU high, RAM medium

## Task Note
- Trusted CA by own certificate ✅ (bisa nanti tinggal menambahkan `X509Certificate` dari `.crt` sebagai validator)
- Backward compatible ✅ (bisa, simpan versi yang sesuai dan sesuaikan `.crt` yang digunakan pada row data)