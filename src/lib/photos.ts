import exifr from 'exifr';
import { formatSixFigureGridRef } from './gridref';
import { extractExifTiffFromHeicFile, isHeicFile, readExifTiffMetadata, type ExifTiffMetadata } from './heicExif';
import type { CheckpointRecord } from './types';

export type CheckpointExtractionResult =
  | { type: 'checkpoint'; checkpoint: CheckpointRecord }
  | { type: 'warning'; filename: string; message: string };

interface ExifGps {
  latitude?: number;
  longitude?: number;
}

interface ExifMetadataFields {
  DateTimeOriginal?: string | Date;
  CreateDate?: string | Date;
  ModifyDate?: string | Date;
}

interface ExifReadResult {
  gps: ExifGps | undefined;
  metadata: ExifMetadataFields;
}

function getDateTaken(metadata: ExifMetadataFields | undefined): string {
  const date = metadata?.DateTimeOriginal || metadata?.CreateDate || metadata?.ModifyDate;
  if (!date) {
    return '';
  }
  if (date instanceof Date && !Number.isNaN(date.valueOf())) {
    return date.toISOString();
  }
  return String(date);
}

function createThumbnailUrl(file: File): string {
  if (!file.type.startsWith('image/')) {
    return '';
  }

  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

async function readExifMetadataFromInput(input: File | ArrayBuffer): Promise<ExifReadResult> {
  const [gps, metadata] = await Promise.all([
    exifr.gps(input),
    exifr.parse(input, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] }).catch(() => ({}) as ExifMetadataFields),
  ]);
  return { gps, metadata };
}

function tiffMetadataToReadResult(parsed: ExifTiffMetadata): ExifReadResult {
  return { gps: parsed.gps, metadata: parsed.metadata };
}

async function readExifMetadata(file: File): Promise<ExifReadResult> {
  let primaryError: Error | undefined;
  let primaryResult: ExifReadResult | undefined;
  try {
    primaryResult = await readExifMetadataFromInput(file);
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
    if (!isHeicFile(file)) {
      throw error;
    }
  }

  if (!isHeicFile(file)) {
    return primaryResult as ExifReadResult;
  }

  if (Number.isFinite(primaryResult?.gps?.latitude) && Number.isFinite(primaryResult?.gps?.longitude)) {
    return primaryResult as ExifReadResult;
  }

  try {
    const tiffBuffer = await extractExifTiffFromHeicFile(file);
    const parsed = readExifTiffMetadata(tiffBuffer);
    if (Number.isFinite(parsed.gps.latitude) && Number.isFinite(parsed.gps.longitude)) {
      return tiffMetadataToReadResult(parsed);
    }

    return await readExifMetadataFromInput(tiffBuffer);
  } catch (fallbackError) {
    const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    throw new Error(message || primaryError?.message || 'could not read HEIC EXIF metadata.');
  }
}

export async function extractCheckpoint(file: File): Promise<CheckpointExtractionResult> {
  let gps: ExifGps | undefined;
  let metadata: ExifMetadataFields = {};
  try {
    ({ gps, metadata } = await readExifMetadata(file));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${file.name}: ${message || 'could not read EXIF metadata.'}`);
  }

  if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
    return {
      type: 'warning',
      filename: file.name,
      message: `${file.name}: no GPS EXIF coordinates found.`,
    };
  }
  const latitude: number = gps.latitude!;
  const longitude: number = gps.longitude!;

  let gridRef = '';
  try {
    gridRef = formatSixFigureGridRef(latitude, longitude);
  } catch (error) {
    return {
      type: 'warning',
      filename: file.name,
      message: `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    type: 'checkpoint',
    checkpoint: {
      id: crypto.randomUUID(),
      sequence: 0,
      filename: file.name,
      latitude,
      longitude,
      gridRef,
      timestamp: getDateTaken(metadata),
      thumbnailUrl: createThumbnailUrl(file),
      waypointType: 'checkpoint',
      status: 'ok',
    },
  };
}

export function revokeCheckpointThumbnail(checkpoint: Pick<CheckpointRecord, 'thumbnailUrl'>): void {
  if (checkpoint.thumbnailUrl) {
    URL.revokeObjectURL(checkpoint.thumbnailUrl);
  }
}
