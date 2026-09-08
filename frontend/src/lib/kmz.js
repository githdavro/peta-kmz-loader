import L from 'leaflet';
import JSZip from 'jszip';

// Decode bytes to text robustly: KML declares UTF-8 but exports from some
// tools (older ArcGIS/Earth) leak Windows-1252 bytes (e.g. the (c) symbol).
export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (e) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

export function kmlColor(v) {
  if (!v || v.length < 8) return null;
  v = v.trim();
  const bb = v.substr(2, 2), gg = v.substr(4, 2), rr = v.substr(6, 2);
  return { css: '#' + rr + gg + bb };
}

export function parseCoords(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((triplet) => {
      const parts = triplet.split(',');
      const lon = parseFloat(parts[0]), lat = parseFloat(parts[1]);
      return [lat, lon];
    })
    .filter((c) => !isNaN(c[0]) && !isNaN(c[1]));
}

export function parseStyles(xml) {
  const styles = {};
  xml.querySelectorAll('Style').forEach((node) => {
    const id = node.getAttribute('id');
    if (!id) return;
    const s = {};
    const lineColor = node.querySelector('LineStyle > color');
    const lineWidth = node.querySelector('LineStyle > width');
    const polyColor = node.querySelector('PolyStyle > color');
    const iconColor = node.querySelector('IconStyle > color');
    if (lineColor) s.line = kmlColor(lineColor.textContent);
    if (lineWidth) s.weight = parseFloat(lineWidth.textContent) || 2;
    if (polyColor) s.fill = kmlColor(polyColor.textContent);
    if (iconColor) s.icon = kmlColor(iconColor.textContent);
    styles['#' + id] = s;
  });
  xml.querySelectorAll('StyleMap').forEach((node) => {
    const id = node.getAttribute('id');
    if (!id) return;
    let normalUrl = null;
    node.querySelectorAll('Pair').forEach((p) => {
      const key = p.querySelector('key');
      const url = p.querySelector('styleUrl');
      if (key && key.textContent.trim() === 'normal' && url) normalUrl = url.textContent.trim();
    });
    if (normalUrl && styles[normalUrl]) styles['#' + id] = styles[normalUrl];
  });
  return styles;
}

// Build a lookup so <href>relative/path.jpg</href> resolves to a blob URL,
// matching by exact path first, then by filename only (KMZ hrefs are inconsistent).
export function resolveAssets(assetEntries, currentAssetUrls) {
  const paths = Object.keys(assetEntries);
  return Promise.all(paths.map((p) => assetEntries[p].async('blob'))).then((blobs) => {
    const byPath = {}, byName = {};
    paths.forEach((p, i) => {
      const url = URL.createObjectURL(blobs[i]);
      currentAssetUrls.push(url);
      byPath[p] = url;
      const base = p.split('/').pop().toLowerCase();
      byName[base] = url;
    });
    return { byPath, byName };
  });
}

export function resolveHref(href, assetMap) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  href = href.replace(/^\.\//, '');
  if (assetMap.byPath && assetMap.byPath[href]) return assetMap.byPath[href];
  const base = href.split('/').pop().toLowerCase();
  if (assetMap.byName && assetMap.byName[base]) return assetMap.byName[base];
  return null;
}

// Parses KML text and adds layers to dataLayer. Returns { itemCount, placemarks }
// where placemarks is an array of { name, type, layers:[{layer,type}], color, thumb }.
export function parseKmlToLayers(text, assetMap, dataLayer) {
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  const perr = xml.querySelector('parsererror');
  if (perr) throw new Error(perr.textContent);

  const styles = parseStyles(xml);
  const placemarks = [];
  let itemCount = 0;

  xml.querySelectorAll('Placemark').forEach((pm) => {
    const nameNode = pm.querySelector(':scope > name');
    const name = nameNode ? nameNode.textContent.trim() : 'Tanpa nama';
    const descNode = pm.querySelector(':scope > description');
    const desc = descNode ? descNode.textContent.trim() : '';
    const styleUrlNode = pm.querySelector(':scope > styleUrl');
    const style = styleUrlNode ? styles[styleUrlNode.textContent.trim()] || {} : {};

    const color = (style.line && style.line.css) || (style.icon && style.icon.css) || '#e8823c';
    const fillColor = (style.fill && style.fill.css) || color;
    const weight = style.weight || 2.5;
    const layers = [];

    pm.querySelectorAll('Point > coordinates').forEach((c) => {
      const coords = parseCoords(c.textContent);
      if (coords.length) {
        const marker = L.circleMarker(coords[0], { radius: 7, color, weight: 2, fillColor: color, fillOpacity: 0.85 });
        layers.push({ layer: marker, type: 'Titik' });
      }
    });
    pm.querySelectorAll('LineString > coordinates').forEach((c) => {
      const coords = parseCoords(c.textContent);
      if (coords.length > 1) {
        const line = L.polyline(coords, { color, weight, opacity: 0.9 });
        layers.push({ layer: line, type: 'Garis' });
      }
    });
    pm.querySelectorAll('Polygon').forEach((poly) => {
      const outer = poly.querySelector('outerBoundaryIs coordinates');
      if (outer) {
        const coords = parseCoords(outer.textContent);
        if (coords.length > 2) {
          const polygon = L.polygon(coords, { color, weight, fillColor, fillOpacity: 0.25 });
          layers.push({ layer: polygon, type: 'Area' });
        }
      }
    });

    if (layers.length === 0) return;
    layers.forEach((entry) => {
      const popupHtml = '<b>' + escapeHtml(name) + '</b>' + (desc ? '<div>' + escapeHtml(desc).slice(0, 400) + '</div>' : '');
      entry.layer.bindPopup(popupHtml);
      dataLayer.addLayer(entry.layer);
    });
    itemCount++;
    placemarks.push({ name, type: layers[0].type, layers, color });
  });

  xml.querySelectorAll('GroundOverlay').forEach((go) => {
    const nameNode = go.querySelector(':scope > name');
    const name = nameNode ? nameNode.textContent.trim() : 'Citra tanpa nama';
    const descNode = go.querySelector(':scope > description');
    const desc = descNode ? descNode.textContent.trim() : '';
    const hrefNode = go.querySelector('Icon > href');
    const href = hrefNode ? hrefNode.textContent.trim() : null;
    const url = resolveHref(href, assetMap);

    const box = go.querySelector('LatLonBox');
    if (!url || !box) return;
    const north = parseFloat(box.querySelector('north').textContent);
    const south = parseFloat(box.querySelector('south').textContent);
    const east = parseFloat(box.querySelector('east').textContent);
    const west = parseFloat(box.querySelector('west').textContent);
    if ([north, south, east, west].some(isNaN)) return;

    const bounds = [[south, west], [north, east]];
    const overlay = L.imageOverlay(url, bounds, { opacity: 0.95 });
    overlay.bindPopup('<b>' + escapeHtml(name) + '</b>' + (desc ? '<div>' + escapeHtml(desc).slice(0, 400) + '</div>' : ''));
    dataLayer.addLayer(overlay);

    itemCount++;
    placemarks.push({ name, type: 'Citra', layers: [{ layer: overlay, type: 'Citra' }], color: '#4fa8a0', thumb: url });
  });

  return { itemCount, placemarks };
}

export function ingestKmzBuffer(buffer, filename, assetUrlsRef, dataLayer) {
  return JSZip.loadAsync(buffer).then((zip) => {
    let kmlEntry = null;
    const assetEntries = {};
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      if (path.toLowerCase().endsWith('.kml')) {
        if (!kmlEntry || path.toLowerCase() === 'doc.kml') kmlEntry = entry;
      } else {
        assetEntries[path] = entry;
      }
    });
    if (!kmlEntry) {
      throw new Error('Tidak ditemukan file .kml di dalam "' + filename + '".');
    }

    return kmlEntry.async('arraybuffer').then((kmlBuffer) => {
      const text = decodeText(kmlBuffer);
      return resolveAssets(assetEntries, assetUrlsRef).then((assetMap) =>
        parseKmlToLayers(text, assetMap, dataLayer)
      );
    });
  });
}

export function ingestKmlBuffer(buffer, dataLayer) {
  const text = decodeText(buffer);
  return Promise.resolve(parseKmlToLayers(text, {}, dataLayer));
}
