import { useEffect, useRef, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';

export function AccountButton() {
  const { user, isSignedIn, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wasSignedIn = useRef(isSignedIn);

  // Close the modal the moment sign-in completes — the account button itself already
  // updates to show the signed-in email, which is confirmation enough on its own.
  useEffect(() => {
    if (!wasSignedIn.current && isSignedIn) {
      setOpen(false);
    }
    wasSignedIn.current = isSignedIn;
  }, [isSignedIn]);

  // Avoid a flash of "Sign in" before the initial session check resolves.
  if (loading) return null;

  async function handleSignOut() {
    await signOut();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="account-button"
        onClick={() => setOpen(true)}
        aria-label={isSignedIn ? `Signed in as ${user?.email}. Click to manage your account.` : 'Sign in'}
      >
        <span aria-hidden="true">👤</span>
        <span className="account-button-label">{isSignedIn ? user?.email : 'Sign in'}</span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          {isSignedIn ? (
            <div>
              <h2>Account</h2>
              <p className="tool-intro">Signed in as {user?.email}</p>
              <p className="tool-intro">Your routes, checkpoints, and settings sync across your signed-in devices.</p>
              <button type="button" className="account-signout" onClick={() => void handleSignOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="amplify-auth-theme">
              <Authenticator />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
