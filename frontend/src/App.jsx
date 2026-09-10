import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { ensureLeafletRotate } from './lib/leaflet-global.js';
import { ingestKmzBuffer, ingestKmlBuffer } from './lib/kmz.js';

const API_URL = import.meta.env.VITE_API_URL || '';

const ATTRIBUTION_TEXT = {
  Satelit: 'Leaflet  •  Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics  •  © OpenStreetMap contributors',
  Jalan: 'Leaflet  •  © OpenStreetMap contributors',
};

export default function App() {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const dataLayerRef = useRef(null);
  const assetUrlsRef = useRef([]);
  const fileInputRef = useRef(null);
  const satelliteLayerRef = useRef(null);
  const streetLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);

  const [placemarks, setPlacemarks] = useState([]);
  const [loadedSources, setLoadedSources] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: '', info: false });
  const [dropActive, setDropActive] = useState(false);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [baseLayerName, setBaseLayerName] = useState('Satelit');

  const toastTimer = useRef(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ show: true, msg, info: kind === 'info' });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 4200);
  }, []);

  // --- init map once ---
  useEffect(() => {
    let cancelled = false;
    let map;

    ensureLeafletRotate().then(() => {
      if (cancelled) return;

      map = L.map(mapElRef.current, {
        zoomControl: false,
        attributionControl: false,
        // --- rotasi bebas (leaflet-rotate) ---
        rotate: true, // aktifkan bearing/rotasi native (pan & zoom tetap jalan saat berputar)
        bearing: 0,
        touchRotate: true, // gestur 2 jari: putar sambil pinch-zoom & geser, seperti Google Maps
        rotateControl: false, // pakai tombol kustom sendiri (zr-control), bukan bawaan plugin
        shiftKeyRotate: true, // bonus desktop: shift + scroll buat putar
      }).setView([-2.5, 118], 5);
      mapRef.current = map;

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics' }
    );
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    const labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, pane: 'shadowPane' }
    );

    satelliteLayer.addTo(map);
    labelsLayer.addTo(map);
    satelliteLayerRef.current = satelliteLayer;
    streetLayerRef.current = streetLayer;
    labelsLayerRef.current = labelsLayer;

    // Label nama tempat & tombol kontrol sengaja tinggal di pane yang TIDAK ikut
    // berputar (norotatePane), jadi tulisan tetap tegak dibaca meski peta diputar
    // — sama seperti perilaku Google Maps.

    // Perubahan bearing dari pinch/gesture 2 jari harus instan (no transition,
    // biar nempel pas sama gerakan jari). Tapi klik tombol putar kiri/kanan/utara
    // itu perubahan mendadak satu langkah, jadi dikasih animasi transisi supaya
    // halus — makanya class animasi cuma dipasang sesaat lalu dilepas lagi.
    let rotateAnimTimer = null;
    function setBearingAnimated(newBearing) {
      const pane = map.getPane('rotatePane');
      if (pane) {
        pane.classList.add('rp-anim');
        clearTimeout(rotateAnimTimer);
        rotateAnimTimer = setTimeout(() => pane.classList.remove('rp-anim'), 340);
      }
      map.setBearing(newBearing);
    }
    function rotateBy(delta) {
      setBearingAnimated(map.getBearing() + delta);
    }

    const ZoomRotateControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'zr-control');
        container.innerHTML =
          '<div class="zr-btn" data-action="zoomin" title="Perbesar"><span class="material-symbols-rounded">add</span></div>' +
          '<div class="zr-divider"></div>' +
          '<div class="zr-btn" data-action="zoomout" title="Perkecil"><span class="material-symbols-rounded">remove</span></div>';
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        container.querySelector('[data-action="zoomin"]').addEventListener('click', () => map.zoomIn());
        container.querySelector('[data-action="zoomout"]').addEventListener('click', () => map.zoomOut());
        return container;
      },
    });
    new ZoomRotateControl().addTo(map);

    const RotateControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'zr-control zr-control-rotate');
        container.innerHTML =
          '<div class="zr-btn" data-action="rotleft" title="Putar kiri"><span class="material-symbols-rounded">rotate_left</span></div>' +
          '<div class="zr-divider"></div>' +
          '<div class="zr-btn zr-compass" data-action="north" title="Set ke utara"><span class="material-symbols-rounded zr-compass-icon">navigation</span></div>' +
          '<div class="zr-divider"></div>' +
          '<div class="zr-btn" data-action="rotright" title="Putar kanan"><span class="material-symbols-rounded">rotate_right</span></div>';
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        container.querySelector('[data-action="rotleft"]').addEventListener('click', () => rotateBy(-15));
        container.querySelector('[data-action="rotright"]').addEventListener('click', () => rotateBy(15));
        container.querySelector('[data-action="north"]').addEventListener('click', () => setBearingAnimated(0));

        // Putar ikon kompas mengikuti arah peta saat ini (jarum selalu nunjuk utara asli)
        const compassIcon = container.querySelector('.zr-compass-icon');
        const updateCompass = () => {
          compassIcon.style.transform = `rotate(${-map.getBearing()}deg)`;
        };
        map.on('rotate', updateCompass);
        updateCompass();

        return container;
      },
    });
    new RotateControl().addTo(map);

      dataLayerRef.current = L.featureGroup().addTo(map);

      fetchAvailableFiles();
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetData() {
    assetUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    assetUrlsRef.current = [];
    dataLayerRef.current.clearLayers();
    setPlacemarks([]);
    setLoadedSources([]);
    setActiveIndex(null);
  }

  // mode: 'replace' (clears everything already loaded) or 'append' (used for auto-load)
  function applyParsed(sourceName, result, mode) {
    setPlacemarks((prev) => (mode === 'append' ? [...prev, ...result.placemarks] : result.placemarks));
    setLoadedSources((prev) =>
      mode === 'append'
        ? [...prev, { name: sourceName, count: result.itemCount }]
        : [{ name: sourceName, count: result.itemCount }]
    );

    if (result.itemCount === 0) {
      showToast(`"${sourceName}" dimuat, tapi tidak ada Placemark atau GroundOverlay yang bisa ditampilkan.`, 'info');
    } else {
      setHintVisible(false);
      try {
        mapRef.current.fitBounds(dataLayerRef.current.getBounds(), { padding: [30, 30], maxZoom: 16 });
      } catch (e) {
        /* ignore invalid bounds */
      }
    }
  }

  function handleFile(file, mode) {
    mode = mode || 'replace';
    if (mode !== 'append') resetData();
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.kmz')) {
      file
        .arrayBuffer()
        .then((buffer) => ingestKmzBuffer(buffer, file.name, assetUrlsRef.current, dataLayerRef.current))
        .then((result) => applyParsed(file.name, result, mode))
        .catch((err) => {
          console.error(err);
          showToast('Gagal membuka file KMZ. Pastikan file tidak rusak / bukan hasil rename dari format lain.');
        });
    } else if (lower.endsWith('.kml')) {
      file
        .arrayBuffer()
        .then((buffer) => ingestKmlBuffer(buffer, dataLayerRef.current))
        .then((result) => applyParsed(file.name, result, mode))
        .catch(() => showToast('Gagal membaca file KML.'));
    } else {
      showToast('Format tidak didukung. Gunakan file .kmz atau .kml.');
    }
  }

  // Cuma ambil daftar nama file yang ada di /data lewat backend, buat ngisi
  // dropdown pemilihan. Belum nge-render apa pun ke peta. Kalau backend
  // nggak keload (mis. lokal tanpa server), dropdown-nya otomatis kosong dan
  // fallback ke upload manual.
  function fetchAvailableFiles() {
    fetch(`${API_URL}/api/kmz-files`)
      .then((r) => {
        if (!r.ok) throw new Error('no backend');
        return r.json();
      })
      .then((data) => {
        setAvailableFiles((data && data.files) || []);
      })
      .catch(() => {
        /* no backend available — stay on manual upload mode */
      });
  }

  // Ambil satu file dari backend berdasarkan nama yang dipilih user, lalu
  // render (replace, bukan append — jadi cuma file itu yang tampil di peta).
  function loadFileByName(name) {
    if (!name) return;
    setLoadingFile(true);
    resetData();
    fetch(`${API_URL}/api/kmz-file?name=${encodeURIComponent(name)}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed: ' + name);
        return r.arrayBuffer();
      })
      .then((buffer) => {
        const lower = name.toLowerCase();
        if (lower.endsWith('.kmz')) {
          return ingestKmzBuffer(buffer, name, assetUrlsRef.current, dataLayerRef.current).then((result) =>
            applyParsed(name, result, 'replace')
          );
        }
        if (lower.endsWith('.kml')) {
          return ingestKmlBuffer(buffer, dataLayerRef.current).then((result) =>
            applyParsed(name, result, 'replace')
          );
        }
      })
      .catch((err) => {
        console.warn('Gagal memuat file:', name, err);
        showToast('Gagal memuat "' + name + '" dari server.');
      })
      .finally(() => setLoadingFile(false));
  }

  function selectPlacemark(idx) {
    setActiveIndex(idx);
    const pm = placemarks[idx];
    const l = pm.layers[0].layer;
    try {
      mapRef.current.fitBounds(l.getBounds ? l.getBounds() : L.latLngBounds([l.getLatLng()]), {
        padding: [60, 60],
        maxZoom: 16,
      });
    } catch (e) {
      if (l.getLatLng) mapRef.current.setView(l.getLatLng(), 15);
    }
    l.openPopup();
    setSidebarOpen(false);
  }

  function toggleBaseLayer() {
    const map = mapRef.current;
    if (!map) return;
    const sat = satelliteLayerRef.current;
    const street = streetLayerRef.current;
    const labels = labelsLayerRef.current;
    if (baseLayerName === 'Satelit') {
      map.removeLayer(sat);
      map.removeLayer(labels);
      street.addTo(map);
      setBaseLayerName('Jalan');
    } else {
      map.removeLayer(street);
      sat.addTo(map);
      labels.addTo(map);
      setBaseLayerName('Satelit');
    }
  }

  function handleFabUpload() {
    fileInputRef.current.click();
  }

  // --- drag & drop on whole page ---
  const dragCounter = useRef(0);
  useEffect(() => {
    function onDragEnter(e) {
      e.preventDefault();
      dragCounter.current++;
      setDropActive(true);
    }
    function onDragLeave(e) {
      e.preventDefault();
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setDropActive(false);
    }
    function onDrop(e) {
      e.preventDefault();
      dragCounter.current = 0;
      setDropActive(false);
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        setSelectedFile('');
        handleFile(f, 'replace');
      }
    }
    document.body.addEventListener('dragenter', onDragEnter);
    document.body.addEventListener('dragover', onDragEnter);
    document.body.addEventListener('dragleave', onDragLeave);
    document.body.addEventListener('drop', onDrop);
    return () => {
      document.body.removeEventListener('dragenter', onDragEnter);
      document.body.removeEventListener('dragover', onDragEnter);
      document.body.removeEventListener('dragleave', onDragLeave);
      document.body.removeEventListener('drop', onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placemarks]);

  const totalCount = loadedSources.reduce((a, s) => a + s.count, 0);
  const headerVisible = loadedSources.length > 0;

  return (
    <div className="app" id="app">
      <div className="topbar-glow" aria-hidden="true" />

      <div className="topbar-pill">
        <span className="brand-name">Peta KMZ</span>
        <div className="attrib-marquee">
          <div className="attrib-marquee-track">
            <span>{ATTRIBUTION_TEXT[baseLayerName]}</span>
            <span>{ATTRIBUTION_TEXT[baseLayerName]}</span>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".kmz,.kml"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            setSelectedFile('');
            handleFile(e.target.files[0], 'replace');
            setSidebarOpen(false);
          }
          e.target.value = '';
        }}
      />

      <div
        className={'sidebar-backdrop' + (sidebarOpen ? ' show' : '')}
        onClick={() => setSidebarOpen(false)}
      ></div>

      <div className={'sidebar' + (sidebarOpen ? ' open' : '')}>
        {availableFiles.length > 0 && (
          <div className="server-file-list">
            <div className="server-file-list-title">Data di server</div>
            {availableFiles.map((name) => (
              <div
                key={name}
                className={
                  'server-file-item' +

                  (selectedFile === name ? ' active' : '') +
                  (loadingFile ? ' disabled' : '')
                }
                onClick={() => {
                  if (loadingFile || selectedFile === name) return;
                  setSelectedFile(name);
                  loadFileByName(name);
                  setSidebarOpen(false);
                }}
              >
                <span className={'material-symbols-rounded server-file-icon' + (loadingFile && selectedFile === name ? ' spinning' : '')}>
                  {loadingFile && selectedFile === name ? 'progress_activity' : 'layers'}
                </span>
                <span className="server-file-name">{name}</span>
              </div>
            ))}
          </div>
        )}
        {headerVisible && (
          <div className="sidebar-header">
            {loadedSources.length <= 1 ? (
              <>
                <div className="file-name">{loadedSources[0]?.name}</div>
                <div className="file-meta">{loadedSources[0]?.count} item dimuat</div>
              </>
            ) : (
              <>
                <div className="file-name">{loadedSources.length} file data dimuat</div>
                <div className="file-meta">
                  {totalCount} item total &bull; {loadedSources.map((s) => s.name).join(', ')}
                </div>
              </>
            )}
          </div>
        )}
        <div className="placemark-list">
          {placemarks.length === 0 ? (
            <div className="empty-state">
              Belum ada data dimuat.
              <br />
              <br />
              Klik <b>&quot;Buka file KMZ / KML&quot;</b> di atas, atau seret file langsung ke area peta.
            </div>
          ) : (
            placemarks.map((pm, idx) => (
              <div
                key={idx}
                className={'placemark-item' + (activeIndex === idx ? ' active' : '')}
                onClick={() => selectPlacemark(idx)}
              >
                {pm.type.startsWith('Citra') ? (
                  pm.thumb ? (
                    <span className="pm-swatch" style={{ backgroundImage: `url(${pm.thumb})` }} />
                  ) : (
                    <span className="pm-swatch pm-swatch-missing">
                      <span className="material-symbols-rounded">image_not_supported</span>
                    </span>
                  )
                ) : (
                  <span className="pm-dot" style={{ background: pm.color }} />
                )}
                <div className="pm-text">
                  <div className="pm-name">{pm.name}</div>
                  <div className="pm-type">{pm.type}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="map-wrap">
        <div id="map" ref={mapElRef}></div>
        {hintVisible && (
          <div className="hint-card">
            <p>
              <b style={{ color: 'var(--text)' }}>Cara pakai:</b>
            </p>
            <p>
              Muat file .kmz atau .kml. Titik, garis, area, maupun citra satelit (ground overlay) akan tergambar
              otomatis dan bisa diklik dari daftar di sisi kiri.
            </p>
            <p>
              Kalau backend-nya sudah jalan / ter-deploy dengan data ditaruh di folder <code>data/</code>, halaman
              ini akan memuatnya otomatis tanpa perlu upload manual.
            </p>
          </div>
        )}
        <div className={'dropzone' + (dropActive ? ' active' : '')}>Lepas file di sini untuk memuat</div>
        <div className={'toast' + (toast.show ? ' show' : '') + (toast.info ? ' info' : '')}>{toast.msg}</div>
      </div>

      <button
        className="fab fab-hamburger"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Buka daftar data"
        title="Daftar data"
      >
        <span className="material-symbols-rounded">{sidebarOpen ? 'close' : 'menu'}</span>
      </button>

      <button className="fab fab-upload" onClick={handleFabUpload} aria-label="Buka file KMZ / KML" title="Buka file KMZ / KML">
        <span className="material-symbols-rounded">upload_file</span>
      </button>

      <button
        className="fab fab-layer"
        onClick={toggleBaseLayer}
        aria-label={'Ganti ke ' + (baseLayerName === 'Satelit' ? 'peta jalan' : 'citra satelit')}
        title={baseLayerName === 'Satelit' ? 'Satelit (klik untuk peta jalan)' : 'Jalan (klik untuk citra satelit)'}
      >
        <span className="material-symbols-rounded">{baseLayerName === 'Satelit' ? 'satellite_alt' : 'map'}</span>
      </button>
    </div>
  );
}
