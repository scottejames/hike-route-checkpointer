import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

// Owner-scoped models mirroring the three localStorage keys this app persisted to
// before cloud sync existed (see src/lib/localStorage.ts and each *Context.tsx's
// signed-in/out lifecycle). No public/anonymous operations exist in this app, so —
// unlike a schema that also serves a Lambda-backed public API — the default auth mode
// can just be 'userPool' below; there's no apiKey/userPool mismatch to guard against.
const schema = a.schema({
  // geojson is stored as-is from @tmcw/togeojson's GPX conversion; a.json() keeps it
  // schema-less since a route's feature/geometry shape isn't this app's to constrain.
  Route: a
    .model({
      filename: a.string().required(),
      displayName: a.string().required(),
      geojson: a.json().required(),
      visible: a.boolean().required().default(true),
    })
    .authorization((allow) => [allow.owner()]),

  // waypointType/status are plain strings (not GraphQL enums) since both are expected
  // to gain values over time — same reasoning as every plain-string field in
  // beths-gang's schema (a hyphenated value would be illegal in an enum, and adding a
  // member is a breaking schema change; a string field's accepted values are not).
  Checkpoint: a
    .model({
      sequence: a.integer().required(),
      filename: a.string().required(),
      latitude: a.float().required(),
      longitude: a.float().required(),
      gridRef: a.string().required(),
      timestamp: a.string(),
      waypointType: a.string().required(),
      status: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  // One record per signed-in user (id set client-side to their Cognito username, same
  // pattern as beths-gang's UserPreferences) — an upsert target, not a list.
  UserSettings: a
    .model({
      distanceUnit: a.string().required(),
      targetSpeedMph: a.float().required(),
      checkpointStopMinutes: a.integer().required(),
      startTime: a.string(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
