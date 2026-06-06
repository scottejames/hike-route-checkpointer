import { parseGpxFile } from "./gpx.js";
import { extractCheckpoint, revokeCheckpointThumbnail } from "./photos.js";
import { downloadCheckpointCsv, downloadCheckpointGeojson } from "./export.js";

const sussexCenter = [50.92, -0.32];
const routeStorageKey = "hike-route-checkpointer.routes.v1";
const state = {
  routes: [],
  checkpoints: [],
  warnings: [],
  routeLayers: new Map(),
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
  fitAll: document.querySelector("#fit-all")
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
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

    const route = {
      id: savedRoute.id || crypto.randomUUID(),
      filename: savedRoute.filename || "Saved route",
      displayName: savedRoute.displayName || savedRoute.filename || "Saved route",
      geojson: savedRoute.geojson,
      visible: savedRoute.visible !== false,
      bounds
    };
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
      const name = feature.properties?.name || route.displayName;
      layerInstance.bindPopup(`<div class="popup"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(route.filename)}</span></div>`);
    }
  }).addTo(map);
  state.routeLayers.set(route.id, layer);
}

function addCheckpointMarker(checkpoint) {
  const popupImage = checkpoint.thumbnailUrl
    ? `<img alt="" src="${escapeHtml(checkpoint.thumbnailUrl)}" onerror="this.hidden=true">`
    : "";
  const marker = L.marker([checkpoint.latitude, checkpoint.longitude], { icon: checkpointIcon })
    .bindPopup(`
      <div class="popup">
        ${popupImage}
        <strong>${escapeHtml(checkpoint.filename)}</strong>
        <span>${escapeHtml(checkpoint.gridRef)}</span>
        <span>${checkpoint.latitude.toFixed(6)}, ${checkpoint.longitude.toFixed(6)}</span>
      </div>
    `)
    .addTo(map);
  state.checkpointMarkers.set(checkpoint.id, marker);
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
  elements.exportCsv.disabled = state.checkpoints.length === 0;
  elements.exportGeojson.disabled = state.checkpoints.length === 0;

  if (state.checkpoints.length === 0) {
    elements.checkpointList.className = "item-list empty-state";
    elements.checkpointList.textContent = "No checkpoints imported.";
    return;
  }

  elements.checkpointList.className = "item-list";
  elements.checkpointList.innerHTML = state.checkpoints.map((checkpoint) => `
    <article class="list-item" data-checkpoint-id="${checkpoint.id}">
      <div class="item-main">
        <div class="item-title">${escapeHtml(checkpoint.filename)}</div>
        <div class="item-meta">${escapeHtml(checkpoint.gridRef)}</div>
        <div class="item-meta">${checkpoint.latitude.toFixed(6)}, ${checkpoint.longitude.toFixed(6)}</div>
      </div>
      <div class="item-actions">
        <button type="button" data-action="zoom-checkpoint">Zoom</button>
        <button type="button" data-action="remove-checkpoint">Remove</button>
      </div>
    </article>
  `).join("");
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
      const route = await parseGpxFile(file);
      state.routes.push(route);
      addRouteLayer(route);
    } catch (error) {
      addWarning(error.message || `${file.name}: could not import GPX.`);
    }
  }
  renderRoutes();
  saveRoutesToBrowser();
  fitAll();
}

async function handlePhotoFiles(files) {
  for (const file of files) {
    try {
      const result = await extractCheckpoint(file);
      if (result.type === "checkpoint") {
        state.checkpoints.push(result.checkpoint);
        addCheckpointMarker(result.checkpoint);
      } else {
        addWarning(result.message);
      }
    } catch (error) {
      addWarning(error.message || `${file.name}: could not import photo.`);
    }
  }
  renderCheckpoints();
  fitAll();
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
    saveRoutesToBrowser();
  }

  if (button.dataset.action === "zoom-route") {
    map.fitBounds(layer.getBounds().pad(0.18));
  }

  if (button.dataset.action === "remove-route") {
    layer.remove();
    state.routeLayers.delete(route.id);
    state.routes = state.routes.filter((candidate) => candidate.id !== route.id);
    renderRoutes();
    saveRoutesToBrowser();
  }
});

elements.checkpointList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const item = event.target.closest("[data-checkpoint-id]");
  if (!button || !item) {
    return;
  }

  const checkpoint = state.checkpoints.find((candidate) => candidate.id === item.dataset.checkpointId);
  const marker = state.checkpointMarkers.get(item.dataset.checkpointId);
  if (!checkpoint || !marker) {
    return;
  }

  if (button.dataset.action === "zoom-checkpoint") {
    map.setView([checkpoint.latitude, checkpoint.longitude], 15);
    marker.openPopup();
  }

  if (button.dataset.action === "remove-checkpoint") {
    marker.remove();
    state.checkpointMarkers.delete(checkpoint.id);
    revokeCheckpointThumbnail(checkpoint);
    state.checkpoints = state.checkpoints.filter((candidate) => candidate.id !== checkpoint.id);
    renderCheckpoints();
  }
});

elements.exportCsv.addEventListener("click", () => downloadCheckpointCsv(state.checkpoints));
elements.exportGeojson.addEventListener("click", () => downloadCheckpointGeojson(state.checkpoints));
elements.fitAll.addEventListener("click", fitAll);

installFileInput(elements.gpxInput, handleGpxFiles);
installFileInput(elements.photoInput, handlePhotoFiles);
installDropZone(elements.gpxDrop, handleGpxFiles);
installDropZone(elements.photoDrop, handlePhotoFiles);

loadRoutesFromBrowser();
renderRoutes();
renderCheckpoints();
renderWarnings();
fitAll();

if (new URLSearchParams(location.search).has("testHooks")) {
  window.__hrcTest = {
    routeCount: () => state.routes.length,
    routeNames: () => state.routes.map((route) => route.displayName),
    importGpxText: async (text, filename = "test-route.gpx") => {
      await handleGpxFiles([new File([text], filename, { type: "application/gpx+xml" })]);
    },
    clearSavedRoutes: () => {
      localStorage.removeItem(routeStorageKey);
      for (const layer of state.routeLayers.values()) {
        layer.remove();
      }
      state.routes = [];
      state.routeLayers.clear();
      renderRoutes();
      fitAll();
    }
  };
}
