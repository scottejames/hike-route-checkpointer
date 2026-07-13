import { useCheckpoints } from '../context/CheckpointsContext';
import { useSettings } from '../context/SettingsContext';
import { useMapRef } from '../context/MapContext';
import { formatDistance, formatDurationMinutes, formatTargetSpeed } from '../lib/format';
import type { ScheduledCheckpoint, Settings } from '../lib/types';

interface CheckpointScheduleProps {
  scheduledCheckpoints: ScheduledCheckpoint[];
  onSelectCheckpoint: (id: string) => void;
}

function TimelineLeg({ checkpoint, settings }: { checkpoint: ScheduledCheckpoint; settings: Settings }) {
  if (!Number.isFinite(checkpoint.segmentFromPreviousMeters)) return null;
  return (
    <div className="timeline-leg">
      <span>{formatDistance(checkpoint.segmentFromPreviousMeters, settings)}</span>
      <span>
        {formatDurationMinutes(checkpoint.legTravelMinutes)} at {formatTargetSpeed(settings)}
      </span>
    </div>
  );
}

function ViaRow({
  viaPoint,
  onZoom,
  onMakeCheckpoint,
  onRemove,
}: {
  viaPoint: ScheduledCheckpoint;
  onZoom: () => void;
  onMakeCheckpoint: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="list-item checkpoint-row via-row">
      <div className="item-main">
        <div className="item-title">{viaPoint.displayName || 'Via'}</div>
        <div className="item-meta">{viaPoint.gridRef}</div>
        {viaPoint.sourceFilename && <div className="item-meta">{viaPoint.sourceFilename}</div>}
      </div>
      <div className="item-actions">
        <button type="button" onClick={onZoom}>
          Zoom
        </button>
        <button type="button" onClick={onMakeCheckpoint}>
          Make checkpoint
        </button>
        <button type="button" onClick={onRemove}>
          Remove
        </button>
      </div>
    </article>
  );
}

function CheckpointRow({
  checkpoint,
  settings,
  onSelectCheckpoint,
  onMakeVia,
  onRemove,
  onStartTimeChange,
}: {
  checkpoint: ScheduledCheckpoint;
  settings: Settings;
  onSelectCheckpoint: () => void;
  onMakeVia: () => void;
  onRemove: () => void;
  onStartTimeChange: (value: string) => void;
}) {
  const isStart = checkpoint.kind === 'start';
  const isEnd = checkpoint.kind === 'end';

  return (
    <article className="list-item checkpoint-row">
      <div className="item-main">
        <div className="item-title">{checkpoint.displayName || checkpoint.filename}</div>
        <div className="item-meta">{checkpoint.gridRef}</div>
        {isStart && (
          <label className="start-time-control">
            <span>Start time</span>
            <input type="time" value={settings.startTime} onChange={(event) => onStartTimeChange(event.target.value)} />
          </label>
        )}
        {!isStart &&
          (isEnd ? (
            checkpoint.arrivalTime && <div className="item-meta">Estimated finish {checkpoint.arrivalTime}</div>
          ) : checkpoint.arrivalTime ? (
            <div className="item-meta">
              Arrive {checkpoint.arrivalTime} - stop {checkpoint.stopMinutes} min - leave {checkpoint.departureTime}
            </div>
          ) : (
            <div className="item-meta">Stop {checkpoint.stopMinutes} min</div>
          ))}
      </div>
      <div className="item-actions">
        <button type="button" onClick={onSelectCheckpoint}>
          Zoom
        </button>
        {!checkpoint.virtual && (
          <button type="button" onClick={onMakeVia}>
            Make via
          </button>
        )}
        {!checkpoint.virtual && (
          <button type="button" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </article>
  );
}

export function CheckpointSchedule({ scheduledCheckpoints, onSelectCheckpoint }: CheckpointScheduleProps) {
  const { setWaypointType, removeCheckpoint } = useCheckpoints();
  const { settings, updateSettings } = useSettings();
  const mapRef = useMapRef();

  function zoomAndSelect(checkpoint: ScheduledCheckpoint) {
    onSelectCheckpoint(checkpoint.id);
    if (mapRef.current) {
      mapRef.current.setView([checkpoint.latitude, checkpoint.longitude], 15);
    }
  }

  if (scheduledCheckpoints.length === 0) {
    return <div className="item-list empty-state">No checkpoints added.</div>;
  }

  return (
    <div className="checkpoint-timeline">
      {scheduledCheckpoints.map((checkpoint, index) => (
        <div key={checkpoint.id}>
          {index > 0 && <TimelineLeg checkpoint={checkpoint} settings={settings} />}
          {checkpoint.viaPoints.map((viaPoint) => (
            <ViaRow
              key={viaPoint.id}
              viaPoint={viaPoint}
              onZoom={() => zoomAndSelect(viaPoint)}
              onMakeCheckpoint={() => setWaypointType(viaPoint.id, 'checkpoint')}
              onRemove={() => removeCheckpoint(viaPoint.id)}
            />
          ))}
          <CheckpointRow
            checkpoint={checkpoint}
            settings={settings}
            onSelectCheckpoint={() => zoomAndSelect(checkpoint)}
            onMakeVia={() => setWaypointType(checkpoint.id, 'via')}
            onRemove={() => removeCheckpoint(checkpoint.id)}
            onStartTimeChange={(value) => updateSettings({ startTime: value })}
          />
        </div>
      ))}
    </div>
  );
}
