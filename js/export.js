function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

const metersPerMile = 1609.344;

function getExportSettings(options = {}) {
  const distanceUnit = options.distanceUnit === "km" ? "km" : "miles";
  const targetSpeedMph = Number(options.targetSpeedMph);
  const checkpointStopMinutes = Number(options.checkpointStopMinutes);
  return {
    distanceUnit,
    distanceHeaderUnit: distanceUnit === "km" ? "km" : "miles",
    targetSpeedMph: Number.isFinite(targetSpeedMph) && targetSpeedMph > 0 ? targetSpeedMph : 3,
    targetSpeedLabel: options.targetSpeedLabel || "3 mph",
    checkpointStopMinutes: Number.isFinite(checkpointStopMinutes) && checkpointStopMinutes >= 0 ? checkpointStopMinutes : 0,
    startTime: options.startTime || ""
  };
}

function metersToDistance(value, distanceUnit) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return distanceUnit === "km" ? (value / 1000).toFixed(3) : (value / metersPerMile).toFixed(3);
}

function metersToMinutesAtWalkingPace(value, targetSpeedMph) {
  return Number.isFinite(value) ? Math.round((value / metersPerMile) / targetSpeedMph * 60) : "";
}

function roundedMeters(value) {
  return Number.isFinite(value) ? Math.round(value) : "";
}

function getViaGridRefs(checkpoint) {
  return Array.isArray(checkpoint.viaPoints)
    ? checkpoint.viaPoints.map((viaPoint) => viaPoint.gridRef).filter(Boolean).join("; ")
    : "";
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

export function downloadCheckpointCsv(checkpoints, options = {}) {
  const exportSettings = getExportSettings(options);
  const header = [
    "order",
    "name",
    "source",
    "latitude",
    "longitude",
    "os_grid_ref",
    "via_grid_refs",
    "route_name",
    `distance_along_route_${exportSettings.distanceHeaderUnit}`,
    `distance_from_previous_${exportSettings.distanceHeaderUnit}`,
    "target_speed",
    "checkpoint_stop_minutes",
    "time_from_previous_minutes",
    "arrival_time",
    "departure_time",
    "off_route_meters",
    "timestamp",
    "status"
  ];
  const rows = checkpoints.map((checkpoint) => [
    checkpoint.orderIndex,
    checkpoint.displayName || checkpoint.filename,
    checkpoint.sourceFilename || checkpoint.filename,
    checkpoint.latitude.toFixed(7),
    checkpoint.longitude.toFixed(7),
    checkpoint.gridRef,
    getViaGridRefs(checkpoint),
    checkpoint.routeName,
    metersToDistance(checkpoint.routeOffsetMeters, exportSettings.distanceUnit),
    metersToDistance(checkpoint.segmentFromPreviousMeters, exportSettings.distanceUnit),
    exportSettings.targetSpeedLabel,
    checkpoint.stopMinutes ?? exportSettings.checkpointStopMinutes,
    checkpoint.legTravelMinutes ?? metersToMinutesAtWalkingPace(checkpoint.segmentFromPreviousMeters, exportSettings.targetSpeedMph),
    checkpoint.arrivalTime || "",
    checkpoint.departureTime || "",
    roundedMeters(checkpoint.offRouteMeters),
    checkpoint.timestamp,
    checkpoint.status
  ]);
  downloadText("checkpoints.csv", "text/csv;charset=utf-8", makeCheckpointCsv(header, rows));
}

export function makeCheckpointCsv(header, rows) {
  return `${[header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

export function makeCheckpointGeojson(checkpoints, options = {}) {
  const exportSettings = getExportSettings(options);
  return {
    type: "FeatureCollection",
    features: checkpoints.map((checkpoint) => ({
      type: "Feature",
      properties: {
        order: checkpoint.orderIndex,
        name: checkpoint.displayName || checkpoint.filename,
        source: checkpoint.sourceFilename || checkpoint.filename || "",
        os_grid_ref: checkpoint.gridRef,
        via_grid_refs: getViaGridRefs(checkpoint),
        route_name: checkpoint.routeName || "",
        distance_unit: exportSettings.distanceHeaderUnit,
        distance_along_route: metersToDistance(checkpoint.routeOffsetMeters, exportSettings.distanceUnit),
        distance_from_previous: metersToDistance(checkpoint.segmentFromPreviousMeters, exportSettings.distanceUnit),
        target_speed: exportSettings.targetSpeedLabel,
        checkpoint_stop_minutes: checkpoint.stopMinutes ?? exportSettings.checkpointStopMinutes,
        time_from_previous_minutes: checkpoint.legTravelMinutes ?? metersToMinutesAtWalkingPace(checkpoint.segmentFromPreviousMeters, exportSettings.targetSpeedMph),
        arrival_time: checkpoint.arrivalTime || "",
        departure_time: checkpoint.departureTime || "",
        off_route_meters: roundedMeters(checkpoint.offRouteMeters),
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

export function downloadCheckpointGeojson(checkpoints, options = {}) {
  const geojson = makeCheckpointGeojson(checkpoints, options);
  downloadText("checkpoints.geojson", "application/geo+json;charset=utf-8", `${JSON.stringify(geojson, null, 2)}\n`);
}
