import { defineAuth } from '@aws-amplify/backend';

// Email + password only — no social providers, no SMS. Cognito's own default email
// sender handles verification/reset codes.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
