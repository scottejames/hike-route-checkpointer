import L from 'leaflet';
import type { RouteRecord, ScheduledCheckpoint } from './types';

export const SUSSEX_CENTER: L.LatLngTuple = [50.92, -0.32];
export const DEFAULT_ZOOM = 10;

export function getAllBounds(routes: RouteRecord[], checkpoints: ScheduledCheckpoint[]): L.LatLngBounds | null {
  const bounds = L.latLngBounds([]);
  for (const route of routes) {
    if (!route.visible) continue;
    const routeBounds = L.geoJSON(route.geojson).getBounds();
    if (routeBounds.isValid()) {
      bounds.extend(routeBounds);
    }
  }
  for (const checkpoint of checkpoints) {
    bounds.extend([checkpoint.latitude, checkpoint.longitude]);
  }
  return bounds.isValid() ? bounds : null;
}

export function fitAll(map: L.Map, routes: RouteRecord[], checkpoints: ScheduledCheckpoint[]): void {
  const bounds = getAllBounds(routes, checkpoints);
  if (bounds) {
    map.fitBounds(bounds.pad(0.18));
  } else {
    map.setView(SUSSEX_CENTER, DEFAULT_ZOOM);
  }
}
