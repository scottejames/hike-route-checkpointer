import L from 'leaflet';
import { formatSixFigureGridRef } from './gridref';
import type { CheckpointRecord, RouteRecord, ScheduledCheckpoint, ScheduledKind, Settings, WaypointType } from './types';

const earthRadiusMeters = 6371008.8;
const metersPerMile = 1609.344;

interface LatLngPoint {
  lat: number;
  lng: number;
}

interface RouteSegment {
  start: LatLngPoint;
  end: LatLngPoint;
  lengthMeters: number;
  startOffsetMeters: number;
}

export interface RouteMeasure {
  segments: RouteSegment[];
  startPoint: LatLngPoint | null;
  endPoint: LatLngPoint | null;
  totalMeters: number;
}

export interface RouteWithMeasure extends RouteRecord {
  measure: RouteMeasure;
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function coordinateToLatLng(coordinate: number[]): LatLngPoint | null {
  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

function collectLineStrings(geometry: GeoJSON.Geometry | null | undefined, lines: LatLngPoint[][] = []): LatLngPoint[][] {
  if (!geometry) {
    return lines;
  }

  if (geometry.type === 'LineString') {
    const points = geometry.coordinates.map(coordinateToLatLng).filter((point): point is LatLngPoint => point !== null);
    if (points.length > 1) {
      lines.push(points);
    }
  }

  if (geometry.type === 'MultiLineString') {
    for (const coordinates of geometry.coordinates) {
      const points = coordinates.map(coordinateToLatLng).filter((point): point is LatLngPoint => point !== null);
      if (points.length > 1) {
        lines.push(points);
      }
    }
  }

  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) {
      collectLineStrings(child, lines);
    }
  }

  return lines;
}

function getGeojsonLineStrings(geojson: GeoJSON.FeatureCollection): LatLngPoint[][] {
  const lines: LatLngPoint[][] = [];
  for (const feature of geojson.features) {
    collectLineStrings(feature.geometry, lines);
  }
  return lines;
}

function buildRouteMeasure(geojson: GeoJSON.FeatureCollection): RouteMeasure {
  const segments: RouteSegment[] = [];
  let routeOffsetMeters = 0;
  let startPoint: LatLngPoint | null = null;
  let endPoint: LatLngPoint | null = null;

  for (const line of getGeojsonLineStrings(geojson)) {
    if (!startPoint) {
      startPoint = line[0];
    }
    endPoint = line[line.length - 1];
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = line[index];
      const end = line[index + 1];
      const lengthMeters = L.CRS.Earth.distance(start, end);
      if (lengthMeters <= 0) {
        continue;
      }
      segments.push({
        start,
        end,
        lengthMeters,
        startOffsetMeters: routeOffsetMeters,
      });
      routeOffsetMeters += lengthMeters;
    }
  }

  return {
    segments,
    startPoint,
    endPoint,
    totalMeters: routeOffsetMeters,
  };
}

export function prepareRoutes(routes: RouteRecord[]): RouteWithMeasure[] {
  return routes.map((route) => ({ ...route, measure: buildRouteMeasure(route.geojson as GeoJSON.FeatureCollection) }));
}

interface SegmentProjection {
  routeOffsetMeters: number;
  offRouteMeters: number;
}

function projectLatLngToSegment(latlng: LatLngPoint, segment: RouteSegment): SegmentProjection {
  const originLatRad = degToRad((latlng.lat + segment.start.lat + segment.end.lat) / 3);
  const toXY = (point: LatLngPoint) => ({
    x: earthRadiusMeters * degToRad(point.lng) * Math.cos(originLatRad),
    y: earthRadiusMeters * degToRad(point.lat),
  });
  const point = toXY(latlng);
  const start = toXY(segment.start);
  const end = toXY(segment.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  const offRouteMeters = Math.hypot(point.x - projected.x, point.y - projected.y);

  return {
    routeOffsetMeters: segment.startOffsetMeters + segment.lengthMeters * t,
    offRouteMeters,
  };
}

interface NearestRoutePosition {
  routeId: string;
  routeName: string;
  routeOffsetMeters: number;
  routeTotalMeters: number;
  offRouteMeters: number;
}

function findNearestRoutePosition(
  latlng: LatLngPoint,
  routes: RouteWithMeasure[],
  preferredRouteId?: string | null,
): NearestRoutePosition | null {
  const candidateRoutes = preferredRouteId ? routes.filter((route) => route.id === preferredRouteId) : routes;
  let nearest: NearestRoutePosition | null = null;

  for (const route of candidateRoutes) {
    for (const segment of route.measure.segments) {
      const projection = projectLatLngToSegment(latlng, segment);
      if (!nearest || projection.offRouteMeters < nearest.offRouteMeters) {
        nearest = {
          routeId: route.id,
          routeName: route.displayName,
          routeOffsetMeters: projection.routeOffsetMeters,
          routeTotalMeters: route.measure.totalMeters,
          offRouteMeters: projection.offRouteMeters,
        };
      }
    }
  }

  return nearest;
}

interface RouteMetrics {
  routeId?: string;
  routeName?: string;
  routeOffsetMeters?: number;
  routeTotalMeters?: number;
  offRouteMeters?: number;
}

function assignCheckpointRouteMetrics(
  checkpoint: CheckpointRecord,
  routes: RouteWithMeasure[],
  preferredRouteId?: string | null,
): CheckpointRecord & RouteMetrics {
  const nearest = findNearestRoutePosition({ lat: checkpoint.latitude, lng: checkpoint.longitude }, routes, preferredRouteId);
  if (!nearest) {
    return { ...checkpoint };
  }

  return {
    ...checkpoint,
    routeId: nearest.routeId,
    routeName: nearest.routeName,
    routeOffsetMeters: nearest.routeOffsetMeters,
    routeTotalMeters: nearest.routeTotalMeters,
    offRouteMeters: nearest.offRouteMeters,
  };
}

export function getWaypointType(checkpoint: Pick<CheckpointRecord, 'waypointType'>): WaypointType {
  return checkpoint.waypointType === 'via' ? 'via' : 'checkpoint';
}

function routeOrderIndex(routeId: string | undefined, routes: RouteWithMeasure[]): number {
  const index = routes.findIndex((route) => route.id === routeId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

interface OrderedCheckpoint extends CheckpointRecord, RouteMetrics {
  orderIndex: number;
  segmentFromPreviousMeters: number | null;
}

function getOrderedCheckpoints(checkpoints: CheckpointRecord[], routes: RouteWithMeasure[]): OrderedCheckpoint[] {
  const withMetrics = checkpoints.map((checkpoint) => assignCheckpointRouteMetrics(checkpoint, routes));

  const ordered = [...withMetrics].sort((a, b) => {
    const aHasRoute = Number.isFinite(a.routeOffsetMeters);
    const bHasRoute = Number.isFinite(b.routeOffsetMeters);
    if (aHasRoute && bHasRoute) {
      const routeDelta = routeOrderIndex(a.routeId, routes) - routeOrderIndex(b.routeId, routes);
      if (routeDelta !== 0) {
        return routeDelta;
      }
      const offsetDelta = a.routeOffsetMeters! - b.routeOffsetMeters!;
      if (offsetDelta !== 0) {
        return offsetDelta;
      }
    } else if (aHasRoute !== bHasRoute) {
      return aHasRoute ? -1 : 1;
    }
    return (a.sequence || 0) - (b.sequence || 0);
  });

  const previousByRoute = new Map<string, OrderedCheckpoint>();
  const result: OrderedCheckpoint[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const checkpoint = ordered[index];
    let segmentFromPreviousMeters: number | null = null;
    if (Number.isFinite(checkpoint.routeOffsetMeters)) {
      const previous = previousByRoute.get(checkpoint.routeId!);
      if (previous) {
        segmentFromPreviousMeters = Math.max(0, checkpoint.routeOffsetMeters! - previous.routeOffsetMeters!);
      }
    }
    const withOrder: OrderedCheckpoint = { ...checkpoint, orderIndex: index + 1, segmentFromPreviousMeters };
    result.push(withOrder);
    if (Number.isFinite(withOrder.routeOffsetMeters)) {
      previousByRoute.set(withOrder.routeId!, withOrder);
    }
  }

  return result;
}

export function getActiveRoute(routes: RouteWithMeasure[]): RouteWithMeasure | null {
  return routes.find((route) => route.visible) || routes[0] || null;
}

function makeRouteEndpoint(route: RouteWithMeasure, kind: 'start' | 'end'): ScheduledCheckpoint | null {
  const point = kind === 'start' ? route.measure.startPoint : route.measure.endPoint;
  if (!point) {
    return null;
  }

  let gridRef = '';
  try {
    gridRef = formatSixFigureGridRef(point.lat, point.lng);
  } catch {
    gridRef = '';
  }

  const routeOffsetMeters = kind === 'start' ? 0 : route.measure.totalMeters;
  return {
    id: `endpoint:${route.id}:${kind}`,
    kind,
    virtual: true,
    displayName: kind === 'start' ? 'Start' : 'End',
    filename: kind === 'start' ? 'Start' : 'End',
    latitude: point.lat,
    longitude: point.lng,
    gridRef,
    timestamp: '',
    thumbnailUrl: '',
    status: 'route endpoint',
    routeId: route.id,
    routeOffsetMeters,
    routeTotalMeters: route.measure.totalMeters,
    offRouteMeters: 0,
    orderIndex: 0,
    segmentFromPreviousMeters: null,
    stopMinutes: 0,
    legTravelMinutes: null,
    arrivalTime: '',
    departureTime: '',
    viaPoints: [],
  };
}

function getStopMinutes(kind: ScheduledKind, settings: Settings): number {
  return kind === 'user' ? settings.checkpointStopMinutes : 0;
}

export function parseClockTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
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

export function formatClockTime(totalMinutes: number | null): string {
  if (!Number.isFinite(totalMinutes)) {
    return '';
  }
  const normalized = ((Math.round(totalMinutes as number) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getTravelMinutes(meters: number | null | undefined, settings: Settings): number | null {
  if (!Number.isFinite(meters)) {
    return null;
  }
  const speedMph = Math.max(0.1, settings.targetSpeedMph);
  return Math.round((meters as number) / metersPerMile / speedMph * 60);
}

function applySchedule(checkpoints: ScheduledCheckpoint[], settings: Settings): ScheduledCheckpoint[] {
  let clockMinutes = parseClockTime(settings.startTime);
  const scheduled: ScheduledCheckpoint[] = [];

  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = { ...checkpoints[index] };
    checkpoint.stopMinutes = getStopMinutes(checkpoint.kind, settings);
    checkpoint.legTravelMinutes = index === 0 ? null : getTravelMinutes(checkpoint.segmentFromPreviousMeters, settings);
    checkpoint.arrivalTime = clockMinutes == null ? '' : formatClockTime(clockMinutes);

    if (index === 0) {
      checkpoint.departureTime = checkpoint.arrivalTime;
      scheduled.push(checkpoint);
      continue;
    }

    if (clockMinutes != null && Number.isFinite(checkpoint.legTravelMinutes)) {
      clockMinutes += checkpoint.legTravelMinutes as number;
      checkpoint.arrivalTime = formatClockTime(clockMinutes);
    }

    if (checkpoint.kind === 'end') {
      checkpoint.departureTime = '';
    } else if (clockMinutes != null) {
      clockMinutes += checkpoint.stopMinutes;
      checkpoint.departureTime = formatClockTime(clockMinutes);
    } else {
      checkpoint.departureTime = '';
    }

    scheduled.push(checkpoint);
  }

  return scheduled;
}

// The single entry point: takes raw routes/checkpoints/settings and produces the
// ordered, route-matched, time-scheduled list that MapView, CheckpointSchedule, and
// the CSV/GeoJSON exporters all render from.
export function getScheduledCheckpoints(routes: RouteRecord[], checkpoints: CheckpointRecord[], settings: Settings): ScheduledCheckpoint[] {
  const preparedRoutes = prepareRoutes(routes);
  const orderedCheckpoints = getOrderedCheckpoints(checkpoints, preparedRoutes);
  const activeRoute = getActiveRoute(preparedRoutes);

  const routePoints = orderedCheckpoints
    .filter((checkpoint) => !activeRoute || checkpoint.routeId === activeRoute.id || !Number.isFinite(checkpoint.routeOffsetMeters))
    .sort((a, b) => {
      const aOffset = Number.isFinite(a.routeOffsetMeters) ? a.routeOffsetMeters! : Number.MAX_SAFE_INTEGER;
      const bOffset = Number.isFinite(b.routeOffsetMeters) ? b.routeOffsetMeters! : Number.MAX_SAFE_INTEGER;
      return aOffset - bOffset || (a.sequence || 0) - (b.sequence || 0);
    });

  const viaPoints: ScheduledCheckpoint[] = routePoints
    .filter((checkpoint) => getWaypointType(checkpoint) === 'via')
    .map((checkpoint, index) => ({
      ...checkpoint,
      kind: 'via',
      displayName: `Via ${index + 1}`,
      sourceFilename: checkpoint.filename,
      stopMinutes: 0,
      legTravelMinutes: null,
      arrivalTime: '',
      departureTime: '',
      viaPoints: [],
    }));

  const userCheckpoints: ScheduledCheckpoint[] = routePoints
    .filter((checkpoint) => getWaypointType(checkpoint) === 'checkpoint')
    .map((checkpoint, index) => ({
      ...checkpoint,
      kind: 'user',
      displayName: `Checkpoint ${index + 1}`,
      sourceFilename: checkpoint.filename,
      stopMinutes: 0,
      legTravelMinutes: null,
      arrivalTime: '',
      departureTime: '',
      viaPoints: [],
    }));

  const scheduled: ScheduledCheckpoint[] = [];
  if (activeRoute) {
    const start = makeRouteEndpoint(activeRoute, 'start');
    if (start) {
      scheduled.push(start);
    }
  }

  scheduled.push(...userCheckpoints);

  if (activeRoute) {
    const end = makeRouteEndpoint(activeRoute, 'end');
    if (end) {
      scheduled.push(end);
    }
  }

  for (let index = 0; index < scheduled.length; index += 1) {
    const checkpoint = scheduled[index];
    const previous = scheduled[index - 1];
    checkpoint.segmentFromPreviousMeters =
      index === 0 || !Number.isFinite(checkpoint.routeOffsetMeters) || !previous || !Number.isFinite(previous.routeOffsetMeters)
        ? null
        : Math.max(0, checkpoint.routeOffsetMeters! - previous.routeOffsetMeters!);
  }

  for (const viaPoint of viaPoints) {
    const target =
      scheduled.find(
        (checkpoint) =>
          checkpoint.kind !== 'start' &&
          Number.isFinite(checkpoint.routeOffsetMeters) &&
          Number.isFinite(viaPoint.routeOffsetMeters) &&
          checkpoint.routeOffsetMeters! >= viaPoint.routeOffsetMeters!,
      ) || scheduled[scheduled.length - 1];
    if (target) {
      target.viaPoints.push(viaPoint);
    }
  }

  return applySchedule(scheduled, settings);
}

// Every checkpoint that needs a map marker: top-level entries (start/user/end) plus
// each entry's nested via points — used by MapView, which otherwise has no reason to
// walk the via nesting itself.
export function flattenScheduledCheckpoints(scheduled: ScheduledCheckpoint[]): ScheduledCheckpoint[] {
  return scheduled.flatMap((checkpoint) => [checkpoint, ...checkpoint.viaPoints]);
}
