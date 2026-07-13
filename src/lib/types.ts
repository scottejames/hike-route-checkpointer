import type { FeatureCollection } from 'geojson';

export type DistanceUnit = 'miles' | 'km';

export interface Settings {
  distanceUnit: DistanceUnit;
  targetSpeedMph: number;
  checkpointStopMinutes: number;
  startTime: string;
}

export const DEFAULT_SETTINGS: Settings = {
  distanceUnit: 'miles',
  targetSpeedMph: 3,
  checkpointStopMinutes: 5,
  startTime: '',
};

export interface RouteRecord {
  id: string;
  filename: string;
  displayName: string;
  geojson: FeatureCollection;
  visible: boolean;
}

export type WaypointType = 'checkpoint' | 'via';

export interface CheckpointRecord {
  id: string;
  sequence: number;
  filename: string;
  latitude: number;
  longitude: number;
  gridRef: string;
  timestamp: string;
  thumbnailUrl?: string;
  waypointType: WaypointType;
  status: string;
}

export type ScheduledKind = 'start' | 'end' | 'user' | 'via';

// The flattened shape every checkpoint (real or a route's virtual Start/End) takes on
// once `getScheduledCheckpoints` has ordered, route-matched, and time-scheduled it —
// this is what MapView, CheckpointSchedule, and the CSV/GeoJSON exporters all render.
export interface ScheduledCheckpoint {
  id: string;
  kind: ScheduledKind;
  virtual?: boolean;
  displayName: string;
  filename: string;
  sourceFilename?: string;
  latitude: number;
  longitude: number;
  gridRef: string;
  timestamp: string;
  thumbnailUrl?: string;
  status: string;
  routeId?: string;
  routeName?: string;
  routeOffsetMeters?: number;
  routeTotalMeters?: number;
  offRouteMeters?: number;
  orderIndex: number;
  segmentFromPreviousMeters: number | null;
  stopMinutes: number;
  legTravelMinutes: number | null;
  arrivalTime: string;
  departureTime: string;
  viaPoints: ScheduledCheckpoint[];
}
