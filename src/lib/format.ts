import { getTravelMinutes } from './schedule';
import type { ScheduledCheckpoint, Settings } from './types';

const metersPerMile = 1609.344;
const kilometersPerMile = 1.609344;

export function getSpeedUnitLabel(settings: Pick<Settings, 'distanceUnit'>): string {
  return settings.distanceUnit === 'km' ? 'km/h' : 'mph';
}

export function getTargetSpeedForDisplay(settings: Settings): number {
  return settings.distanceUnit === 'km' ? settings.targetSpeedMph * kilometersPerMile : settings.targetSpeedMph;
}

export function displaySpeedToMph(speed: number, settings: Pick<Settings, 'distanceUnit'>): number {
  return settings.distanceUnit === 'km' ? speed / kilometersPerMile : speed;
}

export function formatSpeedValue(value: number): string {
  return value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '');
}

export function formatTargetSpeed(settings: Settings): string {
  return `${formatSpeedValue(getTargetSpeedForDisplay(settings))} ${getSpeedUnitLabel(settings)}`;
}

export function formatSettingsSummary(settings: Settings): string {
  return `${formatTargetSpeed(settings)} - ${settings.checkpointStopMinutes} min stops`;
}

export function formatDistance(meters: number | null | undefined, settings: Pick<Settings, 'distanceUnit'>): string {
  if (!Number.isFinite(meters)) {
    return '';
  }
  const value = meters as number;

  if (settings.distanceUnit === 'km') {
    if (value < 1000) {
      return `${Math.round(value)} m`;
    }
    const kilometers = value / 1000;
    return `${kilometers.toFixed(kilometers < 10 ? 1 : 0)} km`;
  }

  const miles = value / metersPerMile;
  if (miles < 0.05) {
    return `${Math.round(value)} m`;
  }
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (!Number.isFinite(minutes)) {
    return '';
  }
  const value = minutes as number;
  if (value < 1) {
    return '<1 min';
  }
  if (value < 90) {
    return `${value} min`;
  }
  const hours = Math.floor(value / 60);
  const remainingMinutes = value % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

export function formatWalkingTime(meters: number | null | undefined, settings: Settings): string {
  return formatDurationMinutes(getTravelMinutes(meters, settings));
}

export interface CheckpointRouteMeta {
  alongRoute: string;
  segment: string;
}

export function getCheckpointRouteMeta(
  checkpoint: Pick<ScheduledCheckpoint, 'routeOffsetMeters' | 'offRouteMeters' | 'segmentFromPreviousMeters'>,
  settings: Settings,
): CheckpointRouteMeta {
  if (!Number.isFinite(checkpoint.routeOffsetMeters)) {
    return {
      alongRoute: 'No route match',
      segment: '',
    };
  }

  const offRouteText =
    checkpoint.offRouteMeters && checkpoint.offRouteMeters > 15 ? ` - ${formatDistance(checkpoint.offRouteMeters, settings)} from route` : '';
  return {
    alongRoute: `${formatDistance(checkpoint.routeOffsetMeters, settings)} along route${offRouteText}`,
    segment: Number.isFinite(checkpoint.segmentFromPreviousMeters)
      ? `From previous: ${formatDistance(checkpoint.segmentFromPreviousMeters, settings)} - ${formatWalkingTime(checkpoint.segmentFromPreviousMeters, settings)} at ${formatTargetSpeed(settings)}`
      : 'First checkpoint on this route',
  };
}
