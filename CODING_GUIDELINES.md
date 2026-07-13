# Coding Guidelines

Prescriptive, forward-looking rules for writing code in this repo. This document is
normative: follow it for new code, and bring existing code into line with it
opportunistically when you're already touching a file, not as a dedicated pass.

Scope: this repo's actual stack — **React 19 + TypeScript + Vite** (frontend),
**AWS Amplify Gen2** (`amplify/data`, `amplify/auth` — the backend), and
**Vitest + React Testing Library** (verification). Every principle below is illustrated
with a real example already in this codebase where one exists, rather than a generic
snippet, so this stays checkable against the code instead of just aspirational.

## 1. General principles (apply to everything)

- **Prefer the smallest thing that solves the named problem.** No speculative
  flexibility, no config options nobody asked for, no abstraction built for a second
  use case that doesn't exist yet. This app has no backend Lambda functions and no
  `belongsTo`/`hasMany` relations in `amplify/data/resource.ts` because nothing here
  has needed either yet — don't add one ahead of a real requirement.
- **Optimize for the next reader, not for cleverness.** A junior engineer or a future
  you, six months on, should be able to read a function top to bottom and understand
  it without reaching for a debugger. If a one-liner needs a comment to explain what
  it does, it's usually clearer as three lines that don't.
- **Comments explain *why*, never *what*.** Well-named identifiers already say what
  the code does. A comment earns its place only when it records a non-obvious
  constraint, a workaround for a specific bug, or a reason a reader would otherwise
  have to reverse-engineer — see the race-condition comment in
  `useSignedOutMirror.ts`, or the "why a preferred route doesn't matter" reasoning
  implicit in `CheckpointsContext.tsx`'s `addManualCheckpoint`.
- **DRY is about knowledge, not text.** Two pieces of code that look similar but
  change for unrelated reasons should stay separate, even if that means some
  duplication. `src/lib/schedule.ts` (route measurement/ordering/timing) and
  `src/lib/format.ts` (display formatting) are deliberately separate modules even
  though both take a `Settings` argument — one is about computing the schedule, the
  other about rendering it, and they change for different reasons.
- **YAGNI beats extensibility theater.** Don't add a plugin system, a strategy
  pattern, or a generic config object for a requirement that's currently exactly one
  case. This app has exactly three synced entities (`Route`, `Checkpoint`,
  `UserSettings`) and three matching contexts, each a plain, un-generalized copy of
  the same four-part lifecycle (see §4) — resist generalizing that into a shared
  `useSyncedEntity<T>()` hook until a fourth real case actually needs it.

## 2. SOLID, adapted to functional TypeScript/React

SOLID was written for class-based OOP; this codebase has no classes outside generated
SDK internals. The principles still apply — just to functions, hooks, and modules
instead of classes.

- **S — Single Responsibility.** A function, hook, or component should have one
  reason to change. `RoutesContext`'s `addRoute`/`toggleRouteVisible`/`removeRoute`
  are each a few lines doing exactly one thing; `getScheduledCheckpoints`
  (`src/lib/schedule.ts`) only computes the ordered, time-scheduled checkpoint list —
  it has no idea how that list gets rendered, exported, or persisted.
- **O — Open/Closed.** Prefer extension over modification. Adding a fourth synced
  entity means writing a fourth context that follows the same shape as
  `RoutesContext`/`CheckpointsContext`/`SettingsContext` and mounting it once in
  `main.tsx` — no existing context needs to change.
- **L — Liskov Substitution.** Anything implementing a shared shape must be usable
  everywhere that shape is expected, without surprising the caller. Every
  `ScheduledCheckpoint` — whether a real photo checkpoint, a manual via point, or a
  route's virtual Start/End — renders identically from `MapView`'s and
  `CheckpointSchedule`'s point of view via the same fields (`kind`, `viaPoints`,
  `arrivalTime`, ...); neither component special-cases `virtual` checkpoints beyond
  the one `!checkpoint.virtual` check that's actually meaningful (whether remove/
  make-via actions apply).
- **I — Interface Segregation.** Depend on the narrowest shape that does the job, not
  a fat one with unused fields. `CheckpointRecord` (the persisted shape) carries no
  route-matching or scheduling fields at all — those only exist on the derived
  `ScheduledCheckpoint` produced by `getScheduledCheckpoints`, so persistence code
  never has to reason about (or accidentally serialize) stale computed data.
- **D — Dependency Inversion.** Components should depend on an abstraction (a hook, a
  context), not the concrete implementation underneath it. No component calls
  `generateClient()` directly — they call `useRoutes()`, `useCheckpoints()`,
  `useSettings()`. `MapView` is the one sanctioned place that touches the Leaflet
  `L.Map` instance directly (via `useMapRef()`), the same way this app has exactly one
  place that owns imperative map state instead of spreading `L.*` calls across
  components.

## 3. React + TypeScript conventions

- **Strict mode, always.** `tsconfig.app.json` already has `noUnusedLocals`,
  `noUnusedParameters`, and friends on — don't relax these to make an error go away;
  fix the actual unused code or parameter.
- **Function components + hooks only.** No class components anywhere in this repo;
  don't introduce one.
- **Type props and state explicitly**, especially when a value can be `null`/
  `undefined` — see `src/lib/types.ts`'s `CheckpointRecord`/`ScheduledCheckpoint` for
  the house style: a plain `interface`, no unnecessary generics.
- **Hooks only at the top level, never inside a condition or loop** — this is a React
  rule, not a style preference; breaking it produces silent, hard-to-debug state bugs.
- **Prefer a `Map` keyed lookup over `.find()` in a loop** when a value is checked or
  updated repeatedly against a growing collection — see `MapView.tsx`'s
  `routeLayersRef`/`markersRef` (`Map<string, L.Layer>`), reconciled by id every time
  routes/checkpoints change rather than re-finding a Leaflet layer by scanning.
- **Optimistic local update, then reconcile** for anything backed by a network call:
  update React state immediately so the UI feels instant, fire the network call
  without blocking on it, and let the source of truth (an `observeQuery()` emission,
  or a `.catch()` that logs and leaves state as-is) reconcile afterward. Every
  mutator in `RoutesContext.tsx`/`CheckpointsContext.tsx`/`SettingsContext.tsx`
  follows this shape — don't introduce a spinner-then-wait pattern for a write that
  doesn't need one.
- **Prefer a native form control over a custom ARIA widget when the semantics
  already exist natively.** The distance-unit toggle in `App.tsx` is a plain
  `<fieldset>`/`<legend>`/radio-input group (visually restyled via CSS, see
  `.unit-toggle` in `index.css`), not a custom `role="radiogroup"` built from
  `<button>`s — the browser's own radio semantics and keyboard behavior come for
  free, and are easy to lose by reaching for ARIA roles first.

## 4. State management & Context

- **A Context should do one job.** `RoutesContext` only knows routes;
  `CheckpointsContext` only knows checkpoints; `SettingsContext` only knows the
  units/speed/stop-duration/start-time preferences; `WarningsContext` only knows the
  current session's import warnings; `MapContext` only knows a ref to the Leaflet map
  instance. Don't fold unrelated state into an existing provider because it's
  convenient — add a new context.
- **Mount persistent providers once, at the app root** (`main.tsx`), not inside the
  tree of whichever component happens to need them.
- **Memoize a context's value only when the provider re-renders often and the value
  identity matters to consumers** — don't reach for `useMemo` on every context by
  default; none of this app's providers re-render often enough for it to be a real
  problem yet. Reach for it when it demonstrably is.
- **Split state that changes for different reasons into different contexts.**
  `MapContext` holds a plain ref (the Leaflet map instance changes only on mount/
  unmount) and is kept entirely separate from `RoutesContext`/`CheckpointsContext`
  (route/checkpoint data, which changes on every import or edit) — bundling them
  would force every route/checkpoint update to also reason about map lifecycle.
- **A context's hook must throw if used outside its provider** — every `useX()` in
  this repo (`useRoutes`, `useCheckpoints`, `useSettings`, `useAuth`, `useMapRef`,
  `useWarnings`) throws a specific "must be used within a ...Provider" error rather
  than silently returning `null`. Keep doing this; a silent `null` return defers the
  failure to a confusing crash somewhere else entirely.

## 5. AWS Amplify Gen2 (backend)

- **Deny-by-default, and the most specific rule wins.** Every model in
  `amplify/data/resource.ts` declares its own `.authorization((allow) =>
  [allow.owner()])`. Unlike an app that also serves a public/Lambda-backed operation,
  this schema has no anonymous access to carve out, so `defaultAuthorizationMode` is
  simply `'userPool'` — there's no apiKey/userPool mismatch to guard against here.
  If a public operation is ever added, give it its own explicit `allow.publicApiKey()`
  rather than changing the default.
- **Keep secrets server-side, always.** This app has no Lambda functions and no
  secrets today — if one is ever needed (e.g. a server-side API call), it must be an
  Amplify secret injected into a function's environment, never a frontend
  `import.meta.env` value (those ship in the bundle, and are not secret).
- **Prefer a plain string field over a GraphQL enum for a value that might evolve**,
  the same way `Checkpoint.waypointType`/`Checkpoint.status` are plain strings — a
  GraphQL enum can't hold a value with a hyphen, and changing an enum's members is a
  breaking schema change in a way a string field's accepted values are not.
- **A client-generated id, set explicitly on `create()`,** is what makes optimistic
  updates and idempotent migration retries possible — see every `addX` function in
  `RoutesContext.tsx`/`CheckpointsContext.tsx` calling `crypto.randomUUID()` itself
  rather than waiting for the backend to assign one.

## 6. Testing (Vitest + Testing Library)

- **Test behavior, not implementation.** Query by role, label, or visible text
  (`getByRole`, `getByLabelText`) — not by CSS class or a test-only id — so a test
  keeps passing through a refactor that doesn't change what the user sees or does.
- **Wrap a test in the real providers the component actually depends on, mocking only
  the network/auth edges** (`aws-amplify/auth`, `aws-amplify/utils`'s `Hub`, and
  `../lib/dataClient`'s `client` where a backend call is exercised) — not a fake
  version of your own context. This is why context tests compose the real
  `AuthProvider`/`RoutesProvider`/etc. rather than stubbing `useAuth`.
- **The pure logic in `src/lib/` (`gridref.ts`, `schedule.ts`, `export.ts`) deserves
  straightforward unit tests against known fixtures** — e.g. a coordinate with a known
  OS grid reference, or `test-fixtures/sample-route.gpx`'s expected checkpoint order —
  before reaching for a rendered-component test. This is the highest-value testing
  surface in this app: a bug in the route-projection or schedule math is silent and
  easy to miss by eye, unlike a rendering bug.
- **Reproduce a cross-mount bug (e.g. the sign-out revert) by actually mounting/
  unmounting the component under test, in one shared provider tree with
  `rerender()`** — two separate `render()` calls each get a fresh, disconnected
  provider tree and will not reproduce a bug that only exists because state survives
  (or fails to survive) a remount.
- **When you find yourself manually testing the same thing twice, write it down as a
  real test instead.**

## 7. Error handling

- **Fire-and-forget backend writes get a `.catch(console.error)`, not a silent
  swallow and not a re-thrown exception that would crash an optimistic update
  already shown to the user.** The UI has already moved on; log the failure for
  diagnosis rather than surfacing a disruptive error for something the user can't
  act on in the moment. See every mutator in `RoutesContext.tsx`/
  `CheckpointsContext.tsx`/`SettingsContext.tsx`.
- **A user-initiated action that can fail gets a real error state surfaced in the
  UI**, with a plain-language fallback message — see `SettingsDialog.tsx`'s
  `speedError`/`stopError` state, and `ImportControls.tsx`'s failed GPX/photo imports
  routed through `addWarning()` (rendered by `WarningsPanel`) — not a console-only log
  the user never sees for something they were actively waiting on.
- **Never let a caught error be silently discarded with an empty `catch {}`** unless
  the comment directly above it explains why swallowing it is correct — see
  `readStored`'s `catch { return []; }` in `src/lib/localStorage.ts`: a corrupt
  `localStorage` value falling back to an empty list is the deliberate, documented
  behavior, not an oversight.
- **Validate at the boundary, trust internal code past it.** `extractCheckpoint`
  (`src/lib/photos.ts`) validates a photo file's EXIF data at the point it enters the
  system; `schedule.ts`'s internal functions trust their typed inputs instead of
  re-checking them.

## 8. Security

- **Never introduce `dangerouslySetInnerHTML`.** Every piece of external input this
  app renders — a GPX file's route name, a photo's filename, EXIF metadata — goes
  through ordinary JSX or `textContent` assignment (see `MapView.tsx`'s
  `buildPopupElement`), never parsed as HTML.
- **No secret, token, or credential ever appears in frontend code, a committed file,
  or a build-time env var.** See §5 — an Amplify secret injected into a function
  would be the only sanctioned path for anything like this, if one is ever needed.
- **Treat every external input (a GPX file, EXIF/HEIC binary data, `localStorage`
  contents) as untrusted** — parse it defensively (`try { ... } catch { fall back }`,
  as `gpx.ts`, `heicExif.ts`, `photos.ts`, and `localStorage.ts` all already do)
  rather than assuming it matches the expected shape.

## Keeping this useful

This is a living document. When a new pattern gets established, a principle above
turns out to be wrong, or a real bug reveals a rule that should have been here,
update this file in the same change rather than letting the lesson live only in a
commit message or a conversation.
