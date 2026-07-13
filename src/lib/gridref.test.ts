import { describe, expect, it } from 'vitest';
import { formatSixFigureGridRef, latLonToBritishNationalGrid } from './gridref';

describe('formatSixFigureGridRef', () => {
  it('formats a Sussex coordinate as a six-figure grid reference', () => {
    // Regression fixture: matches the original js/gridref.js implementation's output
    // for this input exactly (this conversion is a simplified Helmert transform, not
    // an OSTN15 grid-shift correction, so it isn't expected to match a survey-grade
    // published value — see README's "not intended as a survey-grade transformation").
    expect(formatSixFigureGridRef(50.8738, -0.0088)).toBe('TQ 401 101');
  });

  it('produces a well-formed six-figure reference for a point elsewhere in Great Britain', () => {
    expect(formatSixFigureGridRef(52.65757, 1.717922)).toMatch(/^[A-Z]{2} \d{3} \d{3}$/);
  });

  it('throws for coordinates outside the British National Grid', () => {
    expect(() => formatSixFigureGridRef(40.7128, -74.006)).toThrow('outside the British National Grid');
  });
});

describe('latLonToBritishNationalGrid', () => {
  it('increases northing for a point further north on the same meridian', () => {
    const south = latLonToBritishNationalGrid(50.8, -0.3);
    const north = latLonToBritishNationalGrid(51.0, -0.3);
    expect(north.northing).toBeGreaterThan(south.northing);
  });

  it('increases easting for a point further east on the same parallel', () => {
    const west = latLonToBritishNationalGrid(50.9, -0.5);
    const east = latLonToBritishNationalGrid(50.9, -0.2);
    expect(east.easting).toBeGreaterThan(west.easting);
  });
});
