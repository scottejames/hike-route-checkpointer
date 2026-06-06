import { parseGpxFile } from "./gpx.js";
import { extractCheckpoint, revokeCheckpointThumbnail } from "./photos.js";
import { downloadCheckpointCsv, downloadCheckpointGeojson } from "./export.js";
import { formatSixFigureGridRef } from "./gridref.js";

const sussexCenter = [50.92, -0.32];
const routeStorageKey = "hike-route-checkpointer.routes.v1";
const checkpointStorageKey = "hike-route-checkpointer.checkpoints.v1";
const settingsStorageKey = "hike-route-checkpointer.settings.v1";
const earthRadiusMeters = 6371008.8;
const metersPerMile = 1609.344;
const kilometersPerMile = 1.609344;
const defaultSettings = {
  distanceUnit: "miles",
  targetSpeedMph: 3,
  checkpointStopMinutes: 5,
  startTime: ""
};
let manualCheckpointCount = 0;
let checkpointSequence = 0;
const state = {
  routes: [],
  checkpoints: [],
  warnings: [],
  settings: loadSettingsFromBrowser(),
  routeLayers: new Map(),
  endpointMarkers: new Map(),
  checkpointMarkers: new Map()
};

const elements = {
  gpxInput: document.querySelector("#gpx-input"),
  photoInput: document.querySelector("#photo-input"),
  gpxDrop: document.querySelector("#gpx-drop"),
  photoDrop: document.querySelector("#photo-drop"),
  routeList: document.querySelector("#route-list"),
  checkpointList: document.querySelector("#checkpoint-list"),
  warningList: document.querySelector("#warning-list"),
  exportCsv: document.querySelector("#export-csv"),
  exportGeojson: document.querySelector("#export-geojson"),
  fitAll: document.querySelector("#fit-all"),
  distanceUnitRadios: document.querySelectorAll("input[name=\"distance-unit\"]"),
  speedSummary: document.querySelector("#speed-summary"),
  settingsOpen: document.querySelector("#settings-open"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  settingsClose: document.querySelector("#settings-close"),
  settingsCancel: document.querySelector("#settings-cancel"),
  targetSpeed: document.querySelector("#target-speed"),
  checkpointStop: document.querySelector("#checkpoint-stop"),
  speedUnitLabel: document.querySelector("#speed-unit-label")
};

const map = L.map("map", {
  zoomControl: true
}).setView(sussexCenter, 10);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
}).addTo(map);

const checkpointIcon = L.divIcon({
  className: "",
  html: "<div class=\"checkpoint-icon\"></div>",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -8]
});

const viaIcon = L.divIcon({
  className: "",
  html: "<div class=\"checkpoint-icon via-icon\"></div>",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -7]
});

const startIcon = L.divIcon({
  className: "",
  html: "<div class=\"checkpoint-icon endpoint-icon start-icon\"></div>",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -9]
});

const endIcon = L.divIcon({
  className: "",
  html: "<div class=\"checkpoint-icon endpoint-icon end-icon\"></div>",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -9]
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function loadSettingsFromBrowser() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsStorageKey) || "null");
    if (!saved || saved.version !== 1) {
      return { ...defaultSettings };
    }
    const distanceUnit = saved.distanceUnit === "km" ? "km" : "miles";
    const targetSpeedMph = Number(saved.targetSpeedMph);
    const checkpointStopMinutes = Number(saved.checkpointStopMinutes);
    const startTime = typeof saved.startTime === "string" && /^\d{2}:\d{2}$/.test(saved.startTime)
      ? saved.startTime
      : defaultSettings.startTime;
    return {
      distanceUnit,
      targetSpeedMph: Number.isFinite(targetSpeedMph) && targetSpeedMph > 0
        ? targetSpeedMph
        : defaultSettings.targetSpeedMph,
      checkpointStopMinutes: Number.isFinite(checkpointStopMinutes) && checkpointStopMinutes >= 0
        ? checkpointStopMinutes
        : defaultSettings.checkpointStopMinutes,
      startTime
    };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettingsToBrowser() {
  try {
    localStorage.setItem(settingsStorageKey, JSON.stringify({
      version: 1,
      ...state.settings
    }));
  } catch (error) {
    addWarning(`Settings could not be saved in this browser: ${error.message || "storage is unavailable."}`);
  }
}

function getSpeedUnitLabel() {
  return state.settings.distanceUnit === "km" ? "km/h" : "mph";
}

function getTargetSpeedForDisplay() {
  return state.settings.distanceUnit === "km"
    ? state.settings.targetSpeedMph * kilometersPerMile
    : state.settings.targetSpeedMph;
}

function displaySpeedToMph(speed) {
  return state.settings.distanceUnit === "km" ? speed / kilometersPerMile : speed;
}

function formatSpeedValue(value) {
  return value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, "");
}

function formatTargetSpeed() {
  return `${formatSpeedValue(getTargetSpeedForDisplay())} ${getSpeedUnitLabel()}`;
}

function formatSettingsSummary() {
  return `${formatTargetSpeed()} - ${state.settings.checkpointStopMinutes} min stops`;
}

function addWarning(message) {
  state.warnings.push({
    id: crypto.randomUUID(),
    message
  });
  renderWarnings();
}

function getRouteBounds(geojson) {
  const bounds = L.geoJSON(geojson).getBounds();
  return bounds.isValid() ? bounds : null;
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

function coordinateToLatLng(coordinate) {
  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

function collectLineStrings(geometry, lines = []) {
  if (!geometry) {
    return lines;
  }

  if (geometry.type === "LineString") {
    const points = geometry.coordinates.map(coordinateToLatLng).filter(Boolean);
    if (points.length > 1) {
      lines.push(points);
    }
  }

  if (geometry.type === "MultiLineString") {
    for (const coordinates of geometry.coordinates) {
      const points = coordinates.map(coordinateToLatLng).filter(Boolean);
      if (points.length > 1) {
        lines.push(points);
      }
    }
  }

  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectLineStrings(child, lines);
    }
  }

  return lines;
}

function getGeojsonLineStrings(geojson) {
  const lines = [];
  if (geojson.type === "FeatureCollection") {
    for (const feature of geojson.features) {
      collectLineStrings(feature.geometry, lines);
    }
  } else if (geojson.type === "Feature") {
    collectLineStrings(geojson.geometry, lines);
  } else {
    collectLineStrings(geojson, lines);
  }
  return lines;
}

function buildRouteMeasure(geojson) {
  const segments = [];
  let routeOffsetMeters = 0;
  let startPoint = null;
  let endPoint = null;

  for (const line of getGeojsonLineStrings(geojson)) {
    if (!startPoint) {
      startPoint = line[0];
    }
    endPoint = line[line.length - 1];
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = line[index];
      const end = line[index + 1];
      const lengthMeters = map.distance(start, end);
      if (lengthMeters <= 0) {
        continue;
      }
      segments.push({
        start,
        end,
        lengthMeters,
        startOffsetMeters: routeOffsetMeters
      });
      routeOffsetMeters += lengthMeters;
    }
  }

  return {
    segments,
    startPoint,
    endPoint,
    totalMeters: routeOffsetMeters
  };
}

function prepareRoute(route) {
  route.measure = buildRouteMeasure(route.geojson);
  return route;
}

function projectLatLngToSegment(latlng, segment) {
  const originLatRad = degToRad((latlng.lat + segment.start.lat + segment.end.lat) / 3);
  const toXY = (point) => ({
    x: earthRadiusMeters * degToRad(point.lng) * Math.cos(originLatRad),
    y: earthRadiusMeters * degToRad(point.lat)
  });
  const point = toXY(latlng);
  const start = toXY(segment.start);
  const end = toXY(segment.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + dx * t,
    y: start.y + dy * t
  };
  const offRouteMeters = Math.hypot(point.x - projected.x, point.y - projected.y);

  return {
    routeOffsetMeters: segment.startOffsetMeters + segment.lengthMeters * t,
    offRouteMeters
  };
}

function findNearestRoutePosition(latlng, preferredRoute = null) {
  const candidateRoutes = preferredRoute ? [preferredRoute] : state.routes;
  let nearest = null;

  for (const route of candidateRoutes) {
    if (!route.measure) {
      prepareRoute(route);
    }
    for (const segment of route.measure.segments) {
      const projection = projectLatLngToSegment(latlng, segment);
      if (!nearest || projection.offRouteMeters < nearest.offRouteMeters) {
        nearest = {
          routeId: route.id,
          routeName: route.displayName,
          routeOffsetMeters: projection.routeOffsetMeters,
          routeTotalMeters: route.measure.totalMeters,
          offRouteMeters: projection.offRouteMeters
        };
      }
    }
  }

  return nearest;
}

function assignCheckpointRouteMetrics(checkpoint, preferredRoute = null) {
  const nearest = findNearestRoutePosition(L.latLng(checkpoint.latitude, checkpoint.longitude), preferredRoute);
  if (!nearest) {
    delete checkpoint.routeId;
    delete checkpoint.routeName;
    delete checkpoint.routeOffsetMeters;
    delete checkpoint.routeTotalMeters;
    delete checkpoint.offRouteMeters;
    return;
  }

  checkpoint.routeId = nearest.routeId;
  checkpoint.routeName = nearest.routeName;
  checkpoint.routeOffsetMeters = nearest.routeOffsetMeters;
  checkpoint.routeTotalMeters = nearest.routeTotalMeters;
  checkpoint.offRouteMeters = nearest.offRouteMeters;
}

function getWaypointType(checkpoint) {
  return checkpoint.waypointType === "via" ? "via" : "checkpoint";
}

function setWaypointType(checkpoint, waypointType) {
  checkpoint.waypointType = waypointType === "via" ? "via" : "checkpoint";
  updateCheckpointMarker(checkpoint);
  saveCheckpointsToBrowser();
  renderCheckpoints();
}

function routeOrderIndex(routeId) {
  const index = state.routes.findIndex((route) => route.id === routeId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getOrderedCheckpoints() {
  for (const checkpoint of state.checkpoints) {
    assignCheckpointRouteMetrics(checkpoint);
  }

  const ordered = [...state.checkpoints].sort((a, b) => {
    const aHasRoute = Number.isFinite(a.routeOffsetMeters);
    const bHasRoute = Number.isFinite(b.routeOffsetMeters);
    if (aHasRoute && bHasRoute) {
      const routeDelta = routeOrderIndex(a.routeId) - routeOrderIndex(b.routeId);
      if (routeDelta !== 0) {
        return routeDelta;
      }
      const offsetDelta = a.routeOffsetMeters - b.routeOffsetMeters;
      if (offsetDelta !== 0) {
        return offsetDelta;
      }
    } else if (aHasRoute !== bHasRoute) {
      return aHasRoute ? -1 : 1;
    }
    return (a.sequence || 0) - (b.sequence || 0);
  });

  const previousByRoute = new Map();
  for (let index = 0; index < ordered.length; index += 1) {
    const checkpoint = ordered[index];
    checkpoint.orderIndex = index + 1;
    checkpoint.segmentFromPreviousMeters = null;
    if (Number.isFinite(checkpoint.routeOffsetMeters)) {
      const previous = previousByRoute.get(checkpoint.routeId);
      if (previous) {
        checkpoint.segmentFromPreviousMeters = Math.max(0, checkpoint.routeOffsetMeters - previous.routeOffsetMeters);
      }
      previousByRoute.set(checkpoint.routeId, checkpoint);
    }
  }

  return ordered;
}

function getActiveRoute() {
  return state.routes.find((route) => route.visible) || state.routes[0] || null;
}

function makeRouteEndpoint(route, kind) {
  const point = kind === "start" ? route.measure?.startPoint : route.measure?.endPoint;
  if (!point) {
    return null;
  }

  let gridRef = "";
  try {
    gridRef = formatSixFigureGridRef(point.lat, point.lng);
  } catch {
    gridRef = "";
  }

  const routeOffsetMeters = kind === "start" ? 0 : route.measure.totalMeters;
  return {
    id: `endpoint:${route.id}:${kind}`,
    kind,
    virtual: true,
    displayName: kind === "start" ? "Start" : "End",
    filename: kind === "start" ? "Start" : "End",
    latitude: point.lat,
    longitude: point.lng,
    gridRef,
    timestamp: "",
    thumbnailUrl: "",
    status: "route endpoint",
    routeId: route.id,
    routeOffsetMeters,
    routeTotalMeters: route.measure.totalMeters,
    offRouteMeters: 0
  };
}

function getStopMinutes(checkpoint) {
  return checkpoint.kind === "user" ? state.settings.checkpointStopMinutes : 0;
}

function parseClockTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatClockTime(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) {
    return "";
  }
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getTravelMinutes(meters) {
  if (!Number.isFinite(meters)) {
    return null;
  }
  const speedMph = Math.max(0.1, state.settings.targetSpeedMph);
  return Math.round((meters / metersPerMile) / speedMph * 60);
}

function formatDurationMinutes(minutes) {
  if (!Number.isFinite(minutes)) {
    return "";
  }
  if (minutes < 1) {
    return "<1 min";
  }
  if (minutes < 90) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

function applySchedule(checkpoints) {
  let clockMinutes = parseClockTime(state.settings.startTime);

  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index];
    checkpoint.orderIndex = index + 1;
    checkpoint.stopMinutes = getStopMinutes(checkpoint);
    checkpoint.legTravelMinutes = index === 0 ? null : getTravelMinutes(checkpoint.segmentFromPreviousMeters);
    checkpoint.arrivalTime = clockMinutes == null ? "" : formatClockTime(clockMinutes);

    if (index === 0) {
      checkpoint.departureTime = checkpoint.arrivalTime;
      continue;
    }

    if (clockMinutes != null && Number.isFinite(checkpoint.legTravelMinutes)) {
      checkpoint.arrivalTime = formatClockTime(clockMinutes + checkpoint.legTravelMinutes);
      clockMinutes += checkpoint.legTravelMinutes;
    }

    if (checkpoint.kind === "end") {
      checkpoint.departureTime = "";
    } else if (clockMinutes != null) {
      clockMinutes += checkpoint.stopMinutes;
      checkpoint.departureTime = formatClockTime(clockMinutes);
    } else {
      checkpoint.departureTime = "";
    }
  }
}

function getScheduledCheckpoints() {
  const activeRoute = getActiveRoute();
  const routePoints = getOrderedCheckpoints()
    .filter((checkpoint) => !activeRoute || checkpoint.routeId === activeRoute.id || !Number.isFinite(checkpoint.routeOffsetMeters))
    .sort((a, b) => {
      const aOffset = Number.isFinite(a.routeOffsetMeters) ? a.routeOffsetMeters : Number.MAX_SAFE_INTEGER;
      const bOffset = Number.isFinite(b.routeOffsetMeters) ? b.routeOffsetMeters : Number.MAX_SAFE_INTEGER;
      return aOffset - bOffset || (a.sequence || 0) - (b.sequence || 0);
    });
  const viaPoints = routePoints
    .filter((checkpoint) => getWaypointType(checkpoint) === "via")
    .map((checkpoint, index) => ({
      ...checkpoint,
      kind: "via",
      displayName: `Via ${index + 1}`,
      sourceFilename: checkpoint.filename
    }));
  const userCheckpoints = routePoints
    .filter((checkpoint) => getWaypointType(checkpoint) === "checkpoint")
    .map((checkpoint, index) => ({
      ...checkpoint,
      kind: "user",
      displayName: `Checkpoint ${index + 1}`,
      sourceFilename: checkpoint.filename,
      viaPoints: []
    }));

  const scheduled = [];
  if (activeRoute) {
    const start = makeRouteEndpoint(activeRoute, "start");
    if (start) {
      scheduled.push(start);
    }
  }

  scheduled.push(...userCheckpoints);

  if (activeRoute) {
    const end = makeRouteEndpoint(activeRoute, "end");
    if (end) {
      scheduled.push(end);
    }
  }

  for (let index = 0; index < scheduled.length; index += 1) {
    const checkpoint = scheduled[index];
    checkpoint.viaPoints ||= [];
    checkpoint.segmentFromPreviousMeters = index === 0 || !Number.isFinite(checkpoint.routeOffsetMeters) || !Number.isFinite(scheduled[index - 1].routeOffsetMeters)
      ? null
      : Math.max(0, checkpoint.routeOffsetMeters - scheduled[index - 1].routeOffsetMeters);
  }

  for (const viaPoint of viaPoints) {
    const target = scheduled.find((checkpoint) => checkpoint.kind !== "start"
      && Number.isFinite(checkpoint.routeOffsetMeters)
      && Number.isFinite(viaPoint.routeOffsetMeters)
      && checkpoint.routeOffsetMeters >= viaPoint.routeOffsetMeters) || scheduled[scheduled.length - 1];
    if (target) {
      target.viaPoints ||= [];
      target.viaPoints.push(viaPoint);
    }
  }

  applySchedule(scheduled);
  return scheduled;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "";
  }

  if (state.settings.distanceUnit === "km") {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    const kilometers = meters / 1000;
    return `${kilometers.toFixed(kilometers < 10 ? 1 : 0)} km`;
  }

  const miles = meters / metersPerMile;
  if (miles < 0.05) {
    return `${Math.round(meters)} m`;
  }
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

function formatWalkingTime(meters) {
  return formatDurationMinutes(getTravelMinutes(meters));
}

function getCheckpointRouteMeta(checkpoint) {
  if (!Number.isFinite(checkpoint.routeOffsetMeters)) {
    return {
      alongRoute: "No route match",
      segment: ""
    };
  }

  const offRouteText = checkpoint.offRouteMeters > 15
    ? ` - ${formatDistance(checkpoint.offRouteMeters)} from route`
    : "";
  return {
    alongRoute: `${formatDistance(checkpoint.routeOffsetMeters)} along route${offRouteText}`,
    segment: Number.isFinite(checkpoint.segmentFromPreviousMeters)
      ? `From previous: ${formatDistance(checkpoint.segmentFromPreviousMeters)} - ${formatWalkingTime(checkpoint.segmentFromPreviousMeters)} at ${formatTargetSpeed()}`
      : "First checkpoint on this route"
  };
}

function serializeRoutes() {
  return {
    version: 1,
    routes: state.routes.map((route) => ({
      id: route.id,
      filename: route.filename,
      displayName: route.displayName,
      geojson: route.geojson,
      visible: route.visible
    }))
  };
}

function saveRoutesToBrowser() {
  try {
    localStorage.setItem(routeStorageKey, JSON.stringify(serializeRoutes()));
  } catch (error) {
    addWarning(`Routes could not be saved in this browser: ${error.message || "storage is full or unavailable."}`);
  }
}

function serializeCheckpoints() {
  return {
    version: 1,
    checkpoints: state.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      sequence: checkpoint.sequence,
      filename: checkpoint.filename,
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      gridRef: checkpoint.gridRef,
      timestamp: checkpoint.timestamp,
      waypointType: getWaypointType(checkpoint),
      status: checkpoint.status
    }))
  };
}

function saveCheckpointsToBrowser() {
  try {
    localStorage.setItem(checkpointStorageKey, JSON.stringify(serializeCheckpoints()));
  } catch (error) {
    addWarning(`Checkpoints could not be saved in this browser: ${error.message || "storage is full or unavailable."}`);
  }
}

function getManualCheckpointNumber(filename) {
  const match = /^Manual checkpoint (\d+)$/.exec(filename || "");
  return match ? Number(match[1]) : 0;
}

function restoreCheckpoint(savedCheckpoint) {
  if (!savedCheckpoint || typeof savedCheckpoint !== "object") {
    return null;
  }

  const latitude = Number(savedCheckpoint.latitude);
  const longitude = Number(savedCheckpoint.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  let gridRef = typeof savedCheckpoint.gridRef === "string" ? savedCheckpoint.gridRef : "";
  if (!gridRef) {
    try {
      gridRef = formatSixFigureGridRef(latitude, longitude);
    } catch {
      gridRef = "";
    }
  }

  const savedSequence = Number(savedCheckpoint.sequence);
  const sequence = Number.isFinite(savedSequence) && savedSequence > 0
    ? Math.round(savedSequence)
    : checkpointSequence + 1;
  checkpointSequence = Math.max(checkpointSequence, sequence);

  const filename = typeof savedCheckpoint.filename === "string" && savedCheckpoint.filename
    ? savedCheckpoint.filename
    : "Saved checkpoint";
  manualCheckpointCount = Math.max(manualCheckpointCount, getManualCheckpointNumber(filename));

  return {
    id: typeof savedCheckpoint.id === "string" && savedCheckpoint.id
      ? savedCheckpoint.id
      : crypto.randomUUID(),
    sequence,
    filename,
    latitude,
    longitude,
    gridRef,
    timestamp: typeof savedCheckpoint.timestamp === "string" ? savedCheckpoint.timestamp : "",
    thumbnailUrl: "",
    waypointType: savedCheckpoint.waypointType === "via" ? "via" : "checkpoint",
    status: typeof savedCheckpoint.status === "string" && savedCheckpoint.status
      ? savedCheckpoint.status
      : "restored"
  };
}

function loadCheckpointsFromBrowser() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(checkpointStorageKey) || "null");
  } catch {
    addWarning("Saved checkpoints could not be read and were ignored.");
    return;
  }

  if (!saved || saved.version !== 1 || !Array.isArray(saved.checkpoints)) {
    return;
  }

  for (const savedCheckpoint of saved.checkpoints) {
    const checkpoint = restoreCheckpoint(savedCheckpoint);
    if (!checkpoint) {
      addWarning(`${savedCheckpoint?.filename || "Saved checkpoint"} could not be restored.`);
      continue;
    }
    assignCheckpointRouteMetrics(checkpoint);
    state.checkpoints.push(checkpoint);
    addCheckpointMarker(checkpoint);
  }
}

function loadRoutesFromBrowser() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(routeStorageKey) || "null");
  } catch {
    addWarning("Saved routes could not be read and were ignored.");
    return;
  }

  if (!saved || saved.version !== 1 || !Array.isArray(saved.routes)) {
    return;
  }

  for (const savedRoute of saved.routes) {
    const bounds = getRouteBounds(savedRoute.geojson);
    if (!bounds) {
      addWarning(`${savedRoute.filename || "Saved route"} could not be restored.`);
      continue;
    }

    const route = prepareRoute({
      id: savedRoute.id || crypto.randomUUID(),
      filename: savedRoute.filename || "Saved route",
      displayName: savedRoute.displayName || savedRoute.filename || "Saved route",
      geojson: savedRoute.geojson,
      visible: savedRoute.visible !== false,
      bounds
    });
    state.routes.push(route);
    addRouteLayer(route);
    if (!route.visible) {
      state.routeLayers.get(route.id)?.remove();
    }
  }
}

function routeStyle() {
  return {
    color: "#d7432f",
    opacity: 0.9,
    weight: 4
  };
}

function addRouteLayer(route) {
  const layer = L.geoJSON(route.geojson, {
    style: routeStyle,
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
      radius: 5,
      color: "#d7432f",
      fillColor: "#ffffff",
      fillOpacity: 1,
      weight: 2
    }),
    onEachFeature: (feature, layerInstance) => {
      layerInstance.on("click", (event) => openRouteGridRefPopup(route, feature, event.latlng));
    }
  }).addTo(map);
  state.routeLayers.set(route.id, layer);
}

function openRouteGridRefPopup(route, feature, latlng) {
  let gridRef;
  try {
    gridRef = formatSixFigureGridRef(latlng.lat, latlng.lng);
  } catch (error) {
    addWarning(`Route click: ${error.message || "could not calculate OS grid reference."}`);
    return;
  }

  const container = document.createElement("div");
  container.className = "popup";

  const gridRefElement = document.createElement("strong");
  gridRefElement.textContent = gridRef;
  container.append(gridRefElement);

  const coordinatesElement = document.createElement("span");
  coordinatesElement.textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
  container.append(coordinatesElement);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add checkpoint";
  addButton.addEventListener("click", () => {
    const checkpoint = addManualCheckpoint(latlng, route, "checkpoint");
    map.closePopup();
    state.checkpointMarkers.get(checkpoint.id)?.openPopup();
  });
  container.append(addButton);

  const viaButton = document.createElement("button");
  viaButton.type = "button";
  viaButton.textContent = "Add via";
  viaButton.addEventListener("click", () => {
    const checkpoint = addManualCheckpoint(latlng, route, "via");
    map.closePopup();
    state.checkpointMarkers.get(checkpoint.id)?.openPopup();
  });
  container.append(viaButton);

  L.popup()
    .setLatLng(latlng)
    .setContent(container)
    .openOn(map);
}

function getCheckpointPopupHtml(checkpoint) {
  const popupImage = checkpoint.thumbnailUrl
    ? `<img alt="" src="${escapeHtml(checkpoint.thumbnailUrl)}" onerror="this.hidden=true">`
    : "";
  const routeMeta = getCheckpointRouteMeta(checkpoint);
  const segmentLine = routeMeta.segment
    ? `<span>${escapeHtml(routeMeta.segment)}</span>`
    : "";
  const title = checkpoint.displayName || (getWaypointType(checkpoint) === "via" ? "Via" : checkpoint.filename);
  const sourceLine = checkpoint.sourceFilename
    ? `<span>${escapeHtml(checkpoint.sourceFilename)}</span>`
    : "";
  const waypointLine = checkpoint.virtual
    ? ""
    : `<span>${getWaypointType(checkpoint) === "via" ? "Via point" : "Checkpoint"}</span>`;

  return `
    <div class="popup">
      ${popupImage}
      <strong>${escapeHtml(title)}</strong>
      ${sourceLine}
      ${waypointLine}
      <span>${escapeHtml(checkpoint.gridRef)}</span>
      <span>${escapeHtml(routeMeta.alongRoute)}</span>
      ${segmentLine}
      <span>${checkpoint.latitude.toFixed(6)}, ${checkpoint.longitude.toFixed(6)}</span>
    </div>
  `;
}

function getCheckpointMarkerIcon(checkpoint) {
  return getWaypointType(checkpoint) === "via" ? viaIcon : checkpointIcon;
}

function updateCheckpointMarker(checkpoint) {
  const marker = state.checkpointMarkers.get(checkpoint.id);
  if (marker) {
    marker.setIcon(getCheckpointMarkerIcon(checkpoint));
    marker.bindPopup(getCheckpointPopupHtml(checkpoint));
  }
}

function addCheckpointMarker(checkpoint) {
  const marker = L.marker([checkpoint.latitude, checkpoint.longitude], { icon: getCheckpointMarkerIcon(checkpoint) })
    .bindPopup(getCheckpointPopupHtml(checkpoint))
    .addTo(map);
  state.checkpointMarkers.set(checkpoint.id, marker);
}

function renderEndpointMarkers() {
  for (const marker of state.endpointMarkers.values()) {
    marker.remove();
  }
  state.endpointMarkers.clear();

  const activeRoute = getActiveRoute();
  if (!activeRoute || !activeRoute.visible) {
    return;
  }

  for (const endpoint of [makeRouteEndpoint(activeRoute, "start"), makeRouteEndpoint(activeRoute, "end")].filter(Boolean)) {
    const marker = L.marker([endpoint.latitude, endpoint.longitude], {
      icon: endpoint.kind === "start" ? startIcon : endIcon
    })
      .bindPopup(getCheckpointPopupHtml(endpoint))
      .addTo(map);
    state.endpointMarkers.set(endpoint.id, marker);
  }
}

function getAllBounds() {
  const bounds = L.latLngBounds([]);
  for (const route of state.routes) {
    const layer = state.routeLayers.get(route.id);
    if (layer && route.visible) {
      bounds.extend(layer.getBounds());
    }
  }
  for (const checkpoint of state.checkpoints) {
    bounds.extend([checkpoint.latitude, checkpoint.longitude]);
  }
  return bounds.isValid() ? bounds : null;
}

function fitAll() {
  const bounds = getAllBounds();
  if (bounds) {
    map.fitBounds(bounds.pad(0.18));
  } else {
    map.setView(sussexCenter, 10);
  }
}

function renderSettingsControls() {
  for (const radio of elements.distanceUnitRadios) {
    radio.checked = radio.value === state.settings.distanceUnit;
  }
  elements.speedSummary.textContent = formatSettingsSummary();
  elements.speedUnitLabel.textContent = getSpeedUnitLabel();
  elements.targetSpeed.value = formatSpeedValue(getTargetSpeedForDisplay());
  elements.checkpointStop.value = String(state.settings.checkpointStopMinutes);
}

function getExportOptions() {
  return {
    distanceUnit: state.settings.distanceUnit,
    targetSpeedMph: state.settings.targetSpeedMph,
    targetSpeedLabel: formatTargetSpeed(),
    checkpointStopMinutes: state.settings.checkpointStopMinutes,
    startTime: state.settings.startTime
  };
}

function openSettingsDialog() {
  renderSettingsControls();
  elements.settingsDialog.showModal();
  elements.targetSpeed.focus();
  elements.targetSpeed.select();
}

function closeSettingsDialog() {
  elements.targetSpeed.setCustomValidity("");
  elements.checkpointStop.setCustomValidity("");
  elements.settingsDialog.close();
}

function saveSettingsFromDialog() {
  const displaySpeed = Number(elements.targetSpeed.value);
  const checkpointStopMinutes = Number(elements.checkpointStop.value);
  if (!Number.isFinite(displaySpeed) || displaySpeed <= 0) {
    elements.targetSpeed.setCustomValidity("Enter a target speed greater than zero.");
    elements.targetSpeed.reportValidity();
    return;
  }
  if (!Number.isFinite(checkpointStopMinutes) || checkpointStopMinutes < 0) {
    elements.checkpointStop.setCustomValidity("Enter a checkpoint stop duration of zero minutes or more.");
    elements.checkpointStop.reportValidity();
    return;
  }

  elements.targetSpeed.setCustomValidity("");
  elements.checkpointStop.setCustomValidity("");
  state.settings.targetSpeedMph = displaySpeedToMph(displaySpeed);
  state.settings.checkpointStopMinutes = Math.round(checkpointStopMinutes);
  saveSettingsToBrowser();
  renderSettingsControls();
  renderCheckpoints();
  elements.settingsDialog.close();
}

function renderRoutes() {
  if (state.routes.length === 0) {
    elements.routeList.className = "item-list empty-state";
    elements.routeList.textContent = "No routes imported.";
    return;
  }

  elements.routeList.className = "item-list";
  elements.routeList.innerHTML = state.routes.map((route) => `
    <article class="list-item" data-route-id="${route.id}">
      <div class="item-main">
        <div class="item-title"><span class="route-swatch"></span>${escapeHtml(route.displayName)}</div>
        <div class="item-meta">${escapeHtml(route.filename)}</div>
      </div>
      <div class="item-actions">
        <button type="button" data-action="toggle-route">${route.visible ? "Hide" : "Show"}</button>
        <button type="button" data-action="zoom-route">Zoom</button>
        <button type="button" data-action="remove-route">Remove</button>
      </div>
    </article>
  `).join("");
}

function renderCheckpoints() {
  const scheduledCheckpoints = getScheduledCheckpoints();
  elements.exportCsv.disabled = scheduledCheckpoints.length === 0;
  elements.exportGeojson.disabled = scheduledCheckpoints.length === 0;
  renderEndpointMarkers();

  if (scheduledCheckpoints.length === 0) {
    elements.checkpointList.className = "item-list empty-state";
    elements.checkpointList.textContent = "No checkpoints added.";
    return;
  }

  for (const checkpoint of state.checkpoints) {
    updateCheckpointMarker(checkpoint);
  }

  for (const checkpoint of scheduledCheckpoints) {
    if (checkpoint.virtual) {
      const marker = state.endpointMarkers.get(checkpoint.id);
      marker?.bindPopup(getCheckpointPopupHtml(checkpoint));
    }
  }

  elements.checkpointList.className = "checkpoint-timeline";
  elements.checkpointList.innerHTML = scheduledCheckpoints.map((checkpoint, index) => {
    const isStart = checkpoint.kind === "start";
    const isEnd = checkpoint.kind === "end";
    const itemIdAttribute = checkpoint.virtual
      ? `data-endpoint-id="${checkpoint.id}"`
      : `data-checkpoint-id="${checkpoint.id}"`;
    const legRow = index === 0 || !Number.isFinite(checkpoint.segmentFromPreviousMeters)
      ? ""
      : `
        <div class="timeline-leg">
          <span>${escapeHtml(formatDistance(checkpoint.segmentFromPreviousMeters))}</span>
          <span>${escapeHtml(formatDurationMinutes(checkpoint.legTravelMinutes))} at ${escapeHtml(formatTargetSpeed())}</span>
        </div>
      `;
    const startTimeControl = isStart
      ? `
        <label class="start-time-control">
          <span>Start time</span>
          <input id="schedule-start-time" type="time" value="${escapeHtml(state.settings.startTime)}">
        </label>
      `
      : "";
    const scheduleLine = isStart
      ? ""
      : isEnd
        ? checkpoint.arrivalTime
          ? `<div class="item-meta">Estimated finish ${escapeHtml(checkpoint.arrivalTime)}</div>`
          : ""
        : checkpoint.arrivalTime
          ? `<div class="item-meta">Arrive ${escapeHtml(checkpoint.arrivalTime)} - stop ${checkpoint.stopMinutes} min - leave ${escapeHtml(checkpoint.departureTime)}</div>`
          : `<div class="item-meta">Stop ${checkpoint.stopMinutes} min</div>`;
    const viaRows = checkpoint.viaPoints?.map((viaPoint) => `
      <article class="list-item checkpoint-row via-row" data-checkpoint-id="${viaPoint.id}">
        <div class="item-main">
          <div class="item-title">${escapeHtml(viaPoint.displayName || "Via")}</div>
          <div class="item-meta">${escapeHtml(viaPoint.gridRef)}</div>
          ${viaPoint.sourceFilename ? `<div class="item-meta">${escapeHtml(viaPoint.sourceFilename)}</div>` : ""}
        </div>
        <div class="item-actions">
          <button type="button" data-action="zoom-checkpoint">Zoom</button>
          <button type="button" data-action="make-checkpoint">Make checkpoint</button>
          <button type="button" data-action="remove-checkpoint">Remove</button>
        </div>
      </article>
    `).join("") || "";
    const typeButton = checkpoint.virtual
      ? ""
      : `<button type="button" data-action="make-via">Make via</button>`;
    const removeButton = checkpoint.virtual
      ? ""
      : `<button type="button" data-action="remove-checkpoint">Remove</button>`;

    return `
      ${legRow}
      ${viaRows}
      <article class="list-item checkpoint-row" ${itemIdAttribute}>
        <div class="item-main">
          <div class="item-title">${escapeHtml(checkpoint.displayName || checkpoint.filename)}</div>
          <div class="item-meta">${escapeHtml(checkpoint.gridRef)}</div>
          ${startTimeControl}
          ${scheduleLine}
        </div>
        <div class="item-actions">
          <button type="button" data-action="zoom-checkpoint">Zoom</button>
          ${typeButton}
          ${removeButton}
        </div>
      </article>
    `;
  }).join("");
}

function renderWarnings() {
  if (state.warnings.length === 0) {
    elements.warningList.className = "warning-list empty-state";
    elements.warningList.textContent = "No warnings.";
    return;
  }

  elements.warningList.className = "warning-list";
  elements.warningList.innerHTML = state.warnings.map((warning) => `
    <div class="warning-item">${escapeHtml(warning.message)}</div>
  `).join("");
}

async function handleGpxFiles(files) {
  for (const file of files) {
    try {
      const route = prepareRoute(await parseGpxFile(file));
      state.routes.push(route);
      addRouteLayer(route);
    } catch (error) {
      addWarning(error.message || `${file.name}: could not import GPX.`);
    }
  }
  renderRoutes();
  renderCheckpoints();
  saveRoutesToBrowser();
  fitAll();
}

async function handlePhotoFiles(files) {
  let checkpointAdded = false;
  for (const file of files) {
    try {
      const result = await extractCheckpoint(file);
      if (result.type === "checkpoint") {
        result.checkpoint.sequence = ++checkpointSequence;
        result.checkpoint.waypointType = "checkpoint";
        assignCheckpointRouteMetrics(result.checkpoint);
        state.checkpoints.push(result.checkpoint);
        addCheckpointMarker(result.checkpoint);
        checkpointAdded = true;
      } else {
        addWarning(result.message);
      }
    } catch (error) {
      addWarning(error.message || `${file.name}: could not import photo.`);
    }
  }
  if (checkpointAdded) {
    saveCheckpointsToBrowser();
  }
  renderCheckpoints();
  fitAll();
}

function addManualCheckpoint(latlng, route, waypointType = "checkpoint") {
  let gridRef;
  try {
    gridRef = formatSixFigureGridRef(latlng.lat, latlng.lng);
  } catch (error) {
    addWarning(`Manual checkpoint: ${error.message || "could not calculate OS grid reference."}`);
    throw error;
  }

  manualCheckpointCount += 1;
  const checkpoint = {
    id: crypto.randomUUID(),
    sequence: ++checkpointSequence,
    filename: `Manual checkpoint ${manualCheckpointCount}`,
    latitude: latlng.lat,
    longitude: latlng.lng,
    gridRef,
    timestamp: "",
    thumbnailUrl: "",
    waypointType: waypointType === "via" ? "via" : "checkpoint",
    status: route ? `manual: ${route.displayName}` : "manual"
  };
  assignCheckpointRouteMetrics(checkpoint, route);
  state.checkpoints.push(checkpoint);
  addCheckpointMarker(checkpoint);
  saveCheckpointsToBrowser();
  renderCheckpoints();
  return checkpoint;
}

function installFileInput(input, handler) {
  input.addEventListener("change", async () => {
    const files = [...input.files];
    input.value = "";
    await handler(files);
  });
}

function installDropZone(dropZone, handler) {
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  }

  dropZone.addEventListener("drop", async (event) => {
    const files = [...event.dataTransfer.files];
    await handler(files);
  });
}

elements.routeList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const item = event.target.closest("[data-route-id]");
  if (!button || !item) {
    return;
  }

  const route = state.routes.find((candidate) => candidate.id === item.dataset.routeId);
  const layer = state.routeLayers.get(item.dataset.routeId);
  if (!route || !layer) {
    return;
  }

  if (button.dataset.action === "toggle-route") {
    route.visible = !route.visible;
    if (route.visible) {
      layer.addTo(map);
    } else {
      layer.remove();
    }
    renderRoutes();
    renderCheckpoints();
    saveRoutesToBrowser();
  }

  if (button.dataset.action === "zoom-route") {
    map.fitBounds(layer.getBounds().pad(0.18));
  }

  if (button.dataset.action === "remove-route") {
    layer.remove();
    state.routeLayers.delete(route.id);
    for (const marker of state.endpointMarkers.values()) {
      marker.remove();
    }
    state.endpointMarkers.clear();
    state.routes = state.routes.filter((candidate) => candidate.id !== route.id);
    renderRoutes();
    renderCheckpoints();
    saveRoutesToBrowser();
  }
});

elements.checkpointList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const item = event.target.closest("[data-checkpoint-id], [data-endpoint-id]");
  if (!button || !item) {
    return;
  }

  const isEndpoint = Boolean(item.dataset.endpointId);
  const checkpoint = isEndpoint
    ? getScheduledCheckpoints().find((candidate) => candidate.id === item.dataset.endpointId)
    : state.checkpoints.find((candidate) => candidate.id === item.dataset.checkpointId);
  const marker = isEndpoint
    ? state.endpointMarkers.get(item.dataset.endpointId)
    : state.checkpointMarkers.get(item.dataset.checkpointId);
  if (!checkpoint || !marker) {
    return;
  }

  if (button.dataset.action === "zoom-checkpoint") {
    map.setView([checkpoint.latitude, checkpoint.longitude], 15);
    marker.openPopup();
  }

  if (button.dataset.action === "make-via" && !isEndpoint) {
    setWaypointType(checkpoint, "via");
  }

  if (button.dataset.action === "make-checkpoint" && !isEndpoint) {
    setWaypointType(checkpoint, "checkpoint");
  }

  if (button.dataset.action === "remove-checkpoint" && !isEndpoint) {
    marker.remove();
    state.checkpointMarkers.delete(checkpoint.id);
    revokeCheckpointThumbnail(checkpoint);
    state.checkpoints = state.checkpoints.filter((candidate) => candidate.id !== checkpoint.id);
    saveCheckpointsToBrowser();
    renderCheckpoints();
  }
});

elements.checkpointList.addEventListener("change", (event) => {
  if (event.target.id !== "schedule-start-time") {
    return;
  }
  state.settings.startTime = event.target.value;
  saveSettingsToBrowser();
  renderCheckpoints();
});

for (const radio of elements.distanceUnitRadios) {
  radio.addEventListener("change", () => {
    if (!radio.checked) {
      return;
    }
    state.settings.distanceUnit = radio.value === "km" ? "km" : "miles";
    saveSettingsToBrowser();
    renderSettingsControls();
    renderCheckpoints();
  });
}

elements.settingsOpen.addEventListener("click", openSettingsDialog);
elements.settingsClose.addEventListener("click", closeSettingsDialog);
elements.settingsCancel.addEventListener("click", closeSettingsDialog);
elements.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettingsFromDialog();
});
elements.targetSpeed.addEventListener("input", () => elements.targetSpeed.setCustomValidity(""));
elements.checkpointStop.addEventListener("input", () => elements.checkpointStop.setCustomValidity(""));
elements.exportCsv.addEventListener("click", () => downloadCheckpointCsv(getScheduledCheckpoints(), getExportOptions()));
elements.exportGeojson.addEventListener("click", () => downloadCheckpointGeojson(getScheduledCheckpoints(), getExportOptions()));
elements.fitAll.addEventListener("click", fitAll);

installFileInput(elements.gpxInput, handleGpxFiles);
installFileInput(elements.photoInput, handlePhotoFiles);
installDropZone(elements.gpxDrop, handleGpxFiles);
installDropZone(elements.photoDrop, handlePhotoFiles);

loadRoutesFromBrowser();
loadCheckpointsFromBrowser();
renderSettingsControls();
renderRoutes();
renderCheckpoints();
renderWarnings();
fitAll();

if (new URLSearchParams(location.search).has("testHooks")) {
  window.__hrcTest = {
    routeCount: () => state.routes.length,
    routeNames: () => state.routes.map((route) => route.displayName),
    addManualCheckpointAt: (latitude, longitude, waypointType = "checkpoint") => addManualCheckpoint(L.latLng(latitude, longitude), null, waypointType),
    checkpointCount: () => state.checkpoints.length,
    checkpointGridRefs: () => state.checkpoints.map((checkpoint) => checkpoint.gridRef),
    checkpointRows: () => getOrderedCheckpoints().map((checkpoint) => ({
      filename: checkpoint.filename,
      gridRef: checkpoint.gridRef,
      routeName: checkpoint.routeName || "",
      waypointType: getWaypointType(checkpoint),
      routeOffsetMeters: checkpoint.routeOffsetMeters ?? null,
      segmentFromPreviousMeters: checkpoint.segmentFromPreviousMeters ?? null
    })),
    setWaypointType: (id, waypointType) => {
      const checkpoint = state.checkpoints.find((candidate) => candidate.id === id);
      if (!checkpoint) {
        throw new Error("Checkpoint not found.");
      }
      setWaypointType(checkpoint, waypointType);
    },
    settings: () => ({
      distanceUnit: state.settings.distanceUnit,
      targetSpeedMph: state.settings.targetSpeedMph,
      targetSpeedLabel: formatTargetSpeed(),
      checkpointStopMinutes: state.settings.checkpointStopMinutes,
      startTime: state.settings.startTime
    }),
    setDistanceUnit: (distanceUnit) => {
      state.settings.distanceUnit = distanceUnit === "km" ? "km" : "miles";
      saveSettingsToBrowser();
      renderSettingsControls();
      renderCheckpoints();
    },
    setTargetSpeedMph: (targetSpeedMph) => {
      const speed = Number(targetSpeedMph);
      if (!Number.isFinite(speed) || speed <= 0) {
        throw new Error("Target speed must be greater than zero.");
      }
      state.settings.targetSpeedMph = speed;
      saveSettingsToBrowser();
      renderSettingsControls();
      renderCheckpoints();
    },
    setCheckpointStopMinutes: (minutes) => {
      const stopMinutes = Number(minutes);
      if (!Number.isFinite(stopMinutes) || stopMinutes < 0) {
        throw new Error("Checkpoint stop minutes must be zero or more.");
      }
      state.settings.checkpointStopMinutes = Math.round(stopMinutes);
      saveSettingsToBrowser();
      renderSettingsControls();
      renderCheckpoints();
    },
    setStartTime: (startTime) => {
      state.settings.startTime = /^\d{2}:\d{2}$/.test(startTime) ? startTime : "";
      saveSettingsToBrowser();
      renderCheckpoints();
    },
    scheduledRows: () => getScheduledCheckpoints().map((checkpoint) => ({
      displayName: checkpoint.displayName,
      gridRef: checkpoint.gridRef,
      segmentFromPreviousMeters: checkpoint.segmentFromPreviousMeters ?? null,
      arrivalTime: checkpoint.arrivalTime,
      departureTime: checkpoint.departureTime,
      stopMinutes: checkpoint.stopMinutes,
      kind: checkpoint.kind,
      viaGridRefs: checkpoint.viaPoints?.map((viaPoint) => viaPoint.gridRef) || []
    })),
    importGpxText: async (text, filename = "test-route.gpx") => {
      await handleGpxFiles([new File([text], filename, { type: "application/gpx+xml" })]);
    },
    savedCheckpointPayload: () => JSON.parse(localStorage.getItem(checkpointStorageKey) || "null"),
    clearSavedCheckpoints: () => {
      localStorage.removeItem(checkpointStorageKey);
      for (const checkpoint of state.checkpoints) {
        revokeCheckpointThumbnail(checkpoint);
      }
      for (const marker of state.checkpointMarkers.values()) {
        marker.remove();
      }
      state.checkpoints = [];
      state.checkpointMarkers.clear();
      renderCheckpoints();
      fitAll();
    },
    clearSavedRoutes: () => {
      localStorage.removeItem(routeStorageKey);
      for (const layer of state.routeLayers.values()) {
        layer.remove();
      }
      for (const marker of state.endpointMarkers.values()) {
        marker.remove();
      }
      state.routes = [];
      state.routeLayers.clear();
      state.endpointMarkers.clear();
      renderRoutes();
      renderCheckpoints();
      fitAll();
    }
  };
}
