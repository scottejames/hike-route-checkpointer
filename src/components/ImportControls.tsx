import { useState } from 'react';
import type { DragEvent } from 'react';
import { useRoutes } from '../context/RoutesContext';
import { useCheckpoints } from '../context/CheckpointsContext';
import { useWarnings } from '../context/WarningsContext';
import { useMapRef } from '../context/MapContext';
import { parseGpxFile } from '../lib/gpx';
import { extractCheckpoint } from '../lib/photos';
import { fitAll } from '../lib/mapBounds';
import type { RouteRecord, ScheduledCheckpoint } from '../lib/types';

interface DropZoneFitProps {
  routesForFit: RouteRecord[];
  scheduledCheckpointsForFit: ScheduledCheckpoint[];
}

export function GpxDropZone({ routesForFit, scheduledCheckpointsForFit }: DropZoneFitProps) {
  const { addRoute } = useRoutes();
  const { addWarning } = useWarnings();
  const mapRef = useMapRef();
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: File[]) {
    for (const file of files) {
      try {
        addRoute(await parseGpxFile(file));
      } catch (error) {
        addWarning(error instanceof Error ? error.message : `${file.name}: could not import GPX.`);
      }
    }
    if (mapRef.current) {
      fitAll(mapRef.current, routesForFit, scheduledCheckpointsForFit);
    }
  }

  return (
    <label
      className={`drop-zone${dragOver ? ' drag-over' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragOver(false);
      }}
      onDrop={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setDragOver(false);
        void handleFiles([...event.dataTransfer.files]);
      }}
    >
      <span>Drop GPX files or browse</span>
      <input
        type="file"
        accept=".gpx,application/gpx+xml,text/xml"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void handleFiles(files);
        }}
      />
    </label>
  );
}

export function PhotoDropZone({ routesForFit, scheduledCheckpointsForFit }: DropZoneFitProps) {
  const { addCheckpointFromPhoto } = useCheckpoints();
  const { addWarning } = useWarnings();
  const mapRef = useMapRef();
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: File[]) {
    for (const file of files) {
      try {
        const result = await extractCheckpoint(file);
        if (result.type === 'checkpoint') {
          addCheckpointFromPhoto(result.checkpoint);
        } else {
          addWarning(result.message);
        }
      } catch (error) {
        addWarning(error instanceof Error ? error.message : `${file.name}: could not import photo.`);
      }
    }
    if (mapRef.current) {
      fitAll(mapRef.current, routesForFit, scheduledCheckpointsForFit);
    }
  }

  return (
    <label
      className={`drop-zone${dragOver ? ' drag-over' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragOver(false);
      }}
      onDrop={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setDragOver(false);
        void handleFiles([...event.dataTransfer.files]);
      }}
    >
      <span>Drop checkpoint photos or browse</span>
      <input
        type="file"
        accept="image/*,.heic,.heif,image/heic,image/heif"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void handleFiles(files);
        }}
      />
    </label>
  );
}
