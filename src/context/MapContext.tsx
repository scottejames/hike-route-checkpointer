import { createContext, useContext, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import type L from 'leaflet';

type MapRef = MutableRefObject<L.Map | null>;

const MapContext = createContext<MapRef | null>(null);

// Leaflet owns its map instance imperatively (setView/fitBounds/openPopup calls, not
// props), so a plain ref shared via context — rather than the map itself living in
// React state — is what lets RouteList/CheckpointSchedule command the map (zoom to a
// route, pan to and open a checkpoint's popup) without MapView re-rendering on every
// such command.
export function MapProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<L.Map | null>(null);
  return <MapContext.Provider value={mapRef}>{children}</MapContext.Provider>;
}

export function useMapRef(): MapRef {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapRef must be used within a MapProvider');
  }
  return context;
}
