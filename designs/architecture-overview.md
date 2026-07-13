# Architecture Overview — Hike Route Checkpointer

**Status:** Foundational, written 2026-07-13 during the migration from a zero-build
vanilla JS/HTML/CSS static site to React 19 + TypeScript + Vite + AWS Amplify Gen2 —
the same stack and conventions already established in the `beths-gang` project. This
is the "read first" document — later design docs in this folder build on the patterns
here.

## Why this migration happened

The app was a working, single-file-per-concern vanilla JS site (`js/app.js` at ~1,500
lines owned almost everything: state, DOM rendering, event wiring, Leaflet map
management) with no build step, no backend, and `localStorage`-only persistence. The
user wanted it rebuilt on the same framework as `beths-gang` — React + TypeScript +
Vite, plus an Amplify Gen2 backend so routes/checkpoints/settings can follow a signed-in
user across devices — and to adopt the same `CODING_GUIDELINES.md`. The domain logic
itself (GPX parsing, OS grid reference conversion, HEIC/EXIF extraction, route
projection/scheduling, CSV/GeoJSON export) was **ported behavior-for-behavior, not
redesigned** — verified with a byte-for-byte parity check of `gridref.ts` against the
original `js/gridref.js` for the same input coordinates (see `gridref.test.ts`).

## The core idea: this app has no plugin framework, and shouldn't get one

Unlike `beths-gang` (a toolbox of ~18 independent mini-tools behind a shared registry),
this is a **single-purpose app** — one map, one schedule, one set of import/export
actions. There is no `src/tools/registry.ts` equivalent here, and adding one
speculatively would be exactly the "extensibility theater" `CODING_GUIDELINES.md` §1
warns against. If this app ever grows a second genuinely distinct tool, that's the
point to revisit this decision, not before.

## Local-first data, optional cloud sync

Three entities — `Route`, `Checkpoint`, `UserSettings` — each get their own context
(`RoutesContext`, `CheckpointsContext`, `SettingsContext`), following the exact
four-part lifecycle `beths-gang`'s `RemindersContext`/`TaskStoreContext` established:

1. `readStored<T>`/`readStoredValue<T>` (`src/lib/localStorage.ts`) seeds state from
   `localStorage` on mount.
2. `useSignedOutMirror` (ported near-verbatim) mirrors state to `localStorage` while
   signed out, and reverts to the local value the instant the user signs out.
3. An `observeQuery()` effect, active only while signed in, keeps state synced with the
   backend.
4. A first-sign-in migration effect uploads whatever was local, using each record's own
   client-generated id so a re-run just fails a duplicate `create()` harmlessly.

`SettingsContext` is the one variation: it's a *singleton* per user (one `UserSettings`
row keyed by Cognito username), following `beths-gang`'s `EnergyContext`/
`UserPreferences` shape rather than the list shape `Routes`/`Checkpoints` use.

**Route metrics are never persisted.** The original app mutated `routeOffsetMeters`/
`segmentFromPreviousMeters`/etc. directly onto each checkpoint object and recomputed
them on every render. This port instead keeps `CheckpointRecord` (the persisted shape)
free of any route-matching field — `getScheduledCheckpoints` (`src/lib/schedule.ts`)
derives a fresh `ScheduledCheckpoint[]` from `routes`/`checkpoints`/`settings` on every
call, via `useMemo` in `App.tsx`. This is a deliberate improvement over the original's
mutate-in-place approach (see `CODING_GUIDELINES.md` §2's Interface Segregation entry)
and also means a manual checkpoint's "preferred route" (the route it was clicked on)
never needs to be threaded through and stored — the unrestricted nearest-route search
already finds the same route in practice, since the click happened on it.

## Amplify Data: no public operations, so no apiKey/userPool split

`beths-gang`'s schema keeps two Lambda-backed operations (`runAiTool`, `logEvent`) on
`allow.publicApiKey()` and every user-owned model on `allow.owner()`, which forces its
`dataClient.ts` to override `authMode: 'userPool'` explicitly (documented as a real
incident there — an unauthenticated call against an owner-scoped model fails silently
otherwise). This app has **no Lambda functions and no public operations at all** — every
model (`Route`, `Checkpoint`, `UserSettings`) is owner-scoped, so
`defaultAuthorizationMode: 'userPool'` is set directly in `amplify/data/resource.ts`,
sidestepping that whole class of bug rather than needing to guard against it. If a
public/Lambda-backed operation is ever added here, give it its own explicit
`allow.publicApiKey()` rather than changing the default back.

## MapView owns the one piece of imperative state

Leaflet is not React-native — a map instance, its layers, and its markers are mutated
imperatively, not rendered from props. Rather than spreading `L.*` calls across
components, `MapContext` holds a single stable `ref` to the `L.Map` instance
(`src/context/MapContext.tsx`), set once by `MapView` on mount. Every other component
that needs to command the map (`RouteList`'s "Zoom", `CheckpointSchedule`'s "Zoom",
`App.tsx`'s "fit all" button, `ImportControls`' post-import fit) reads `mapRef.current`
and calls Leaflet's own imperative API (`setView`, `fitBounds`) directly — this is the
Dependency Inversion parallel to `beths-gang`'s "no tool calls `generateClient()`
directly" rule (§2 D): no component *other than* `MapView` constructs or destroys
Leaflet layers, but any component may command the already-mounted map through the
shared ref.

`MapView` reconciles route layers and checkpoint/via/endpoint markers by id on every
change (`Map<string, L.Layer>`, not `.find()` in a loop — see `CODING_GUIDELINES.md`
§3), updating an existing marker's icon/popup in place rather than destroying and
recreating it, so a popup a user has open doesn't get yanked away by an unrelated
settings change.

## Where things live

```
src/
  lib/                 — pure functions with no React dependency:
                          gridref.ts, gpx.ts, heicExif.ts, photos.ts (domain parsing),
                          schedule.ts (route measurement/ordering/timing engine),
                          format.ts (display formatting, depends on schedule.ts),
                          export.ts (CSV/GeoJSON), localStorage.ts, dataClient.ts,
                          mapBounds.ts, types.ts
  context/              — RoutesContext, CheckpointsContext, SettingsContext (local-first
                          + optional sync), AuthContext, WarningsContext (session-only,
                          never persisted), MapContext (the Leaflet map ref)
  hooks/                — useSignedOutMirror
  components/           — MapView (the one place that touches Leaflet directly),
                          ImportControls (GpxDropZone/PhotoDropZone), RouteList,
                          CheckpointSchedule (+ TimelineLeg/ViaRow/CheckpointRow),
                          WarningsPanel, ExportButtons, SettingsDialog, AccountButton,
                          Modal
amplify/
  auth/resource.ts       — Cognito, email/password only
  data/resource.ts        — Route, Checkpoint, UserSettings; defaultAuthorizationMode
                            is 'userPool' directly (see above — no public operations
                            to keep separate)
```

## Testing conventions

Test files sit next to the code they test (`*.test.ts(x)`), matching `beths-gang`.
`src/lib/`'s pure functions (`gridref.ts`, `schedule.ts`, `gpx.ts`, `export.ts`) get
direct unit tests against known fixtures — this is the highest-value testing surface in
this app, since a bug in the route-projection or schedule math is silent and easy to
miss by eye. Context tests (`RoutesContext.test.tsx`) wrap the real `AuthProvider`/
`RoutesProvider` tree and mock only `aws-amplify/auth`, `Hub`, and `dataClient`'s
`client.models.*` — same convention as `beths-gang`'s `RemindersContext.test.tsx`.

One gotcha worth recording: verifying the app manually with a headless-Chromium script,
a `page.screenshot()` taken immediately after `waitForSelector` found a Leaflet popup's
button in the DOM produced a screenshot that *looked* empty — the popup's open
animation hadn't visually painted yet, even though the element already existed in the
DOM and the selector matched. A short `waitForTimeout` after the wait (or asserting on
`localStorage` state instead of DOM presence) is the reliable signal, not DOM presence
alone, for anything Leaflet animates open/closed.
