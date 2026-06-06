function readAscii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint(view, offset, size) {
  if (size === 0) {
    return 0;
  }
  if (size === 1) {
    return view.getUint8(offset);
  }
  if (size === 2) {
    return view.getUint16(offset, false);
  }
  if (size === 4) {
    return view.getUint32(offset, false);
  }
  if (size === 8) {
    const value = view.getBigUint64(offset, false);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("HEIC metadata offset is too large to read safely.");
    }
    return Number(value);
  }
  throw new Error("Unsupported HEIC metadata offset size.");
}

function readBox(bytes, view, offset, end) {
  if (offset + 8 > end) {
    return null;
  }

  let size = view.getUint32(offset, false);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > end) {
      return null;
    }
    size = readUint(view, offset + 8, 8);
    headerSize = 16;
  } else if (size === 0) {
    size = end - offset;
  }

  if (size < headerSize || offset + size > end) {
    return null;
  }

  return {
    offset,
    size,
    type: readAscii(bytes, offset + 4, 4),
    contentOffset: offset + headerSize,
    endOffset: offset + size
  };
}

function readChildBoxes(bytes, view, start, end, skipBytes = 0) {
  const boxes = [];
  let offset = start + skipBytes;
  while (offset + 8 <= end) {
    const box = readBox(bytes, view, offset, end);
    if (!box) {
      break;
    }
    boxes.push(box);
    offset = box.endOffset;
  }
  return boxes;
}

function parseItemInfo(bytes, view, box) {
  const version = view.getUint8(box.contentOffset);
  let offset = box.contentOffset + 4;
  const itemCount = version === 0 ? view.getUint16(offset, false) : view.getUint32(offset, false);
  offset += version === 0 ? 2 : 4;

  const entries = [];
  for (let index = 0; index < itemCount && offset + 8 <= box.endOffset; index += 1) {
    const entry = readBox(bytes, view, offset, box.endOffset);
    if (!entry || entry.type !== "infe") {
      break;
    }

    const entryVersion = view.getUint8(entry.contentOffset);
    let cursor = entry.contentOffset + 4;
    const itemId = entryVersion >= 3 ? view.getUint32(cursor, false) : view.getUint16(cursor, false);
    cursor += entryVersion >= 3 ? 4 : 2;
    cursor += 2; // item_protection_index
    const itemType = entryVersion >= 2 ? readAscii(bytes, cursor, 4) : "";

    entries.push({ itemId, itemType });
    offset = entry.endOffset;
  }

  return entries;
}

function parseItemLocations(bytes, view, box) {
  const version = view.getUint8(box.contentOffset);
  let offset = box.contentOffset + 4;
  const firstSizes = view.getUint8(offset);
  const secondSizes = view.getUint8(offset + 1);
  offset += 2;

  const offsetSize = firstSizes >> 4;
  const lengthSize = firstSizes & 0x0f;
  const baseOffsetSize = secondSizes >> 4;
  const indexSize = version === 1 || version === 2 ? secondSizes & 0x0f : 0;
  const itemCount = version < 2 ? view.getUint16(offset, false) : view.getUint32(offset, false);
  offset += version < 2 ? 2 : 4;

  const locations = [];
  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const itemId = version < 2 ? view.getUint16(offset, false) : view.getUint32(offset, false);
    offset += version < 2 ? 2 : 4;

    let constructionMethod = 0;
    if (version === 1 || version === 2) {
      constructionMethod = view.getUint16(offset, false) & 0x0f;
      offset += 2;
    }

    offset += 2; // data_reference_index
    const baseOffset = readUint(view, offset, baseOffsetSize);
    offset += baseOffsetSize;

    const extentCount = view.getUint16(offset, false);
    offset += 2;
    const extents = [];
    for (let extentIndex = 0; extentIndex < extentCount; extentIndex += 1) {
      if ((version === 1 || version === 2) && indexSize > 0) {
        offset += indexSize;
      }
      const extentOffset = readUint(view, offset, offsetSize);
      offset += offsetSize;
      const extentLength = readUint(view, offset, lengthSize);
      offset += lengthSize;
      extents.push({
        offset: baseOffset + extentOffset,
        length: extentLength
      });
    }

    locations.push({ itemId, constructionMethod, extents });
  }

  return locations;
}

function combineExtents(bytes, extents) {
  const totalLength = extents.reduce((sum, extent) => sum + extent.length, 0);
  const combined = new Uint8Array(totalLength);
  let cursor = 0;
  for (const extent of extents) {
    combined.set(bytes.subarray(extent.offset, extent.offset + extent.length), cursor);
    cursor += extent.length;
  }
  return combined;
}

function findTiffStart(payload) {
  if (readAscii(payload, 4, 4) === "Exif") {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const tiffOffset = 4 + view.getUint32(0, false);
    if (readAscii(payload, tiffOffset, 4) === "MM\u0000*" || readAscii(payload, tiffOffset, 4) === "II*\u0000") {
      return tiffOffset;
    }
  }

  for (let offset = 0; offset <= Math.min(payload.length - 4, 32); offset += 1) {
    const signature = readAscii(payload, offset, 4);
    if (signature === "MM\u0000*" || signature === "II*\u0000") {
      return offset;
    }
  }

  throw new Error("HEIC Exif item did not contain a TIFF payload.");
}

export function isHeicFile(file) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif") || type === "image/heic" || type === "image/heif";
}

export function extractExifTiffFromHeicBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const topLevelBoxes = readChildBoxes(bytes, view, 0, bytes.length);
  const metaBox = topLevelBoxes.find((box) => box.type === "meta");
  if (!metaBox) {
    throw new Error("HEIC file did not contain a metadata box.");
  }

  const metaChildren = readChildBoxes(bytes, view, metaBox.contentOffset, metaBox.endOffset, 4);
  const itemInfoBox = metaChildren.find((box) => box.type === "iinf");
  const itemLocationBox = metaChildren.find((box) => box.type === "iloc");
  if (!itemInfoBox || !itemLocationBox) {
    throw new Error("HEIC file did not contain item metadata needed for Exif.");
  }

  const exifItemIds = parseItemInfo(bytes, view, itemInfoBox)
    .filter((entry) => entry.itemType === "Exif")
    .map((entry) => entry.itemId);
  if (exifItemIds.length === 0) {
    throw new Error("HEIC file did not contain an Exif item.");
  }

  const exifLocation = parseItemLocations(bytes, view, itemLocationBox)
    .find((location) => exifItemIds.includes(location.itemId));
  if (!exifLocation || exifLocation.extents.length === 0) {
    throw new Error("HEIC Exif item location could not be found.");
  }
  if (exifLocation.constructionMethod !== 0) {
    throw new Error("HEIC Exif item uses an unsupported construction method.");
  }

  const payload = combineExtents(bytes, exifLocation.extents);
  const tiffStart = findTiffStart(payload);
  return payload.buffer.slice(payload.byteOffset + tiffStart, payload.byteOffset + payload.byteLength);
}

export async function extractExifTiffFromHeicFile(file) {
  return extractExifTiffFromHeicBuffer(await file.arrayBuffer());
}

const typeSizes = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8
};

function createTiffReader(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const byteOrder = readAscii(bytes, 0, 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") {
    throw new Error("Exif TIFF payload has an unknown byte order.");
  }
  if (view.getUint16(2, littleEndian) !== 42) {
    throw new Error("Exif TIFF payload has an invalid header.");
  }

  function uint16(offset) {
    return view.getUint16(offset, littleEndian);
  }

  function uint32(offset) {
    return view.getUint32(offset, littleEndian);
  }

  function getEntry(ifdOffset, tagId) {
    if (!ifdOffset || ifdOffset + 2 > bytes.length) {
      return null;
    }
    const count = uint16(ifdOffset);
    for (let index = 0; index < count; index += 1) {
      const offset = ifdOffset + 2 + index * 12;
      if (offset + 12 > bytes.length) {
        return null;
      }
      if (uint16(offset) === tagId) {
        const type = uint16(offset + 2);
        const valueCount = uint32(offset + 4);
        const byteLength = (typeSizes[type] || 1) * valueCount;
        const valueOffset = byteLength <= 4 ? offset + 8 : uint32(offset + 8);
        return { type, count: valueCount, byteLength, valueOffset };
      }
    }
    return null;
  }

  function ascii(ifdOffset, tagId) {
    const entry = getEntry(ifdOffset, tagId);
    if (!entry) {
      return "";
    }
    const raw = bytes.subarray(entry.valueOffset, Math.min(entry.valueOffset + entry.byteLength, bytes.length));
    const zeroIndex = raw.indexOf(0);
    return readAscii(raw, 0, zeroIndex >= 0 ? zeroIndex : raw.length).trim();
  }

  function long(ifdOffset, tagId) {
    const entry = getEntry(ifdOffset, tagId);
    if (!entry) {
      return 0;
    }
    if (entry.type === 3) {
      return uint16(entry.valueOffset);
    }
    return uint32(entry.valueOffset);
  }

  function rationals(ifdOffset, tagId) {
    const entry = getEntry(ifdOffset, tagId);
    if (!entry) {
      return [];
    }
    const values = [];
    for (let index = 0; index < entry.count; index += 1) {
      const offset = entry.valueOffset + index * 8;
      const numerator = uint32(offset);
      const denominator = uint32(offset + 4);
      values.push(denominator === 0 ? 0 : numerator / denominator);
    }
    return values;
  }

  return {
    firstIfdOffset: uint32(4),
    ascii,
    long,
    rationals
  };
}

function dmsToDecimal(values, ref) {
  if (values.length < 3) {
    return NaN;
  }
  const decimal = values[0] + values[1] / 60 + values[2] / 3600;
  return ref === "S" || ref === "W" ? -decimal : decimal;
}

export function readExifTiffMetadata(buffer) {
  const reader = createTiffReader(buffer);
  const ifd0 = reader.firstIfdOffset;
  const gpsIfd = reader.long(ifd0, 0x8825);
  const exifIfd = reader.long(ifd0, 0x8769);
  const latitude = dmsToDecimal(reader.rationals(gpsIfd, 0x0002), reader.ascii(gpsIfd, 0x0001));
  const longitude = dmsToDecimal(reader.rationals(gpsIfd, 0x0004), reader.ascii(gpsIfd, 0x0003));

  return {
    gps: {
      latitude,
      longitude
    },
    metadata: {
      DateTimeOriginal: reader.ascii(exifIfd, 0x9003),
      CreateDate: reader.ascii(exifIfd, 0x9004),
      ModifyDate: reader.ascii(ifd0, 0x0132)
    }
  };
}
