import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { client } from '../lib/dataClient';
import { readStored } from '../lib/localStorage';
import { useSignedOutMirror } from '../hooks/useSignedOutMirror';
import type { RouteRecord } from '../lib/types';
import type { Schema } from '../../amplify/data/resource';

const STORAGE_KEY = 'hike-route-checkpointer:routes';
const MIGRATION_FLAG_KEY = 'hike-route-checkpointer:routes-migrated';

function readStoredRoutes(): RouteRecord[] {
  return readStored<RouteRecord>(STORAGE_KEY);
}

function toBackendInput(route: RouteRecord) {
  return {
    id: route.id,
    filename: route.filename,
    displayName: route.displayName,
    geojson: route.geojson,
    visible: route.visible,
  };
}

type BackendRoute = Schema['Route']['type'];

function fromBackendItem(item: BackendRoute): RouteRecord {
  return {
    id: item.id,
    filename: item.filename,
    displayName: item.displayName,
    geojson: item.geojson as RouteRecord['geojson'],
    visible: item.visible,
  };
}

interface RoutesContextValue {
  routes: RouteRecord[];
  addRoute: (route: RouteRecord) => void;
  toggleRouteVisible: (id: string) => void;
  removeRoute: (id: string) => void;
}

const RoutesContext = createContext<RoutesContextValue | null>(null);

export function RoutesProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [routes, setRoutes] = useState<RouteRecord[]>(readStoredRoutes);
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;

  useSignedOutMirror(routes, isSignedIn, STORAGE_KEY, readStoredRoutes, setRoutes);

  // Signed in: routes live in the backend. observeQuery emits the current set
  // immediately, then live updates.
  useEffect(() => {
    if (!isSignedIn) return;
    const subscription = client.models.Route.observeQuery().subscribe({
      next: ({ items }) => setRoutes(items.map(fromBackendItem)),
      error: (error: unknown) => {
        console.error('Route subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn]);

  // First sign-in on this device only: upload whatever's in localStorage. Uses each
  // route's existing client-generated id, so a re-run (Strict Mode, signing in again)
  // just fails the duplicate create() harmlessly instead of double-uploading.
  useEffect(() => {
    if (!isSignedIn) return;
    if (window.localStorage.getItem(MIGRATION_FLAG_KEY)) return;
    const localRoutes = readStoredRoutes();
    Promise.all(
      localRoutes.map((route) =>
        client.models.Route.create(toBackendInput(route)).catch((error: unknown) => {
          console.error('Failed to migrate local route', error);
        }),
      ),
    ).then(() => {
      window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    });
  }, [isSignedIn]);

  function addRoute(route: RouteRecord) {
    setRoutes((current) => [...current, route]);
    if (isSignedInRef.current) {
      client.models.Route.create(toBackendInput(route)).catch((error: unknown) => {
        console.error('Failed to create route', error);
      });
    }
  }

  function toggleRouteVisible(id: string) {
    const target = routes.find((route) => route.id === id);
    if (!target) return;
    const nextVisible = !target.visible;
    setRoutes((current) => current.map((route) => (route.id === id ? { ...route, visible: nextVisible } : route)));
    if (isSignedInRef.current) {
      client.models.Route.update({ id, visible: nextVisible }).catch((error: unknown) => {
        console.error('Failed to update route visibility', error);
      });
    }
  }

  function removeRoute(id: string) {
    setRoutes((current) => current.filter((route) => route.id !== id));
    if (isSignedInRef.current) {
      client.models.Route.delete({ id }).catch((error: unknown) => {
        console.error('Failed to delete route', error);
      });
    }
  }

  return (
    <RoutesContext.Provider value={{ routes, addRoute, toggleRouteVisible, removeRoute }}>{children}</RoutesContext.Provider>
  );
}

export function useRoutes(): RoutesContextValue {
  const context = useContext(RoutesContext);
  if (!context) {
    throw new Error('useRoutes must be used within a RoutesProvider');
  }
  return context;
}
