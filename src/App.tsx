import { useMemo, useRef, useState } from 'react';
import { MapView } from './components/MapView';
import { GpxDropZone, PhotoDropZone } from './components/ImportControls';
import { RouteList } from './components/RouteList';
import { CheckpointSchedule } from './components/CheckpointSchedule';
import { WarningsPanel } from './components/WarningsPanel';
import { ExportButtons } from './components/ExportButtons';
import { SettingsDialog, type SettingsDialogHandle } from './components/SettingsDialog';
import { AccountButton } from './components/AccountButton';
import { useRoutes } from './context/RoutesContext';
import { useCheckpoints } from './context/CheckpointsContext';
import { useSettings } from './context/SettingsContext';
import { useMapRef } from './context/MapContext';
import { getScheduledCheckpoints } from './lib/schedule';
import { formatSettingsSummary } from './lib/format';
import { fitAll } from './lib/mapBounds';
import type { DistanceUnit } from './lib/types';

export function App() {
  const { routes } = useRoutes();
  const { checkpoints } = useCheckpoints();
  const { settings, updateSettings } = useSettings();
  const mapRef = useMapRef();
  const settingsDialogRef = useRef<SettingsDialogHandle>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

  const scheduledCheckpoints = useMemo(
    () => getScheduledCheckpoints(routes, checkpoints, settings),
    [routes, checkpoints, settings],
  );

  function handleFitAll() {
    if (mapRef.current) {
      fitAll(mapRef.current, routes, scheduledCheckpoints);
    }
  }

  function handleDistanceUnitChange(distanceUnit: DistanceUnit) {
    updateSettings({ distanceUnit });
  }

  return (
    <main className="app-shell">
      <MapView routes={routes} scheduledCheckpoints={scheduledCheckpoints} settings={settings} selectedCheckpointId={selectedCheckpointId} />

      <aside className="tool-panel" aria-label="Route and checkpoint tools">
        <header className="panel-header">
          <div>
            <h1>Hike Route Checkpointer</h1>
            <p>Import GPX routes and geotagged checkpoint photos.</p>
          </div>
          <AccountButton />
          <button type="button" className="icon-button" title="Fit all map data" aria-label="Fit all map data" onClick={handleFitAll}>
            ⌖
          </button>
        </header>

        <div className="config-bar" aria-label="Map settings">
          <fieldset className="unit-toggle">
            <legend>Distance units</legend>
            <label>
              <input
                type="radio"
                name="distance-unit"
                value="miles"
                checked={settings.distanceUnit === 'miles'}
                onChange={() => handleDistanceUnitChange('miles')}
              />
              <span>Miles</span>
            </label>
            <label>
              <input
                type="radio"
                name="distance-unit"
                value="km"
                checked={settings.distanceUnit === 'km'}
                onChange={() => handleDistanceUnitChange('km')}
              />
              <span>Km</span>
            </label>
          </fieldset>
          <span className="speed-summary">{formatSettingsSummary(settings)}</span>
          <button type="button" className="icon-button" title="Settings" aria-label="Settings" onClick={() => settingsDialogRef.current?.open()}>
            ⚙
          </button>
        </div>

        <section className="panel-section">
          <h2>GPX routes</h2>
          <GpxDropZone routesForFit={routes} scheduledCheckpointsForFit={scheduledCheckpoints} />
          <RouteList />
        </section>

        <section className="panel-section">
          <h2>Checkpoints</h2>
          <PhotoDropZone routesForFit={routes} scheduledCheckpointsForFit={scheduledCheckpoints} />
          <CheckpointSchedule scheduledCheckpoints={scheduledCheckpoints} onSelectCheckpoint={setSelectedCheckpointId} />
        </section>

        <ExportButtons scheduledCheckpoints={scheduledCheckpoints} settings={settings} />

        <section className="panel-section">
          <h2>Import warnings</h2>
          <WarningsPanel />
        </section>
      </aside>

      <SettingsDialog ref={settingsDialogRef} />
    </main>
  );
}
