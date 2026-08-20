import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./components/Login";
import SignUp from "./components/SignUp";
import Library from "./components/Library";
import Reader from "./components/Reader";

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" replace />;
}

// Public-only Route wrapper (redirects to home if already logged in)
function PublicRoute({ children }) {
  const { currentUser } = useAuth();
  return !currentUser ? children : <Navigate to="/" replace />;
}

function MainAppContent() {
  const { currentUser } = useAuth();
  const [viewMode, setViewMode] = useState("library"); // 'library' or 'reader'
  const [activeBookId, setActiveBookId] = useState(null);
  const [activeBookPage, setActiveBookPage] = useState(1);
  const [toasts, setToasts] = useState([]);

  // Toast manager
  function showToast(message, type = "info") {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, fadeOut: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, 4000);
  }

  // Open a book to read
  function handleOpenBook(bookId, page) {
    setActiveBookId(bookId);
    setActiveBookPage(page);
    setViewMode("reader");
  }

  // Close reader and return to library
  function handleCloseBook() {
    setViewMode("library");
    setActiveBookId(null);
  }

  return (
    <div className="app-container">
      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type} ${t.fadeOut ? 'fade-out' : ''}`}>
            <span>
              {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {currentUser ? (
        viewMode === "library" ? (
          <Library 
            onOpenBook={handleOpenBook} 
            showToast={showToast}
          />
        ) : (
          <Reader 
            bookId={activeBookId} 
            initialPage={activeBookPage} 
            onBack={handleCloseBook}
            onClose={handleCloseBook}
            showToast={showToast}
          />
        )
      ) : (
        <Navigate to="/login" replace />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Authentication Routes */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />
          
          <Route path="/signup" element={
            <PublicRoute>
              <SignUp />
            </PublicRoute>
          } />

          {/* Protected Main App */}
          <Route path="/*" element={
            <ProtectedRoute>
              <MainAppContent />
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
