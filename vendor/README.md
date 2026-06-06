# Vendored Browser Libraries

These files are checked in so the app can run as static files without a package manager or build step.

- Leaflet 1.9.4: `leaflet.js`, `leaflet.css`, `images/*`
  - Source: https://unpkg.com/leaflet@1.9.4/
  - Licence: `leaflet.LICENSE`
- @mapbox/togeojson 0.16.2: `togeojson.umd.js`
  - Source: https://unpkg.com/@mapbox/togeojson@0.16.2/
  - Licence: `togeojson.LICENSE`
- exifr 7.1.3: `exifr.full.umd.js`
  - Source: https://unpkg.com/exifr@7.1.3/
  - Licence: `exifr.LICENSE`

British National Grid formatting is implemented in `../js/gridref.js` to keep the runtime dependency set small.
