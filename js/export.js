function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function downloadText(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCheckpointCsv(checkpoints) {
  const header = ["filename", "latitude", "longitude", "os_grid_ref", "timestamp", "status"];
  const rows = checkpoints.map((checkpoint) => [
    checkpoint.filename,
    checkpoint.latitude.toFixed(7),
    checkpoint.longitude.toFixed(7),
    checkpoint.gridRef,
    checkpoint.timestamp,
    checkpoint.status
  ]);
  downloadText("checkpoints.csv", "text/csv;charset=utf-8", makeCheckpointCsv(header, rows));
}

export function makeCheckpointCsv(header, rows) {
  return `${[header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

export function makeCheckpointGeojson(checkpoints) {
  return {
    type: "FeatureCollection",
    features: checkpoints.map((checkpoint) => ({
      type: "Feature",
      properties: {
        filename: checkpoint.filename,
        os_grid_ref: checkpoint.gridRef,
        timestamp: checkpoint.timestamp,
        status: checkpoint.status
      },
      geometry: {
        type: "Point",
        coordinates: [checkpoint.longitude, checkpoint.latitude]
      }
    }))
  };
}

export function downloadCheckpointGeojson(checkpoints) {
  const geojson = makeCheckpointGeojson(checkpoints);
  downloadText("checkpoints.geojson", "application/geo+json;charset=utf-8", `${JSON.stringify(geojson, null, 2)}\n`);
}
