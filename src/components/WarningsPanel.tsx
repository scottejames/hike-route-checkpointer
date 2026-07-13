import { useWarnings } from '../context/WarningsContext';

export function WarningsPanel() {
  const { warnings } = useWarnings();

  if (warnings.length === 0) {
    return <div className="warning-list empty-state">No warnings.</div>;
  }

  return (
    <div className="warning-list">
      {warnings.map((warning) => (
        <div className="warning-item" key={warning.id}>
          {warning.message}
        </div>
      ))}
    </div>
  );
}
