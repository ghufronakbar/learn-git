# Case 1
## Pertanyaan
![Q1](https://media.discordapp.net/attachments/1450436180729528381/1451469931957846187/image.png?ex=69464a36&is=6944f8b6&hm=262ae7896458e1f555eb1632e4f12c0dc5e3fa4aac40bd182637d340028b9a41&=&format=webp&quality=lossless&width=2192&height=1314)

**Bagaimana developer B, dapat mengambil dependensi atau fitur yang dikerjakan developer A**

### Studi Kasus
Disini saya mensimulasikan pada sebuah `repository`. Pada repository ini ada 2 akun, yaitu:
- `ghufronakbar` (selanjutnya disebut `Dev A`)
- `lansProdigy` (selanjutnya disebut `Dev B`)

Repository dibuat oleh `Dev A`, `repository` ini berisikan tentang `ecommerce` yang telah diinisiasi di branch `main` dan `development`. Untuk `case` simple saja, direncanakan memiliki module/service:
1. `ProductService` dengan method:
- `getAllProducts`
- `getProductById`
- `createProduct`
- `editProduct`

2 `CheckoutService` dengan method:
- `getAllHistoriesCheckout`
- `getHistoryById`
- `createCheckout`

`Dev A` memiliki responsibility untuk mengerjakan fitur `ProductService` dan `Dev B` memiliki responsibility untuk mengerjakan fitur `CheckoutService`.

Dalam case ini `CheckoutService` memiliki ketergantungan terhadap `ProductService`, terutama dalam `ProductService.createCheckout` yang dimana perlu `method` dari `ProductService.getProductById` untuk logika bisnisnya.

### Langkah Awal
1. `Dev A` melakukan checkout dari `main` dan membuat branch `feat/product`
2. `Dev A` melakukan develop feature sampai jadi
3. `feat/product` masih dalam tahap `branch` belum ada review atau pull ke `main`

### Masalah
**`Dev B` ingin melakukan development untuk `CheckoutService` tetapi di `main` belum ada**

### Solusi

![Solusi1](https://res.cloudinary.com/dga0wmldp/image/upload/v1766155968/7abea0b1-4b3b-493e-a8c0-935ed9451991.png)

Solusi yang saya ambil disini:
1. Checkout Branch

`Dev B` tetap melakukan checkout dari `main` ke `feature/checkout` seperti biasa

2. Publish Branch (Opsional)

Disini `Dev B` melakukan `publish branch` terlebih dahulu, saya melakukan agar lebih rapi dan membuat branch tersebut terlebih dahulu agar sudah ada informasi bahwa feature `checkout` sedang dikerjakan

3. Fetch Origin

`Dev B` melakukan `git fetch origin` untuk mendapatkan change terbaru dahulu dari `repository` yang sudah dipublish


4. Rebase

`Dev B` melakukan `git rebase origin/feat/product` untuk menyusun ulang `history commit` agar branch `feature/checkout` memiliki `history commit` dari `feature/product`, sehingga `history commit` tetap linear dan tidak bercabang

5. Push

`Dev B` melakukan `git push --force-with-lease` untuk melakukan push ke branch `feat/checkout` yang dimana termasuk history dari commit `feat/product`

6. Melakukan Development

`Dev B` lanjut melakukan development untuk `CheckoutService` seperti biasa

7. Push Feature

`Dev B` lanjut melakukan commit dan push feature untuk `feat/checkout` seperti biasa

### Apa yang terjadi pada `Pull Request`?
![SS1](https://res.cloudinary.com/dga0wmldp/image/upload/v1766154303/Screenshot_2025-12-19_at_21.24.57_nfmmrd.png)

Ketika `Dev A` melakukan `PR` untuk `feat/product` dan disudah disetujui pada branch `development`. Lalu `Dev B` melakukan `PR`, maka `commit changes` hanya ada pada code yang ditulis oleh `Dev B` karena `history commit` pada `feature/product` sudah di `rebase` sehingga commit tetap linear.

### Cara Lain
`Dev A` membuat sebuah abstraksi/kontrak (seperti `interface` untuk di implement ke `Class`) dari fitur yang akan di-develop terlebih dahulu. Sehingga `Dev B` tidak perlu menunggu `Dev A` hingga selesai melakukan develop `ProductService`

1. Dev A buat branch dari main (feat/product-contract) berisi:

- `interface` / `signature method` (getProductById, dsb.)

- `model/DTO` yang dibutuhkan (Product, ProductId, CheckoutRequest)

- implementation yang return dummy / throw NotImplementedError

2. `Dev A` buat `PR` kecil ke development dan merge cepat.

3. `Dev B` tetap buat branch dari main ke `feat/checkout`, lalu sync dengan development `merge`/`rebase` untuk dapat kontrak terbaru.

4. `Dev B` implement `CheckoutService` berdasarkan kontrak tersebut.

5. `Dev A` lanjut implementasi sebenarnya di branch `feat/product`, lalu PR ke development.

#### Kenapa cara ini:

- Mengurangi `blocking` antar dev (`Dev B` bisa jalan paralel).

- `PR` lebih kecil, review lebih cepat.

- Mengurangi konflik besar karena semua dev sudah pakai kontrak yang sama.



# Case 2
## Pertanyaan
![Q2](https://cdn.discordapp.com/attachments/1450436180729528381/1451469932234674238/image.png?ex=69464a36&is=6944f8b6&hm=948522059422ebf615e4b174e1dcbfbef2513bfde0663d7c49b4651aa06dbe70&)

**Bagaimana caranya agar hotifx bisa langsung ke production tanpa melewati staging/UAT**

### Studi Kasus
Pada Jum'at sore 15:00 ada bug krusial di `production` terutama pada `ProductService` yang sebelumnya dihandle oleh `Dev A`. `Dev A` bertanggung jawab atas bug itu sehingga dia melakukan `hotfix`. Karena ini bug krusial, maka `hotfix` ditujukan langsung ke `production` tanpa melalui branch `development`.

### Langkah Awal
1. `Dev A` membuat sebuah bug krusial pada `feat/product`
2. Brach `feat/product` dengan bug krusial tersebut lolos `PR` dari `development` hingga ke `main`

### Masalah
**Bug krusial pada `main` harus di-fix segera tetapi bukannya jika langsung ke main akan mengacaukan flow ataupun saat rilis selanjutnya bisa terjadi bug karena pada development fixbug belum diimplementasikan**

### Solusi

![Solusi2](https://res.cloudinary.com/dga0wmldp/image/upload/v1766160590/24935cec-ae2e-42e9-9e0e-3eae312d11e0.png)

Solusi yang saya ambil disini:
1. Checkout Branch Dari Main

`Dev A` tetap melakukan checkout dari `main` ke `fix/hotfix-product` untuk membuat branch `fix` dengan command `git checkout -b fix/hotfix-product`

2. Melakukan Fixing

`Dev A` melakukan fixing bug yang terjadi

3. Melakukan Commit, Push, dan Publish Branch

`Dev A` melakukan push ke branch `fix/hotfix-product`

4. Melakukan `Pull Request`

`Dev A` melakukan `PR` langsung ke `main` yang dimana ekspetasinya `bug` itu sudah tiada dan tested

5. Menyetujui `PR`

Senior atau yang memiliki akses terhadap approval branch `main` melakukan `approve` terhadap `PR` yang sudah dibuat

6. Masalah Muncul

Masalah yang di-ekspektasikan di awal muncul, yaitu **Bagaimana caranya agar `development` juga sejalan dengan `main`**

7A. Merge `main` ke `development`
- 

- `Dev A` melakukan checkout dan pull `development` untuk mendapatkan kondisi up-to-date `development` saat ini. 
```
git fetch origin
git checkout development
git pull origin development
```
- Lalu melakukan merge dengan `main` dan lakukan `push`
```
git merge origin/main
git push
```
*Bisa jika `development` tidak ada perubahan atau minim*

7B. Cherry Pick

- Metode ini lebih memungkinkan jika `development` sudah jauh berbeda dan ingin mengambil `hotfix` saja.

- `Dev A` melakukan checkout dan pull `development` untuk mendapatkan kondisi up-to-date `development` saat ini. 
```
git checkout development
git pull origin development
```
- Mencari `SHA` pada commit `hotfix`pada branch `main`
```
git checkout main
git pull origin main
git log --oneline -10
```
- Lalu outputnya seperti berikut:
![SHA History](https://res.cloudinary.com/dga0wmldp/image/upload/v1766158944/Screenshot_2025-12-19_at_22.42.16_b1mig9.png)

- Catat `SHA` yang diperlukan

`4f0cade`

- Kembali ke branch `development`

`git checkout development`

- Melakukan Cherry Pick untuk mengambil `commit` yang diperlukan

`git cherry-pick 4f0cade`

- Jika ada `conflict` bisa dibereskan terlebih dahulu menggunakan `merge editor`

- Melakukan push/sync changes ke branch `development`

- Membuat `Pull Request` baru untuk melakukan `merge` dari `development` ke `main` agar sikron antara `development` dan `main`


# Lampiran

### Git Graph

![Git Graph](https://res.cloudinary.com/dga0wmldp/image/upload/v1766160700/Screenshot_2025-12-19_at_23.11.31_dptekv.png)
