import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface Warning {
  id: string;
  message: string;
}

interface WarningsContextValue {
  warnings: Warning[];
  addWarning: (message: string) => void;
}

const WarningsContext = createContext<WarningsContextValue | null>(null);

// Import/parse failures surfaced to the user for the current session only — unlike
// routes/checkpoints/settings, warnings are never persisted (a stale warning from a
// previous session would be actively misleading).
export function WarningsProvider({ children }: { children: ReactNode }) {
  const [warnings, setWarnings] = useState<Warning[]>([]);

  function addWarning(message: string) {
    setWarnings((current) => [...current, { id: crypto.randomUUID(), message }]);
  }

  return <WarningsContext.Provider value={{ warnings, addWarning }}>{children}</WarningsContext.Provider>;
}

export function useWarnings(): WarningsContextValue {
  const context = useContext(WarningsContext);
  if (!context) {
    throw new Error('useWarnings must be used within a WarningsProvider');
  }
  return context;
}
