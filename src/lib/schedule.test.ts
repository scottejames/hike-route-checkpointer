import { describe, expect, it } from 'vitest';
import { getScheduledCheckpoints } from './schedule';
import type { CheckpointRecord, RouteRecord, Settings } from './types';

const STRAIGHT_ROUTE: RouteRecord = {
  id: 'r1',
  filename: 'r.gpx',
  displayName: 'Test Route',
  visible: true,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          // ~1.11km north-south line at the equator-ish latitude used here.
          coordinates: [
            [0, 50.0],
            [0, 50.01],
          ],
        },
      },
    ],
  },
};

function makeCheckpoint(overrides: Partial<CheckpointRecord>): CheckpointRecord {
  return {
    id: 'c1',
    sequence: 1,
    filename: 'photo1.jpg',
    latitude: 50.005,
    longitude: 0.0001,
    gridRef: '',
    timestamp: '',
    waypointType: 'checkpoint',
    status: 'ok',
    ...overrides,
  };
}

const SETTINGS: Settings = { distanceUnit: 'miles', targetSpeedMph: 3, checkpointStopMinutes: 5, startTime: '08:00' };

describe('getScheduledCheckpoints', () => {
  it('orders a route\'s virtual Start, the checkpoint, and virtual End by distance along the route', () => {
    const scheduled = getScheduledCheckpoints([STRAIGHT_ROUTE], [makeCheckpoint({})], SETTINGS);

    expect(scheduled.map((checkpoint) => checkpoint.kind)).toEqual(['start', 'user', 'end']);
    expect(scheduled[0].routeOffsetMeters).toBe(0);
    expect(scheduled[2].routeOffsetMeters).toBeCloseTo(1111.95, 1);
    // The checkpoint sits roughly halfway along the ~1.11km line.
    expect(scheduled[1].routeOffsetMeters).toBeCloseTo(555.97, 1);
    expect(scheduled[1].segmentFromPreviousMeters).toBeCloseTo(555.97, 1);
    expect(scheduled[2].segmentFromPreviousMeters).toBeCloseTo(555.97, 1);
  });

  it('applies the schedule from startTime using targetSpeedMph and checkpointStopMinutes', () => {
    const scheduled = getScheduledCheckpoints([STRAIGHT_ROUTE], [makeCheckpoint({})], SETTINGS);

    expect(scheduled[0].arrivalTime).toBe('08:00');
    expect(scheduled[0].departureTime).toBe('08:00');
    // ~556m at 3mph takes ~7 minutes.
    expect(scheduled[1].arrivalTime).toBe('08:07');
    // 5 minute checkpoint stop.
    expect(scheduled[1].departureTime).toBe('08:12');
    expect(scheduled[2].arrivalTime).toBe('08:19');
    // The route's End never has a departure time.
    expect(scheduled[2].departureTime).toBe('');
  });

  it('nests a via-type waypoint under the next checkpoint rather than listing it top-level', () => {
    const scheduled = getScheduledCheckpoints(
      [STRAIGHT_ROUTE],
      [makeCheckpoint({ id: 'via1', waypointType: 'via', latitude: 50.002, sequence: 1 }), makeCheckpoint({ id: 'c1', sequence: 2 })],
      SETTINGS,
    );

    const kinds = scheduled.map((checkpoint) => checkpoint.kind);
    expect(kinds).toEqual(['start', 'user', 'end']);
    expect(scheduled[1].viaPoints).toHaveLength(1);
    expect(scheduled[1].viaPoints[0].id).toBe('via1');
  });

  it('leaves checkpoints unscheduled (no arrival/departure) when startTime is empty', () => {
    const scheduled = getScheduledCheckpoints([STRAIGHT_ROUTE], [makeCheckpoint({})], { ...SETTINGS, startTime: '' });

    expect(scheduled.every((checkpoint) => checkpoint.arrivalTime === '')).toBe(true);
  });
});
