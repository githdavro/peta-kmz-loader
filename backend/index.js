// Express app (dipakai untuk lokal via server.js, dan untuk deploy ke Vercel
// lewat vercel.json yang mengarahkan semua request ke file ini).
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const DATA_DIR = path.join(__dirname, 'data');

// GET /api/kmz-files -> daftar nama file .kmz/.kml di folder data/
app.get('/api/kmz-files', (req, res) => {
  try {
    const entries = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
    const files = entries.filter((name) => {
      const lower = name.toLowerCase();
      return lower.endsWith('.kmz') || lower.endsWith('.kml');
    });
    res.status(200).json({ files });
  } catch (err) {
    // Jangan sampai error di sini bikin frontend crash — kembalikan list kosong,
    // nanti otomatis fallback ke mode upload manual.
    res.status(200).json({ files: [], error: String((err && err.message) || err) });
  }
});

// GET /api/kmz-file?name=namafile.kmz -> isi binary file dari folder data/
app.get('/api/kmz-file', (req, res) => {
  const name = req.query && req.query.name;

  if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ error: 'Nama file tidak valid' });
  }

  try {
    const filePath = path.join(DATA_DIR, name);

    // Pastikan hasil resolusi path tetap di dalam folder data/ (anti path traversal)
    if (!filePath.startsWith(DATA_DIR + path.sep) && filePath !== DATA_DIR) {
      return res.status(400).json({ error: 'Nama file tidak valid' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File tidak ditemukan' });
    }

    const buffer = fs.readFileSync(filePath);
    const lower = name.toLowerCase();
    const contentType = lower.endsWith('.kmz')
      ? 'application/vnd.google-earth.kmz'
      : lower.endsWith('.kml')
      ? 'application/vnd.google-earth.kml+xml'
      : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
});

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'peta-kmz-backend' });
});

module.exports = app;
