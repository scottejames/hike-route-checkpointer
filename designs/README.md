# Design Documents

Retrospective design docs for this project's key architecture and features — the *why*
behind decisions, not just the *what* (which the code and `CHANGELOG.md` already show).
Written to be the fast way back into the reasoning behind a piece of the app: what
problem it solves, what alternatives were considered and rejected, and how it was
verified. Read `architecture-overview.md` first — every other document assumes its
patterns.

| Document | Covers |
|---|---|
| [`architecture-overview.md`](./architecture-overview.md) | The foundational patterns everything else builds on: why this migration happened, the local-first-with-optional-sync pattern for `Route`/`Checkpoint`/`UserSettings`, why Amplify Data's `defaultAuthorizationMode` is `'userPool'` directly here (unlike `beths-gang`), and the `MapContext` ref pattern for commanding Leaflet's imperative map from React components. Start here. |

## Keeping this useful

These are living documents, not a one-time snapshot — when a feature covered here
changes in a way that invalidates what's written (a new architectural decision, a
reversed trade-off, a bug fix that changes the design), update the relevant document
rather than letting it drift out of sync with the code. A design doc that's known to be
stale is worse than no design doc, since it actively misleads instead of just being
silent.
