import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { RoutesProvider, useRoutes } from './RoutesContext';
import { AuthProvider } from './AuthContext';
import { client } from '../lib/dataClient';
import type { RouteRecord } from '../lib/types';

const STORAGE_KEY = 'hike-route-checkpointer:routes';
const MIGRATION_FLAG_KEY = 'hike-route-checkpointer:routes-migrated';

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

let authHubCallback: ((payload: { payload: { event: string } }) => void) | null = null;

vi.mock('../lib/dataClient', () => ({
  client: {
    models: {
      Route: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RoutesProvider>{children}</RoutesProvider>
    </AuthProvider>
  );
}

const SAMPLE_ROUTE: RouteRecord = {
  id: 'r1',
  filename: 'sample.gpx',
  displayName: 'Sample Route',
  visible: true,
  geojson: { type: 'FeatureCollection', features: [] },
};

describe('RoutesContext (signed out)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen)
      .mockReset()
      .mockImplementation((_channel, callback) => {
        authHubCallback = callback as typeof authHubCallback;
        return vi.fn();
      });
    vi.mocked(client.models.Route.create).mockClear();
    vi.mocked(client.models.Route.update).mockClear();
    vi.mocked(client.models.Route.delete).mockClear();
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
  });

  it('adds a route to state and mirrors it to localStorage while signed out', async () => {
    const { result } = renderHook(() => useRoutes(), { wrapper });

    act(() => {
      result.current.addRoute(SAMPLE_ROUTE);
    });

    expect(result.current.routes).toEqual([SAMPLE_ROUTE]);
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
      expect(stored).toEqual([SAMPLE_ROUTE]);
    });
    expect(client.models.Route.create).not.toHaveBeenCalled();
  });

  it('toggles visibility and removes a route from state', () => {
    const { result } = renderHook(() => useRoutes(), { wrapper });

    act(() => {
      result.current.addRoute(SAMPLE_ROUTE);
    });
    act(() => {
      result.current.toggleRouteVisible('r1');
    });
    expect(result.current.routes[0].visible).toBe(false);

    act(() => {
      result.current.removeRoute('r1');
    });
    expect(result.current.routes).toEqual([]);
  });
});

describe('RoutesContext (sign-in lifecycle)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
    authHubCallback = null;
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen)
      .mockReset()
      .mockImplementation((_channel, callback) => {
        authHubCallback = callback as typeof authHubCallback;
        return vi.fn();
      });
    // Cast away Amplify's generated Schema type here — combining it with vi.mocked's
    // own generics causes TS to blow up trying to instantiate the resulting type.
    const observeQueryMock = client.models.Route.observeQuery as unknown as ReturnType<typeof vi.fn>;
    observeQueryMock.mockReset().mockReturnValue({ subscribe: () => ({ unsubscribe: vi.fn() }) });
    const createMock = client.models.Route.create as unknown as ReturnType<typeof vi.fn>;
    createMock.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
  });

  it('migrates local routes to the backend exactly once on first sign-in', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([SAMPLE_ROUTE]));

    renderHook(() => useRoutes(), { wrapper });

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      username: 'alice',
      signInDetails: { loginId: 'alice@example.com' },
    } as Awaited<ReturnType<typeof amplifyAuth.getCurrentUser>>);

    act(() => {
      authHubCallback?.({ payload: { event: 'signedIn' } });
    });

    await waitFor(() => {
      expect(client.models.Route.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    });
    expect(window.localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('true');
  });

  it('reverts to the local device value on sign-out', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([SAMPLE_ROUTE]));
    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      username: 'alice',
      signInDetails: { loginId: 'alice@example.com' },
    } as Awaited<ReturnType<typeof amplifyAuth.getCurrentUser>>);

    const { result } = renderHook(() => useRoutes(), { wrapper });
    await waitFor(() => expect(result.current.routes).toEqual([SAMPLE_ROUTE]));

    // Simulate an account-only route arriving via observeQuery while signed in.
    act(() => {
      result.current.addRoute({ ...SAMPLE_ROUTE, id: 'account-only', filename: 'cloud.gpx' });
    });
    expect(result.current.routes).toHaveLength(2);

    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('signed out'));
    act(() => {
      authHubCallback?.({ payload: { event: 'signedOut' } });
    });

    await waitFor(() => {
      expect(result.current.routes).toEqual([SAMPLE_ROUTE]);
    });
  });
});
