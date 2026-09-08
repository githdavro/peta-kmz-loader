// Entry point untuk jalan lokal (bukan di Vercel): `npm run dev`
const app = require('./index');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend peta-kmz jalan di http://localhost:${PORT}`);
});
