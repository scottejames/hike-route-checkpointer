import { gpx } from '@tmcw/togeojson';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { RouteRecord } from './types';

function getFeatureCount(geojson: FeatureCollection): number {
  return geojson.features?.length ?? 0;
}

function hasValidBounds(geojson: FeatureCollection): boolean {
  return L.geoJSON(geojson).getBounds().isValid();
}

export async function parseGpxFile(file: File): Promise<RouteRecord> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`${file.name} is not valid XML.`);
  }

  const geojson = gpx(doc) as FeatureCollection;
  if (!hasValidBounds(geojson) || getFeatureCount(geojson) === 0) {
    throw new Error(`${file.name} did not contain route, track, or waypoint data.`);
  }

  const displayName = doc.querySelector('metadata > name, trk > name, rte > name')?.textContent?.trim() || file.name;

  return {
    id: crypto.randomUUID(),
    filename: file.name,
    displayName,
    geojson,
    visible: true,
  };
}
