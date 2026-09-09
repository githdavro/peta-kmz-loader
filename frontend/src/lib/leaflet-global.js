import L from 'leaflet';

// `leaflet-rotate` (npm) patches Leaflet's classes via a bare global `L`
// reference instead of importing it as an ES module (old-school plugin
// style). A *static* `import 'leaflet-rotate'` placed after this file does
// NOT reliably run after `window.L` is set once bundled by Vite/Rollup —
// bundlers are free to reorder/hoist sibling static imports. A *dynamic*
// import() guarantees ordering because it only starts evaluating its module
// graph once actually invoked, so we set `window.L` synchronously right
// before triggering it.
let rotatePromise = null;

export function ensureLeafletRotate() {
  if (!rotatePromise) {
    if (typeof window !== 'undefined' && !window.L) {
      window.L = L;
    }
    rotatePromise = import('leaflet-rotate');
  }
  return rotatePromise;
}

export default L;
