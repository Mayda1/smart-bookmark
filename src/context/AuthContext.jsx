import React, { createContext, useContext, useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, isMock } from "../firebase";

const AuthContext = createContext();

// Admin emails — mirrors the check used across the app (Library.jsx, Firestore rules)
const ADMIN_EMAILS = ["mayda2604@gmail.com", "admin@smartbookmark.com"];

// Translates Firebase Auth error codes into the Hebrew messages the UI already expects
function translateAuthError(err) {
  const code = err && err.code;
  const map = {
    "auth/email-already-in-use": "האימייל כבר קיים במערכת",
    "auth/invalid-email": "כתובת אימייל לא תקינה",
    "auth/weak-password": "הסיסמה חייבת להכיל לפחות 6 תווים",
    "auth/user-not-found": "שם המשתמש או הסיסמה שגויים",
    "auth/wrong-password": "שם המשתמש או הסיסמה שגויים",
    "auth/invalid-credential": "שם המשתמש או הסיסמה שגויים",
    "auth/too-many-requests": "יותר מדי ניסיונות התחברות כושלים. נסי שוב מאוחר יותר"
  };
  return new Error(map[code] || err.message || "שגיאת התחברות");
}

export function useAuth() {
  return useContext(AuthContext);
}

// Shapes a Firebase Auth user into the { email, uid, role } object the rest
// of the app already expects (same shape the old Express API returned).
function shapeUser(fbUser) {
  if (!fbUser) return null;
  const email = (fbUser.email || "").toLowerCase();
  return {
    uid: fbUser.uid,
    email,
    role: ADMIN_EMAILS.includes(email) ? "admin" : "user"
  };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign Up
  async function signup(email, password) {
    if (isMock || !auth) {
      throw new Error("Firebase לא מוגדר בסביבה הזו — לא ניתן להירשם כרגע.");
    }
    const normalizedEmail = email.toLowerCase().trim();
    try {
      const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

      // Create the user's profile doc in Firestore (used by the admin "registered users" view)
      await setDoc(doc(db, "users", cred.user.uid), {
        email: normalizedEmail,
        createdAt: serverTimestamp()
      });

      const shaped = shapeUser(cred.user);
      setCurrentUser(shaped);
      return shaped;
    } catch (err) {
      throw translateAuthError(err);
    }
  }

  // Login
  async function login(email, password) {
    if (isMock || !auth) {
      throw new Error("Firebase לא מוגדר בסביבה הזו — לא ניתן להתחבר כרגע.");
    }
    const normalizedEmail = email.toLowerCase().trim();
    try {
      const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const shaped = shapeUser(cred.user);
      setCurrentUser(shaped);
      return shaped;
    } catch (err) {
      throw translateAuthError(err);
    }
  }

  // Logout
  async function logout() {
    await signOut(auth);
    setCurrentUser(null);
  }

  useEffect(() => {
    // If Firebase failed to initialize (missing/invalid env vars), fall back to a
    // signed-out mock state instead of crashing the whole app on a blank screen.
    if (isMock || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setCurrentUser(shapeUser(fbUser));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    logout,
    isMock
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
