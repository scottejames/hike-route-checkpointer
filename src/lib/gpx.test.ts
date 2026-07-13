import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGpxFile } from './gpx';

const fixturePath = join(import.meta.dirname, '..', '..', 'test-fixtures', 'sample-route.gpx');
const fixtureText = readFileSync(fixturePath, 'utf8');

function makeGpxFile(text: string, filename = 'sample-route.gpx'): File {
  return new File([text], filename, { type: 'application/gpx+xml' });
}

describe('parseGpxFile', () => {
  it('parses a track into a named, visible route with GeoJSON geometry', async () => {
    const route = await parseGpxFile(makeGpxFile(fixtureText));

    expect(route.displayName).toBe('Sussex Sample Route');
    expect(route.filename).toBe('sample-route.gpx');
    expect(route.visible).toBe(true);
    expect(route.geojson.features.length).toBeGreaterThan(0);
    expect(route.geojson.features[0].geometry?.type).toBe('LineString');
  });

  it('falls back to the filename when the GPX has no name', async () => {
    const withoutName = fixtureText.replace(/<name>.*?<\/name>/gs, '');
    const route = await parseGpxFile(makeGpxFile(withoutName, 'unnamed.gpx'));

    expect(route.displayName).toBe('unnamed.gpx');
  });

  it('rejects a file with no route, track, or waypoint data', async () => {
    const empty = '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>';
    await expect(parseGpxFile(makeGpxFile(empty, 'empty.gpx'))).rejects.toThrow('did not contain route, track, or waypoint data');
  });

  it('rejects a file that is not valid XML', async () => {
    await expect(parseGpxFile(makeGpxFile('not xml at all <<<', 'broken.gpx'))).rejects.toThrow('is not valid XML');
  });
});
