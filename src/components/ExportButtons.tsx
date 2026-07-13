import { downloadCheckpointCsv, downloadCheckpointGeojson } from '../lib/export';
import { formatTargetSpeed } from '../lib/format';
import type { ScheduledCheckpoint, Settings } from '../lib/types';

interface ExportButtonsProps {
  scheduledCheckpoints: ScheduledCheckpoint[];
  settings: Settings;
}

export function ExportButtons({ scheduledCheckpoints, settings }: ExportButtonsProps) {
  const disabled = scheduledCheckpoints.length === 0;
  const exportOptions = { ...settings, targetSpeedLabel: formatTargetSpeed(settings) };

  return (
    <section className="panel-section actions-section">
      <h2>Export</h2>
      <div className="button-row">
        <button type="button" disabled={disabled} onClick={() => downloadCheckpointCsv(scheduledCheckpoints, exportOptions)}>
          Download CSV
        </button>
        <button type="button" disabled={disabled} onClick={() => downloadCheckpointGeojson(scheduledCheckpoints, exportOptions)}>
          Download GeoJSON
        </button>
      </div>
    </section>
  );
}
