function getFeatureCount(geojson) {
  return geojson.features?.length ?? 0;
}

function getBoundsFromGeojson(geojson) {
  const bounds = L.geoJSON(geojson).getBounds();
  return bounds.isValid() ? bounds : null;
}

export async function parseGpxFile(file) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`${file.name} is not valid XML.`);
  }

  if (!window.toGeoJSON?.gpx) {
    throw new Error("GPX parser library is not available.");
  }

  const geojson = window.toGeoJSON.gpx(doc);
  const bounds = getBoundsFromGeojson(geojson);
  if (!bounds || getFeatureCount(geojson) === 0) {
    throw new Error(`${file.name} did not contain route, track, or waypoint data.`);
  }

  const displayName = doc.querySelector("metadata > name, trk > name, rte > name")?.textContent?.trim() || file.name;

  return {
    id: crypto.randomUUID(),
    filename: file.name,
    displayName,
    geojson,
    visible: true,
    bounds
  };
}
