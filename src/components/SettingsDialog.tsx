import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getSpeedUnitLabel, getTargetSpeedForDisplay, displaySpeedToMph, formatSpeedValue } from '../lib/format';

export interface SettingsDialogHandle {
  open: () => void;
}

export const SettingsDialog = forwardRef<SettingsDialogHandle>(function SettingsDialog(_props, ref) {
  const { settings, updateSettings } = useSettings();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const speedInputRef = useRef<HTMLInputElement>(null);
  const stopInputRef = useRef<HTMLInputElement>(null);
  const [speedError, setSpeedError] = useState('');
  const [stopError, setStopError] = useState('');

  useImperativeHandle(ref, () => ({
    open() {
      setSpeedError('');
      setStopError('');
      // Inputs are uncontrolled (a native <dialog>'s own open/close is already
      // imperative) — reset them from current settings each time the dialog opens,
      // since `settings` may have changed since the fields last mounted.
      if (speedInputRef.current) {
        speedInputRef.current.value = formatSpeedValue(getTargetSpeedForDisplay(settings));
      }
      if (stopInputRef.current) {
        stopInputRef.current.value = String(settings.checkpointStopMinutes);
      }
      dialogRef.current?.showModal();
      speedInputRef.current?.focus();
      speedInputRef.current?.select();
    },
  }));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const displaySpeed = Number((form.elements.namedItem('target-speed') as HTMLInputElement).value);
    const checkpointStopMinutes = Number((form.elements.namedItem('checkpoint-stop') as HTMLInputElement).value);

    if (!Number.isFinite(displaySpeed) || displaySpeed <= 0) {
      setSpeedError('Enter a target speed greater than zero.');
      return;
    }
    if (!Number.isFinite(checkpointStopMinutes) || checkpointStopMinutes < 0) {
      setStopError('Enter a checkpoint stop duration of zero minutes or more.');
      return;
    }

    setSpeedError('');
    setStopError('');
    updateSettings({
      targetSpeedMph: displaySpeedToMph(displaySpeed, settings),
      checkpointStopMinutes: Math.round(checkpointStopMinutes),
    });
    dialogRef.current?.close();
  }

  return (
    <dialog ref={dialogRef} className="settings-dialog">
      <form className="settings-form" method="dialog" onSubmit={handleSubmit}>
        <header className="dialog-header">
          <h2>Settings</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close settings"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </header>
        <label className="field-group" htmlFor="target-speed">
          <span>Target speed</span>
          <span className="field-hint">{getSpeedUnitLabel(settings)}</span>
        </label>
        <input
          ref={speedInputRef}
          id="target-speed"
          name="target-speed"
          className="speed-input"
          type="number"
          min="0.1"
          max="20"
          step="0.1"
          inputMode="decimal"
          defaultValue={formatSpeedValue(getTargetSpeedForDisplay(settings))}
          onInput={() => setSpeedError('')}
        />
        {speedError && <p className="field-error">{speedError}</p>}
        <label className="field-group" htmlFor="checkpoint-stop">
          <span>Checkpoint stop</span>
          <span className="field-hint">minutes</span>
        </label>
        <input
          ref={stopInputRef}
          id="checkpoint-stop"
          name="checkpoint-stop"
          className="speed-input"
          type="number"
          min="0"
          max="240"
          step="1"
          inputMode="numeric"
          defaultValue={String(settings.checkpointStopMinutes)}
          onInput={() => setStopError('')}
        />
        {stopError && <p className="field-error">{stopError}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>
    </dialog>
  );
});
