import { describe, expect, it } from 'vitest';
import { makeCheckpointCsv, makeCheckpointGeojson } from './export';
import type { ScheduledCheckpoint } from './types';

function makeScheduledCheckpoint(overrides: Partial<ScheduledCheckpoint>): ScheduledCheckpoint {
  return {
    id: 'c1',
    kind: 'user',
    displayName: 'Checkpoint 1',
    filename: 'photo1.jpg',
    latitude: 50.8738,
    longitude: -0.0088,
    gridRef: 'TQ 401 101',
    timestamp: '2026-01-01T08:00:00.000Z',
    status: 'ok',
    routeName: 'Test Route',
    routeOffsetMeters: 556,
    segmentFromPreviousMeters: 556,
    orderIndex: 2,
    stopMinutes: 5,
    legTravelMinutes: 7,
    arrivalTime: '08:07',
    departureTime: '08:12',
    viaPoints: [],
    ...overrides,
  };
}

describe('makeCheckpointCsv', () => {
  it('quotes a value containing a comma', () => {
    const csv = makeCheckpointCsv(['name'], [['Sussex, England']]);
    expect(csv).toBe('name\n"Sussex, England"\n');
  });

  it('leaves plain values unquoted', () => {
    const csv = makeCheckpointCsv(['name', 'value'], [['plain', 42]]);
    expect(csv).toBe('name,value\nplain,42\n');
  });
});

describe('makeCheckpointGeojson', () => {
  it('emits one Point feature per checkpoint with [longitude, latitude] coordinate order', () => {
    const geojson = makeCheckpointGeojson([makeScheduledCheckpoint({})], { distanceUnit: 'miles', targetSpeedLabel: '3 mph' });

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry).toEqual({ type: 'Point', coordinates: [-0.0088, 50.8738] });
    expect(geojson.features[0].properties?.os_grid_ref).toBe('TQ 401 101');
    expect(geojson.features[0].properties?.arrival_time).toBe('08:07');
  });

  it('joins nested via-point grid references into one column', () => {
    const withVia = makeScheduledCheckpoint({
      viaPoints: [makeScheduledCheckpoint({ id: 'via1', gridRef: 'TQ 400 100' })],
    });
    const geojson = makeCheckpointGeojson([withVia], { distanceUnit: 'miles', targetSpeedLabel: '3 mph' });

    expect(geojson.features[0].properties?.via_grid_refs).toBe('TQ 400 100');
  });
});
