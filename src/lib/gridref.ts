// British National Grid conversion (WGS84 -> OSGB36 Helmert transform, Airy 1830
// ellipsoid). Suitable for six-figure, 100m references — not a survey-grade OSTN15
// transformation.

const gridLetters = [
  ['SV', 'SW', 'SX', 'SY', 'SZ', 'TV', 'TW'],
  ['SQ', 'SR', 'SS', 'ST', 'SU', 'TQ', 'TR'],
  ['SL', 'SM', 'SN', 'SO', 'SP', 'TL', 'TM'],
  ['SF', 'SG', 'SH', 'SJ', 'SK', 'TF', 'TG'],
  ['SA', 'SB', 'SC', 'SD', 'SE', 'TA', 'TB'],
  ['NV', 'NW', 'NX', 'NY', 'NZ', 'OV', 'OW'],
  ['NQ', 'NR', 'NS', 'NT', 'NU', 'OQ', 'OR'],
  ['NL', 'NM', 'NN', 'NO', 'NP', 'OL', 'OM'],
  ['NF', 'NG', 'NH', 'NJ', 'NK', 'OF', 'OG'],
  ['NA', 'NB', 'NC', 'ND', 'NE', 'OA', 'OB'],
  ['HV', 'HW', 'HX', 'HY', 'HZ', 'JV', 'JW'],
  ['HQ', 'HR', 'HS', 'HT', 'HU', 'JQ', 'JR'],
  ['HL', 'HM', 'HN', 'HO', 'HP', 'JL', 'JM'],
];

interface Ellipsoid {
  a: number;
  b: number;
}

const airy1830: Ellipsoid = {
  a: 6377563.396,
  b: 6356256.909,
};

const wgs84: Ellipsoid = {
  a: 6378137.0,
  b: 6356752.314245,
};

interface HelmertTransform {
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function arcSecondsToRad(seconds: number): number {
  return degToRad(seconds / 3600);
}

function eccentricitySquared(ellipsoid: Ellipsoid): number {
  return 1 - (ellipsoid.b * ellipsoid.b) / (ellipsoid.a * ellipsoid.a);
}

const helmertWgs84ToOsgb36: HelmertTransform = {
  tx: -446.448,
  ty: 125.157,
  tz: -542.06,
  rx: arcSecondsToRad(-0.1502),
  ry: arcSecondsToRad(-0.247),
  rz: arcSecondsToRad(-0.8421),
  scale: 20.4894 * 1e-6,
};

const f0 = 0.9996012717;
const lat0 = degToRad(49);
const lon0 = degToRad(-2);
const n0 = -100000;
const e0 = 400000;
const airyE2 = eccentricitySquared(airy1830);
const airyN = (airy1830.a - airy1830.b) / (airy1830.a + airy1830.b);

interface Cartesian {
  x: number;
  y: number;
  z: number;
}

function latLonToCartesian(latitude: number, longitude: number, ellipsoid: Ellipsoid): Cartesian {
  const phi = degToRad(latitude);
  const lambda = degToRad(longitude);
  const e2 = eccentricitySquared(ellipsoid);
  const sinPhi = Math.sin(phi);
  const nu = ellipsoid.a / Math.sqrt(1 - e2 * sinPhi ** 2);

  return {
    x: nu * Math.cos(phi) * Math.cos(lambda),
    y: nu * Math.cos(phi) * Math.sin(lambda),
    z: nu * (1 - e2) * sinPhi,
  };
}

function applyHelmertTransform({ x, y, z }: Cartesian, transform: HelmertTransform): Cartesian {
  const scale = 1 + transform.scale;
  return {
    x: transform.tx + scale * x - transform.rz * y + transform.ry * z,
    y: transform.ty + transform.rz * x + scale * y - transform.rx * z,
    z: transform.tz - transform.ry * x + transform.rx * y + scale * z,
  };
}

function cartesianToLatLon({ x, y, z }: Cartesian, ellipsoid: Ellipsoid): { latitude: number; longitude: number } {
  const e2 = eccentricitySquared(ellipsoid);
  const p = Math.sqrt(x ** 2 + y ** 2);
  let phi = Math.atan2(z, p * (1 - e2));
  let previousPhi: number;

  do {
    previousPhi = phi;
    const nu = ellipsoid.a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    phi = Math.atan2(z + e2 * nu * Math.sin(phi), p);
  } while (Math.abs(phi - previousPhi) > 1e-12);

  return {
    latitude: phi,
    longitude: Math.atan2(y, x),
  };
}

function wgs84ToOsgb36(latitude: number, longitude: number): { latitude: number; longitude: number } {
  const wgsCartesian = latLonToCartesian(latitude, longitude, wgs84);
  const osgbCartesian = applyHelmertTransform(wgsCartesian, helmertWgs84ToOsgb36);
  return cartesianToLatLon(osgbCartesian, airy1830);
}

function meridionalArc(phi: number): number {
  const dPhi = phi - lat0;
  const sPhi = phi + lat0;
  return (
    airy1830.b *
    f0 *
    ((1 + airyN + (5 / 4) * airyN ** 2 + (5 / 4) * airyN ** 3) * dPhi -
      (3 * airyN + 3 * airyN ** 2 + (21 / 8) * airyN ** 3) * Math.sin(dPhi) * Math.cos(sPhi) +
      ((15 / 8) * airyN ** 2 + (15 / 8) * airyN ** 3) * Math.sin(2 * dPhi) * Math.cos(2 * sPhi) -
      (35 / 24) * airyN ** 3 * Math.sin(3 * dPhi) * Math.cos(3 * sPhi))
  );
}

export function latLonToBritishNationalGrid(latitude: number, longitude: number): { easting: number; northing: number } {
  const osgb36 = wgs84ToOsgb36(latitude, longitude);
  const phi = osgb36.latitude;
  const lambda = osgb36.longitude;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const nu = (airy1830.a * f0) / Math.sqrt(1 - airyE2 * sinPhi ** 2);
  const rho = (airy1830.a * f0 * (1 - airyE2)) / (1 - airyE2 * sinPhi ** 2) ** 1.5;
  const eta2 = nu / rho - 1;
  const m = meridionalArc(phi);
  const dLambda = lambda - lon0;

  const i = m + n0;
  const ii = (nu / 2) * sinPhi * cosPhi;
  const iii = (nu / 24) * sinPhi * cosPhi ** 3 * (5 - tanPhi ** 2 + 9 * eta2);
  const iiia = (nu / 720) * sinPhi * cosPhi ** 5 * (61 - 58 * tanPhi ** 2 + tanPhi ** 4);
  const iv = nu * cosPhi;
  const v = (nu / 6) * cosPhi ** 3 * (nu / rho - tanPhi ** 2);
  const vi = (nu / 120) * cosPhi ** 5 * (5 - 18 * tanPhi ** 2 + tanPhi ** 4 + 14 * eta2 - 58 * tanPhi ** 2 * eta2);

  const northing = i + ii * dLambda ** 2 + iii * dLambda ** 4 + iiia * dLambda ** 6;
  const easting = e0 + iv * dLambda + v * dLambda ** 3 + vi * dLambda ** 5;
  return { easting, northing };
}

export function formatSixFigureGridRef(latitude: number, longitude: number): string {
  const { easting, northing } = latLonToBritishNationalGrid(latitude, longitude);
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    throw new Error('Coordinates cannot be converted to a grid reference.');
  }

  const e100km = Math.floor(easting / 100000);
  const n100km = Math.floor(northing / 100000);
  const letters = gridLetters[n100km]?.[e100km];

  if (!letters) {
    throw new Error('Coordinates are outside the British National Grid.');
  }

  const localEasting = Math.floor((easting % 100000) / 100);
  const localNorthing = Math.floor((northing % 100000) / 100);
  return `${letters} ${String(localEasting).padStart(3, '0')} ${String(localNorthing).padStart(3, '0')}`;
}
