// Native Vercel Serverless Function. Semua request /api/* dilempar ke sini
// lewat rewrites di vercel.json, lalu Express yang nentuin routing internalnya
// (rute di backend/index.js sudah pakai prefix /api/... jadi cocok langsung).
module.exports = require('../backend/index.js');
