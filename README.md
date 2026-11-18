# Italy Frontend

Frontend monitoring distribusi dengan React, TypeScript, Vite, Tailwind CSS, Motion, dan Animate UI. Panduan desain ada di [../docs/design.md](../docs/design.md).

## Menjalankan aplikasi

Pasang dependency sekali jika belum tersedia, dan pastikan `backend/.env` sudah dikonfigurasi:

```sh
npm --prefix backend install
npm --prefix frontend install
```

Dari root project, jalankan kedua aplikasi bersamaan:

```sh
npm run dev
```

Perintah ini menjalankan backend dan frontend bersamaan. Tekan `Ctrl+C` untuk menghentikan keduanya. Backend memakai port `3001`; Vite menyajikan aplikasi di `http://127.0.0.1:5173` dan meneruskan request `/api` ke backend lokal. Jika backend memakai port lain, ubah `VITE_DEV_API_PROXY_TARGET` di `frontend/.env.local`; browser tetap memanggil path same-origin sehingga cookie dan header CSRF tetap melewati proxy dengan benar. Nilai rahasia MongoDB tetap berada di `backend/.env` dan tidak dikirim ke frontend.

## Integrasi API

- `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, dan `GET /api/v1/auth/me` untuk sesi akun.
- `GET /api/v1/shipments` untuk ringkasan, filter status, pencarian, ranking tujuan, dan paginasi.
- `GET /api/v1/shipments/:noKirim` untuk detail serta pembacaan baris sumber dengan cursor.

Access token hanya disimpan di memori halaman. Refresh menggunakan cookie HttpOnly dan header CSRF sesuai backend; token tidak disimpan di `localStorage`.

## Cakupan UI saat ini

- `/distribusi`: ringkasan status kiriman dan ranking tujuan dari API.
- `/pengiriman` dan `/penerimaan`: monitor read-only dengan pencarian, status, pagination, dan detail.
- `/distribusi/cabang`: ranking kiriman dalam proses; penjualan ditandai belum tersedia.
- `/distribusi/agent` dan `/pengaturan/sumber-data`: status kemampuan ditampilkan secara eksplisit karena endpoint terkait belum tersedia.

Jumlah pada API shipment adalah jumlah dokumen/baris sumber, bukan jumlah unit barang. Berat, tren harian, SLA, transaksi penerimaan, penjualan, Agent AI, serta CRUD alias/sumber database belum disediakan oleh backend, sehingga UI tidak mengarang nilainya atau menyediakan aksi yang belum berfungsi.
