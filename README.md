# Peta KMZ — React + Express

Versi React (frontend) + Express (backend) dari aplikasi Peta KMZ. Fitur:
upload/drag-drop file .kmz/.kml, render titik/garis/area/ground-overlay di
atas peta satelit, plus dropdown di topbar buat milih file dari folder
`data/` lewat backend — file yang dipilih doang yang di-render (bukan
semua sekaligus), ganti pilihan otomatis clear yang lama.

## Struktur

```
peta-kmz-react/
├── vercel.json   <- gabungin frontend+backend jadi satu deploy Vercel
├── frontend/     <- React + Vite (peta, sidebar, upload)
│   └── src/
│       ├── App.jsx      <- komponen utama (peta, state, upload, drag&drop)
│       ├── App.css      <- styling (port dari CSS asli)
│       └── lib/kmz.js   <- parsing KML/KMZ (JSZip, DOMParser)
└── backend/      <- Express (ganti serverless function Vercel yang lama)
    ├── index.js  <- app Express: GET /api/kmz-files, GET /api/kmz-file
    ├── server.js <- entry point buat jalan lokal (npm run dev)
    └── data/     <- taruh file .kmz / .kml di sini
```

## Jalan di lokal

Backend:
```bash
cd backend
npm install
npm run dev        # jalan di http://localhost:3001
```

Frontend (terminal terpisah):
```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3001
npm run dev             # jalan di http://localhost:5173
```

Fitur upload manual & drag-drop selalu jalan walau backend belum nyala.

## Deploy ke Vercel (satu project, satu domain)

Struktur sekarang:
- `api/index.js` — serverless function bawaan Vercel (auto-detect dari
  folder `api/` di root), tinggal re-export Express app dari `backend/`.
- `vercel.json` di root: build frontend (`frontend/dist`) sebagai static
  output, lalu rewrite semua `/api/*` ke function di atas.
- `package.json` di root: `express` + `cors` biar ke-install pas build,
  dan script `build` yang build folder `frontend/`.

**Deploy:**
1. Upload/push **seluruh folder `peta-kmz-react/`** (root-nya, isinya
   `api/`, `frontend/`, `backend/`, `vercel.json`, `package.json`) sebagai
   satu project baru di Vercel.
2. **Penting:** di layar pemilihan root/import, pastikan root project =
   root repo (jangan pilih `frontend/index.html`). Kalau ini project lama
   yang sempat kamu set root-nya ke `frontend`, buka **Project Settings >
   General > Root Directory** dan kosongkan lagi jadi `/` — kalau nggak,
   `vercel.json` di root nggak pernah kebaca.
3. Nggak perlu set `VITE_API_URL` — kosongin aja / hapus env-nya, biar
   fetch di frontend jalan ke path relatif (`/api/kmz-files`) yang otomatis
   diarahkan ke backend lewat rewrite di `vercel.json`.
4. Selesai deploy, buka domainnya — halaman peta dan endpoint `/api/...`
   udah satu domain yang sama.

## Update data

Tambah/ganti file `.kmz`/`.kml` di `backend/data/`, lalu deploy ulang
backend-nya. Halaman frontend otomatis memuatnya tanpa perlu upload
manual (asal `VITE_API_URL` mengarah ke backend yang benar).
