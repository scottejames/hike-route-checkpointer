import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { client } from '../lib/dataClient';
import { readStoredValue } from '../lib/localStorage';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';
import type { Schema } from '../../amplify/data/resource';

const STORAGE_KEY = 'hike-route-checkpointer:settings';

function readStoredSettings(): Settings {
  const saved = readStoredValue<Partial<Settings>>(STORAGE_KEY);
  if (!saved) {
    return { ...DEFAULT_SETTINGS };
  }

  const distanceUnit = saved.distanceUnit === 'km' ? 'km' : 'miles';
  const targetSpeedMph = Number(saved.targetSpeedMph);
  const checkpointStopMinutes = Number(saved.checkpointStopMinutes);
  const startTime = typeof saved.startTime === 'string' && /^\d{2}:\d{2}$/.test(saved.startTime) ? saved.startTime : DEFAULT_SETTINGS.startTime;

  return {
    distanceUnit,
    targetSpeedMph: Number.isFinite(targetSpeedMph) && targetSpeedMph > 0 ? targetSpeedMph : DEFAULT_SETTINGS.targetSpeedMph,
    checkpointStopMinutes:
      Number.isFinite(checkpointStopMinutes) && checkpointStopMinutes >= 0 ? checkpointStopMinutes : DEFAULT_SETTINGS.checkpointStopMinutes,
    startTime,
  };
}

function persistLocally(settings: Settings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

type BackendUserSettings = Schema['UserSettings']['type'];

function fromBackendItem(item: BackendUserSettings): Settings {
  return {
    distanceUnit: item.distanceUnit === 'km' ? 'km' : 'miles',
    targetSpeedMph: item.targetSpeedMph,
    checkpointStopMinutes: item.checkpointStopMinutes,
    startTime: item.startTime ?? '',
  };
}

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// One row per signed-in user, keyed by their Cognito username — a singleton
// preferences record, same pattern as beths-gang's EnergyContext/UserPreferences.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, user } = useAuth();
  const username = user?.username ?? null;
  const [settings, setSettings] = useState<Settings>(readStoredSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const wasSignedIn = useRef(isSignedIn);

  // On sign-out, revert to this device's own local value — account data shouldn't
  // linger after sign-out (same reasoning as RoutesContext/CheckpointsContext).
  useEffect(() => {
    if (wasSignedIn.current && !isSignedIn) {
      setSettings(readStoredSettings());
    }
    wasSignedIn.current = isSignedIn;
  }, [isSignedIn]);

  // Signed in: on the first emission, no row yet means a brand-new account (seed the
  // backend from this device's current settings); a row already existing means a
  // returning user, whose cross-device value wins over this device's local one.
  useEffect(() => {
    if (!isSignedIn || !username) return;
    let hasReconciled = false;
    const subscription = client.models.UserSettings.observeQuery().subscribe({
      next: ({ items }) => {
        if (!hasReconciled) {
          hasReconciled = true;
          if (items.length === 0) {
            client.models.UserSettings.create({ id: username, ...settingsRef.current }).catch((error: unknown) => {
              console.error('Failed to create user settings', error);
            });
            return; // wait for the create() to echo back via the next emission
          }
        }
        if (items[0]) {
          setSettings(fromBackendItem(items[0]));
        }
      },
      error: (error: unknown) => {
        console.error('UserSettings subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn, username]);

  function updateSettings(patch: Partial<Settings>) {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    if (!isSignedIn) {
      persistLocally(next);
    }
    if (isSignedIn && username) {
      client.models.UserSettings.update({ id: username, ...next }).catch(() => {
        client.models.UserSettings.create({ id: username, ...next }).catch((error: unknown) => {
          console.error('Failed to persist settings', error);
        });
      });
    }
  }

  return <SettingsContext.Provider value={{ settings, updateSettings }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
