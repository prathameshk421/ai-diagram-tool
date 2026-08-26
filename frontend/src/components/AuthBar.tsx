import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebase, isFirebaseConfigured } from "../lib/firebase";

export function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    const services = getFirebase();
    if (!services) return;
    return onAuthStateChanged(services.auth, setUser);
  }, []);

  async function signIn() {
    const services = getFirebase();
    if (!services) return;
    await signInWithPopup(services.auth, new GoogleAuthProvider());
  }

  async function logOut() {
    const services = getFirebase();
    if (!services) return;
    await signOut(services.auth);
  }

  if (!configured) {
    return <span className="hint">Add frontend/.env to enable Google sign-in</span>;
  }

  if (user) {
    return (
      <div className="auth-bar">
        <span className="hint">{user.displayName ?? user.email}</span>
        <button type="button" onClick={() => void logOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => void signIn()}>
      Sign in with Google
    </button>
  );
}
