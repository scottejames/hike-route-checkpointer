import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// This schema's defaultAuthorizationMode is already 'userPool' (see
// amplify/data/resource.ts) since every model here is owner-scoped and there are no
// public/Lambda-backed operations to keep on the API key — so, unlike beths-gang's
// dataClient.ts, there's no mismatch to guard against, but the explicit authMode is
// kept here anyway so this stays correct if a public operation is ever added later.
export const client = generateClient<Schema>({ authMode: 'userPool' });
