import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './amplifyConfig';
import { AuthProvider } from './context/AuthContext';
import { RoutesProvider } from './context/RoutesContext';
import { CheckpointsProvider } from './context/CheckpointsContext';
import { SettingsProvider } from './context/SettingsContext';
import { WarningsProvider } from './context/WarningsContext';
import { MapProvider } from './context/MapContext';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <RoutesProvider>
          <CheckpointsProvider>
            <WarningsProvider>
              <MapProvider>
                <App />
              </MapProvider>
            </WarningsProvider>
          </CheckpointsProvider>
        </RoutesProvider>
      </SettingsProvider>
    </AuthProvider>
  </StrictMode>,
);
