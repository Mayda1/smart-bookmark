import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign Up
  async function signup(email, password) {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "הרשמה נכשלה");
    }

    localStorage.setItem("smart_bookmark_user", JSON.stringify(data));
    setCurrentUser(data);
    return data;
  }

  // Login
  async function login(email, password) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "התחברות נכשלה");
    }

    localStorage.setItem("smart_bookmark_user", JSON.stringify(data));
    setCurrentUser(data);
    return data;
  }

  // Logout
  async function logout() {
    localStorage.removeItem("smart_bookmark_user");
    setCurrentUser(null);
  }

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem("smart_bookmark_user"));
    if (savedUser) {
      setCurrentUser(savedUser);
    }
    setLoading(false);
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
