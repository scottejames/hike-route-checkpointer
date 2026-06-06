import { formatSixFigureGridRef } from "./gridref.js";
import { extractExifTiffFromHeicFile, isHeicFile, readExifTiffMetadata } from "./heic-exif.js";

function getDateTaken(metadata) {
  const date = metadata?.DateTimeOriginal || metadata?.CreateDate || metadata?.ModifyDate;
  if (!date) {
    return "";
  }
  if (date instanceof Date && !Number.isNaN(date.valueOf())) {
    return date.toISOString();
  }
  return String(date);
}

function createThumbnailUrl(file) {
  if (!file.type.startsWith("image/")) {
    return "";
  }

  try {
    return URL.createObjectURL(file);
  } catch {
    return "";
  }
}

async function readExifMetadata(file) {
  let primaryError;
  let primaryResult;
  try {
    primaryResult = await readExifMetadataFromInput(file);
  } catch (error) {
    primaryError = error;
    if (!isHeicFile(file)) {
      throw error;
    }
  }

  if (!isHeicFile(file)) {
    return primaryResult;
  }

  if (Number.isFinite(primaryResult?.gps?.latitude) && Number.isFinite(primaryResult?.gps?.longitude)) {
    return primaryResult;
  }

  try {
    const tiffBuffer = await extractExifTiffFromHeicFile(file);
    const parsed = readExifTiffMetadata(tiffBuffer);
    if (Number.isFinite(parsed.gps.latitude) && Number.isFinite(parsed.gps.longitude)) {
      return parsed;
    }

    return await readExifMetadataFromInput(tiffBuffer);
  } catch (fallbackError) {
    throw new Error(fallbackError.message || primaryError?.message || "could not read HEIC EXIF metadata.");
  }
}

async function readExifMetadataFromInput(input) {
  const [gps, metadata] = await Promise.all([
    window.exifr.gps(input),
    window.exifr.parse(input, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] }).catch(() => ({}))
  ]);
  return { gps, metadata };
}

export async function extractCheckpoint(file) {
  if (!window.exifr?.gps) {
    throw new Error("EXIF parser library is not available.");
  }

  let gps;
  let metadata = {};
  try {
    ({ gps, metadata } = await readExifMetadata(file));
  } catch (error) {
    throw new Error(`${file.name}: ${error.message || "could not read EXIF metadata."}`);
  }

  const latitude = gps?.latitude;
  const longitude = gps?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      type: "warning",
      filename: file.name,
      message: `${file.name}: no GPS EXIF coordinates found.`
    };
  }

  let gridRef = "";
  try {
    gridRef = formatSixFigureGridRef(latitude, longitude);
  } catch (error) {
    return {
      type: "warning",
      filename: file.name,
      message: `${file.name}: ${error.message}`
    };
  }

  return {
    type: "checkpoint",
    checkpoint: {
      id: crypto.randomUUID(),
      filename: file.name,
      latitude,
      longitude,
      gridRef,
      timestamp: getDateTaken(metadata),
      thumbnailUrl: createThumbnailUrl(file),
      status: "ok"
    }
  };
}

export function revokeCheckpointThumbnail(checkpoint) {
  if (checkpoint.thumbnailUrl) {
    URL.revokeObjectURL(checkpoint.thumbnailUrl);
  }
}
