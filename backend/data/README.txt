Taruh file .kmz atau .kml kamu di folder ini.

Aturan:
- Boleh lebih dari satu file — semuanya akan digabung dan ditampilkan sekaligus
  di peta saat halaman dibuka.
- Nama file bebas, ekstensi harus .kmz atau .kml.
- Setelah menambah/mengganti file di sini, deploy ulang project ke Vercel
  (git push, atau `vercel --prod`) supaya perubahan terbaca — ini hosting
  statis + serverless function, bukan server yang selalu memindai folder
  secara live.

Kalau folder ini kosong, halaman otomatis kembali ke mode upload manual
(tombol "Buka file KMZ / KML" / drag & drop) — tidak akan error.
