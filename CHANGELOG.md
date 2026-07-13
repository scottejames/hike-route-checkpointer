# Changelog

## 2026-07-13

### Changed

- Migrated the entire app from a zero-build vanilla JS/HTML/CSS static site to React 19
  + TypeScript + Vite, with an AWS Amplify Gen2 backend (Cognito auth, owner-scoped
  `Route`/`Checkpoint`/`UserSettings` DynamoDB models) — matching the stack and coding
  conventions already established in the `beths-gang` project, per the user's request to
  adopt the same technology framework and guidelines.
  - All domain logic (GPX parsing, OS grid reference conversion, HEIC/EXIF extraction,
    route projection/scheduling, CSV/GeoJSON export) was ported behavior-for-behavior
    into typed `src/lib/` modules, not redesigned — verified with a byte-for-byte parity
    check against the original `js/gridref.js` for a real coordinate.
  - Routes/checkpoints/settings remain fully usable offline via `localStorage` when
    signed out; signing in (optional, via the account button) syncs them across
    devices — new functionality this migration added, following the same local-first/
    optional-cloud-sync pattern `beths-gang` already uses for its own data.
  - Deployment moves from an rsync-to-SSH-host script to AWS Amplify Hosting
    (git-based); `scripts/deploy.sh` was removed.
  - Added `CODING_GUIDELINES.md`, copied from `beths-gang` and rewritten to reference
    this codebase's actual files.
  - Added the `update-project-artifacts` skill (`.claude/skills/`), adapted from the
    same skill in `beths-gang`, to keep this file, README.md, and CODING_GUIDELINES.md
    from drifting out of sync with what's actually built.

### Added

- Added a `designs/` folder (`designs/README.md` index + `designs/architecture-overview.md`),
  matching `beths-gang`'s pattern of retrospective design docs — captures the *why*
  behind the migration above (the local-first/optional-sync context lifecycle, why
  Amplify Data's `defaultAuthorizationMode` is `'userPool'` directly here, the
  `MapContext` ref pattern for commanding Leaflet from React) so the reasoning doesn't
  only live in this conversation.
- Updated the `update-project-artifacts` skill to check whether a significant change
  warrants a new or updated `designs/` document, now that the folder exists.
