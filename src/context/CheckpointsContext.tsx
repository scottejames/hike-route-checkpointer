import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { client } from '../lib/dataClient';
import { readStored } from '../lib/localStorage';
import { useSignedOutMirror } from '../hooks/useSignedOutMirror';
import { revokeCheckpointThumbnail } from '../lib/photos';
import { formatSixFigureGridRef } from '../lib/gridref';
import type { CheckpointRecord, WaypointType } from '../lib/types';
import type { Schema } from '../../amplify/data/resource';

const STORAGE_KEY = 'hike-route-checkpointer:checkpoints';
const MIGRATION_FLAG_KEY = 'hike-route-checkpointer:checkpoints-migrated';

function readStoredCheckpoints(): CheckpointRecord[] {
  return readStored<CheckpointRecord>(STORAGE_KEY);
}

// thumbnailUrl is deliberately never persisted (local or backend) — it's a browser
// object URL that doesn't survive a reload, let alone a round trip to another device.
function toBackendInput(checkpoint: CheckpointRecord) {
  return {
    id: checkpoint.id,
    sequence: checkpoint.sequence,
    filename: checkpoint.filename,
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    gridRef: checkpoint.gridRef,
    timestamp: checkpoint.timestamp || null,
    waypointType: checkpoint.waypointType,
    status: checkpoint.status || null,
  };
}

type BackendCheckpoint = Schema['Checkpoint']['type'];

function fromBackendItem(item: BackendCheckpoint): CheckpointRecord {
  return {
    id: item.id,
    sequence: item.sequence,
    filename: item.filename,
    latitude: item.latitude,
    longitude: item.longitude,
    gridRef: item.gridRef,
    timestamp: item.timestamp ?? '',
    thumbnailUrl: '',
    waypointType: item.waypointType === 'via' ? 'via' : 'checkpoint',
    status: item.status ?? '',
  };
}

function getManualCheckpointNumber(filename: string): number {
  const match = /^Manual checkpoint (\d+)$/.exec(filename || '');
  return match ? Number(match[1]) : 0;
}

interface CheckpointsContextValue {
  checkpoints: CheckpointRecord[];
  addCheckpointFromPhoto: (checkpoint: CheckpointRecord) => void;
  addManualCheckpoint: (latitude: number, longitude: number, waypointType?: WaypointType) => CheckpointRecord;
  setWaypointType: (id: string, waypointType: WaypointType) => void;
  removeCheckpoint: (id: string) => void;
}

const CheckpointsContext = createContext<CheckpointsContextValue | null>(null);

export function CheckpointsProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>(readStoredCheckpoints);
  const checkpointsRef = useRef(checkpoints);
  checkpointsRef.current = checkpoints;
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;

  useSignedOutMirror(checkpoints, isSignedIn, STORAGE_KEY, readStoredCheckpoints, (local) => {
    checkpointsRef.current = local;
    setCheckpoints(local);
  });

  useEffect(() => {
    if (!isSignedIn) return;
    const subscription = client.models.Checkpoint.observeQuery().subscribe({
      next: ({ items }) => {
        const mapped = items.map(fromBackendItem);
        checkpointsRef.current = mapped;
        setCheckpoints(mapped);
      },
      error: (error: unknown) => {
        console.error('Checkpoint subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    if (window.localStorage.getItem(MIGRATION_FLAG_KEY)) return;
    const localCheckpoints = readStoredCheckpoints();
    Promise.all(
      localCheckpoints.map((checkpoint) =>
        client.models.Checkpoint.create(toBackendInput(checkpoint)).catch((error: unknown) => {
          console.error('Failed to migrate local checkpoint', error);
        }),
      ),
    ).then(() => {
      window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    });
  }, [isSignedIn]);

  function nextSequence(): number {
    return checkpointsRef.current.reduce((max, checkpoint) => Math.max(max, checkpoint.sequence || 0), 0) + 1;
  }

  function addCheckpointFromPhoto(checkpoint: CheckpointRecord) {
    const withSequence: CheckpointRecord = { ...checkpoint, sequence: nextSequence() };
    setCheckpoints((current) => [...current, withSequence]);
    if (isSignedInRef.current) {
      client.models.Checkpoint.create(toBackendInput(withSequence)).catch((error: unknown) => {
        console.error('Failed to create checkpoint', error);
      });
    }
  }

  function addManualCheckpoint(latitude: number, longitude: number, waypointType: WaypointType = 'checkpoint'): CheckpointRecord {
    const gridRef = formatSixFigureGridRef(latitude, longitude);
    const manualNumber =
      checkpointsRef.current.reduce((max, checkpoint) => Math.max(max, getManualCheckpointNumber(checkpoint.filename)), 0) + 1;

    const checkpoint: CheckpointRecord = {
      id: crypto.randomUUID(),
      sequence: nextSequence(),
      filename: `Manual checkpoint ${manualNumber}`,
      latitude,
      longitude,
      gridRef,
      timestamp: '',
      thumbnailUrl: '',
      waypointType,
      status: 'manual',
    };
    setCheckpoints((current) => [...current, checkpoint]);
    if (isSignedInRef.current) {
      client.models.Checkpoint.create(toBackendInput(checkpoint)).catch((error: unknown) => {
        console.error('Failed to create checkpoint', error);
      });
    }
    return checkpoint;
  }

  function setWaypointType(id: string, waypointType: WaypointType) {
    setCheckpoints((current) => current.map((checkpoint) => (checkpoint.id === id ? { ...checkpoint, waypointType } : checkpoint)));
    if (isSignedInRef.current) {
      client.models.Checkpoint.update({ id, waypointType }).catch((error: unknown) => {
        console.error('Failed to update checkpoint waypoint type', error);
      });
    }
  }

  function removeCheckpoint(id: string) {
    const target = checkpointsRef.current.find((checkpoint) => checkpoint.id === id);
    if (target) {
      revokeCheckpointThumbnail(target);
    }
    setCheckpoints((current) => current.filter((checkpoint) => checkpoint.id !== id));
    if (isSignedInRef.current) {
      client.models.Checkpoint.delete({ id }).catch((error: unknown) => {
        console.error('Failed to delete checkpoint', error);
      });
    }
  }

  return (
    <CheckpointsContext.Provider
      value={{ checkpoints, addCheckpointFromPhoto, addManualCheckpoint, setWaypointType, removeCheckpoint }}
    >
      {children}
    </CheckpointsContext.Provider>
  );
}

export function useCheckpoints(): CheckpointsContextValue {
  const context = useContext(CheckpointsContext);
  if (!context) {
    throw new Error('useCheckpoints must be used within a CheckpointsProvider');
  }
  return context;
}
