import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMapRef } from '../context/MapContext';
import { useCheckpoints } from '../context/CheckpointsContext';
import { useWarnings } from '../context/WarningsContext';
import { formatSixFigureGridRef } from '../lib/gridref';
import { getCheckpointRouteMeta } from '../lib/format';
import { flattenScheduledCheckpoints } from '../lib/schedule';
import { SUSSEX_CENTER, DEFAULT_ZOOM } from '../lib/mapBounds';
import type { RouteRecord, ScheduledCheckpoint, Settings, WaypointType } from '../lib/types';

const checkpointIcon = L.divIcon({
  className: '',
  html: '<div class="checkpoint-icon"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -8],
});

const viaIcon = L.divIcon({
  className: '',
  html: '<div class="checkpoint-icon via-icon"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -7],
});

const startIcon = L.divIcon({
  className: '',
  html: '<div class="checkpoint-icon endpoint-icon start-icon"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -9],
});

const endIcon = L.divIcon({
  className: '',
  html: '<div class="checkpoint-icon endpoint-icon end-icon"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -9],
});

function routeStyle() {
  return { color: '#d7432f', opacity: 0.9, weight: 4 };
}

function markerIconFor(checkpoint: ScheduledCheckpoint): L.DivIcon {
  if (checkpoint.kind === 'start') return startIcon;
  if (checkpoint.kind === 'end') return endIcon;
  return checkpoint.kind === 'via' ? viaIcon : checkpointIcon;
}

function buildPopupElement(checkpoint: ScheduledCheckpoint, settings: Settings): HTMLElement {
  const container = document.createElement('div');
  container.className = 'popup';

  if (checkpoint.thumbnailUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = checkpoint.thumbnailUrl;
    image.addEventListener('error', () => {
      image.hidden = true;
    });
    container.append(image);
  }

  const title = document.createElement('strong');
  title.textContent = checkpoint.displayName || (checkpoint.kind === 'via' ? 'Via' : checkpoint.filename);
  container.append(title);

  if (checkpoint.sourceFilename) {
    const source = document.createElement('span');
    source.textContent = checkpoint.sourceFilename;
    container.append(source);
  }

  if (!checkpoint.virtual) {
    const waypointLine = document.createElement('span');
    waypointLine.textContent = checkpoint.kind === 'via' ? 'Via point' : 'Checkpoint';
    container.append(waypointLine);
  }

  const gridRefLine = document.createElement('span');
  gridRefLine.textContent = checkpoint.gridRef;
  container.append(gridRefLine);

  const routeMeta = getCheckpointRouteMeta(checkpoint, settings);
  const alongRouteLine = document.createElement('span');
  alongRouteLine.textContent = routeMeta.alongRoute;
  container.append(alongRouteLine);

  if (routeMeta.segment) {
    const segmentLine = document.createElement('span');
    segmentLine.textContent = routeMeta.segment;
    container.append(segmentLine);
  }

  const coordinates = document.createElement('span');
  coordinates.textContent = `${checkpoint.latitude.toFixed(6)}, ${checkpoint.longitude.toFixed(6)}`;
  container.append(coordinates);

  return container;
}

interface MapViewProps {
  routes: RouteRecord[];
  scheduledCheckpoints: ScheduledCheckpoint[];
  settings: Settings;
  selectedCheckpointId: string | null;
}

export function MapView({ routes, scheduledCheckpoints, settings, selectedCheckpointId }: MapViewProps) {
  const mapRef = useMapRef();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const routeLayersRef = useRef(new Map<string, L.GeoJSON>());
  const markersRef = useRef(new Map<string, L.Marker>());
  const { addManualCheckpoint } = useCheckpoints();
  const { addWarning } = useWarnings();
  const addManualCheckpointRef = useRef(addManualCheckpoint);
  addManualCheckpointRef.current = addManualCheckpoint;
  const addWarningRef = useRef(addWarning);
  addWarningRef.current = addWarning;

  // Mount the Leaflet map once — it's imperative and outlives individual renders.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(SUSSEX_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRouteClick(latlng: L.LatLng) {
    const map = mapRef.current;
    if (!map) return;

    let gridRef: string;
    try {
      gridRef = formatSixFigureGridRef(latlng.lat, latlng.lng);
    } catch (error) {
      addWarningRef.current(`Route click: ${error instanceof Error ? error.message : 'could not calculate OS grid reference.'}`);
      return;
    }

    const container = document.createElement('div');
    container.className = 'popup';

    const gridRefElement = document.createElement('strong');
    gridRefElement.textContent = gridRef;
    container.append(gridRefElement);

    const coordinatesElement = document.createElement('span');
    coordinatesElement.textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    container.append(coordinatesElement);

    function addPoint(waypointType: WaypointType) {
      addManualCheckpointRef.current(latlng.lat, latlng.lng, waypointType);
      map!.closePopup();
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add checkpoint';
    addButton.addEventListener('click', () => addPoint('checkpoint'));
    container.append(addButton);

    const viaButton = document.createElement('button');
    viaButton.type = 'button';
    viaButton.textContent = 'Add via';
    viaButton.addEventListener('click', () => addPoint('via'));
    container.append(viaButton);

    L.popup().setLatLng(latlng).setContent(container).openOn(map);
  }

  // Reconcile route layers: add layers for new routes, remove layers for routes no
  // longer present, and toggle visibility without rebuilding the geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(routes.map((route) => route.id));
    for (const [id, layer] of routeLayersRef.current) {
      if (!currentIds.has(id)) {
        layer.remove();
        routeLayersRef.current.delete(id);
      }
    }

    for (const route of routes) {
      let layer = routeLayersRef.current.get(route.id);
      if (!layer) {
        layer = L.geoJSON(route.geojson, {
          style: routeStyle,
          pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, { radius: 5, color: '#d7432f', fillColor: '#ffffff', fillOpacity: 1, weight: 2 }),
          onEachFeature: (_feature, layerInstance) => {
            layerInstance.on('click', (event) => handleRouteClick(event.latlng));
          },
        });
        routeLayersRef.current.set(route.id, layer);
      }
      const onMap = map.hasLayer(layer);
      if (route.visible && !onMap) layer.addTo(map);
      if (!route.visible && onMap) layer.remove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);

  // Reconcile checkpoint/via/endpoint markers: update icon+popup for existing markers
  // (preserving the marker instance so an open popup isn't yanked away mid-view),
  // create markers for new checkpoints, remove markers for ones no longer present.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const flattened = flattenScheduledCheckpoints(scheduledCheckpoints);
    const currentIds = new Set(flattened.map((checkpoint) => checkpoint.id));
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const checkpoint of flattened) {
      let marker = markersRef.current.get(checkpoint.id);
      if (!marker) {
        marker = L.marker([checkpoint.latitude, checkpoint.longitude], { icon: markerIconFor(checkpoint) }).addTo(map);
        markersRef.current.set(checkpoint.id, marker);
      } else {
        marker.setLatLng([checkpoint.latitude, checkpoint.longitude]);
        marker.setIcon(markerIconFor(checkpoint));
      }
      marker.bindPopup(buildPopupElement(checkpoint, settings));
    }
  }, [scheduledCheckpoints, settings, mapRef]);

  // Pan to and open the popup of whichever checkpoint the panel's "Zoom" button
  // targeted most recently.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCheckpointId) return;
    const marker = markersRef.current.get(selectedCheckpointId);
    if (!marker) return;
    map.setView(marker.getLatLng(), 15);
    marker.openPopup();
  }, [selectedCheckpointId, mapRef]);

  return (
    <section className="map-region" aria-label="Map">
      <div ref={containerRef} className="map" />
    </section>
  );
}
