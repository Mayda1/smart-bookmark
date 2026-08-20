import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { 
  getUserBooks, 
  getCatalog, 
  addCatalogBook, 
  purchaseBook, 
  linkBookmarkDevice, 
  getUserDevices,
  getAdminDatabase,
  getUserNotes,
  addNote,
  deleteNote
} from "../dbHelper";
import { translations } from "../translations";
import { useNavigate } from "react-router-dom";
import NoteMenu from "./NoteMenu";

export default function Library({ onOpenBook, showToast, refreshTrigger }) {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("library"); // 'library', 'store', 'journal', or 'admin_db'
  const [books, setBooks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [linkedDevices, setLinkedDevices] = useState([]);
  const [notes, setNotes] = useState([]);
  const [adminDbData, setAdminDbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  // Language state
  const [lang, setLang] = useState(() => localStorage.getItem("app_lang") || "he");
  const t = translations[lang];

  // Admin view toggle
  const [adminViewMode, setAdminViewMode] = useState("admin");

  const isActualAdmin = currentUser.email.toLowerCase() === "mayda2604@gmail.com" || currentUser.role === "admin";
  const showAdminControls = isActualAdmin && adminViewMode === "admin";

  // Form states
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newTotalPages, setNewTotalPages] = useState("");
  const [newPrice, setNewPrice] = useState("₪49");
  const [newCover, setNewCover] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [noteBookId, setNoteBookId] = useState("");
  const [newQuote, setNewQuote] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [newNotePage, setNewNotePage] = useState("1");
  const [noteSaving, setNoteSaving] = useState(false);

  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [deviceLoading, setDeviceLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("app_lang", lang);
  }, [lang]);

  // Load books, catalog, notes
  async function loadData(showNotification = false) {
    try {
      if (showNotification) setLoading(true);
      const [booksData, catalogData, devicesData, notesData] = await Promise.all([
        getUserBooks(currentUser.uid),
        getCatalog(),
        getUserDevices(currentUser.uid),
        getUserNotes(currentUser.uid)
      ]);
      setBooks(booksData);
      setCatalog(catalogData);
      setLinkedDevices(devicesData);
      setNotes(notesData);
      if (booksData.length > 0) setNoteBookId(booksData[0].bookId);

      if (isActualAdmin) {
        const dbData = await getAdminDatabase(currentUser.email);
        setAdminDbData(dbData);
      }

      if (showNotification) {
        showToast(lang === "he" ? "הנתונים עודכנו בהצלחה" : "Refreshed successfully", "success");
      }
    } catch (err) {
      showToast(lang === "he" ? "שגיאה בטעינת הנתונים מהשרת" : "Error loading data", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(false);
  }, [currentUser, refreshTrigger]);

  function toggleAdminViewMode() {
    if (adminViewMode === "admin") {
      setAdminViewMode("user");
      if (activeTab === "admin_db") setActiveTab("library");
      showToast(lang === "he" ? "עברת לתצוגת משתמשת רגילה" : "Switched to regular user view", "info");
    } else {
      setAdminViewMode("admin");
      showToast(lang === "he" ? "חזרת לתצוגת מנהלת" : "Returned to Admin view", "info");
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      showToast(lang === "he" ? "התנתקות נכשלה" : "Logout failed", "error");
    }
  }

  async function handleAddCatalogBook(e) {
    e.preventDefault();
    if (!newTitle || !newAuthor || !newTotalPages) return;

    try {
      setAddLoading(true);
      const added = await addCatalogBook(currentUser.email, {
        title: newTitle,
        author: newAuthor,
        totalPages: parseInt(newTotalPages),
        price: newPrice,
        cover: newCover,
        description: newDescription
      });
      setCatalog(prev => [...prev, added]);
      showToast(lang === "he" ? `הספר "${newTitle}" נוסף לקטלוג!` : `Book "${newTitle}" added!`, "success");
      setShowAdminForm(false);
      setNewTitle("");
      setNewAuthor("");
      setNewTotalPages("");
      setNewCover("");
      setNewDescription("");
      loadData(false);
    } catch (err) {
      showToast(err.message || "Error adding book", "error");
    } finally {
      setAddLoading(false);
    }
  }

  async function handlePurchaseBook(bookId, bookTitle) {
    try {
      const added = await purchaseBook(currentUser.uid, bookId);
      setBooks(prev => [...prev, added]);
      showToast(lang === "he" ? `תתחדשי! הספר "${bookTitle}" נוסף לספרייה שלך` : `"${bookTitle}" added to library`, "success");
      setActiveTab("library");
      loadData(false);
    } catch (err) {
      showToast(err.message || "Error purchasing book", "warning");
    }
  }

  async function handleAddNoteFromJournal(e) {
    e.preventDefault();
    if (!newQuote.trim() && !newNoteText.trim()) return;

    const targetBook = books.find(b => b.bookId === noteBookId) || { title: "ספר" };

    try {
      setNoteSaving(true);
      const added = await addNote(currentUser.uid, {
        bookId: noteBookId || (books[0] ? books[0].bookId : "BOOK_01"),
        bookTitle: targetBook.title,
        page: newNotePage,
        quote: newQuote,
        note: newNoteText
      });
      setNotes(prev => [added, ...prev]);
      setNewQuote("");
      setNewNoteText("");
      setShowNoteForm(false);
      showToast(lang === "he" ? "ההערה נשמרה במחברת שלך!" : "Note saved to your journal!", "success");
    } catch (err) {
      showToast(err.message || "Error saving note", "error");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleDeleteNote(noteId) {
    try {
      await deleteNote(currentUser.uid, noteId);
      setNotes(prev => prev.filter(n => n.noteId !== noteId));
      showToast(lang === "he" ? "ההערה נמחקה" : "Note deleted", "info");
    } catch (err) {
      showToast("Error deleting note", "error");
    }
  }

  async function handleLinkDevice(e) {
    e.preventDefault();
    if (!deviceIdInput.trim()) return;

    try {
      setDeviceLoading(true);
      const res = await linkBookmarkDevice(currentUser.uid, deviceIdInput);
      setLinkedDevices(prev => [...new Set([...prev, res.deviceId])]);
      showToast(lang === "he" ? `הסימנייה (${res.deviceId}) קושרה בהצלחה!` : `Bookmark (${res.deviceId}) linked!`, "success");
      setDeviceIdInput("");
      setShowDeviceModal(false);
      loadData(false);
    } catch (err) {
      showToast(err.message || "Error linking device", "error");
    } finally {
      setDeviceLoading(false);
    }
  }

  function getUserEmailByUid(uid) {
    if (!adminDbData || !adminDbData.users) return uid;
    const u = adminDbData.users.find(user => user.uid === uid);
    return u ? u.email : uid;
  }

  return (
    <div className="library-container">
      {/* Header */}
      <div className="main-header" style={{ marginTop: 0 }}>
        <div className="logo-area">
          <span className="icon">📖</span>
          <h1>{t.appName}</h1>
        </div>
        
        <div className="connection-panel">
          <div className="lang-switcher-segmented">
            <button onClick={() => setLang("he")} className={`lang-btn ${lang === "he" ? "active" : ""}`}>עברית</button>
            <button onClick={() => setLang("en")} className={`lang-btn ${lang === "en" ? "active" : ""}`}>EN</button>
          </div>

          <button onClick={() => setShowDeviceModal(true)} className="btn btn-secondary">
            <span>🔌</span>
            {t.connectBookmark}
          </button>

          <button onClick={() => loadData(true)} className="btn btn-primary" id="btn-sync">
            <span className="btn-icon">🔄</span>
            {t.refreshLibrary}
          </button>
        </div>
      </div>

      {/* User Info Bar */}
      <div className="user-profile-bar">
        <div className="user-info-text">
          <span>{t.hello}, <strong>{currentUser.email}</strong></span>
          {isActualAdmin && (
            <span className={`badge ${showAdminControls ? 'badge-admin' : ''}`}>
              {showAdminControls ? t.adminRole : (lang === "he" ? "👁️ תצוגת קוראת" : "👁️ Reader View")}
            </span>
          )}
          {linkedDevices.length > 0 && (
            <span className="badge badge-linked">
              {t.linkedBookmark}: {linkedDevices.join(", ")}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isActualAdmin && (
            <button onClick={toggleAdminViewMode} className="btn btn-secondary btn-small">
              {adminViewMode === "admin" ? t.viewAsUser : t.viewAsAdmin}
            </button>
          )}

          <button onClick={handleLogout} className="btn btn-secondary btn-small">{t.logout}</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-nav">
        <button 
          onClick={() => setActiveTab("library")} 
          className={`tab-btn ${activeTab === "library" ? "active" : ""}`}
        >
          📚 {t.myLibrary} ({books.length})
        </button>
        <button 
          onClick={() => setActiveTab("store")} 
          className={`tab-btn ${activeTab === "store" ? "active" : ""}`}
        >
          🛒 {t.bookstore} ({catalog.length})
        </button>
        <button 
          onClick={() => setActiveTab("journal")} 
          className={`tab-btn ${activeTab === "journal" ? "active" : ""}`}
        >
          {t.myJournal} ({notes.length})
        </button>
        {showAdminControls && (
          <button 
            onClick={() => setActiveTab("admin_db")} 
            className={`tab-btn ${activeTab === "admin_db" ? "active" : ""}`}
          >
            🗄️ {t.adminDb}
          </button>
        )}
      </div>

      {/* Device Modal */}
      {showDeviceModal && (
        <div className="add-book-form">
          <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: '0.5rem' }}>{t.linkDeviceModalTitle}</h3>
          <p className="section-desc" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>{t.linkDeviceDesc}</p>
          <form onSubmit={handleLinkDevice} className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>{t.deviceId}</label>
              <input type="text" value={deviceIdInput} onChange={(e) => setDeviceIdInput(e.target.value)} required placeholder="BOOKMARK_01 / AA:BB:CC:11:22:33" />
            </div>
            <div className="form-group" style={{ flex: 1, justifyContent: 'flex-end' }}>
              <button disabled={deviceLoading} type="submit" className="btn btn-primary" style={{ marginTop: '1.4rem' }}>
                {deviceLoading ? "..." : t.linkBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Add Book */}
      {showAdminControls && activeTab === "store" && (
        <div style={{ marginBottom: "1.75rem" }}>
          <button onClick={() => setShowAdminForm(!showAdminForm)} className="btn btn-secondary" style={{ width: "100%", marginBottom: "1rem" }}>
            {showAdminForm ? t.closeForm : t.adminAddBookBtn}
          </button>

          {showAdminForm && (
            <form onSubmit={handleAddCatalogBook} className="add-book-form">
              <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>{t.addBookTitle}</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>{t.bookTitle}</label>
                  <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>{t.author}</label>
                  <input type="text" value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>{t.totalPages}</label>
                  <input type="number" min="1" value={newTotalPages} onChange={(e) => setNewTotalPages(e.target.value)} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t.price}</label>
                  <input type="text" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="₪49" />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>{t.coverUrl}</label>
                  <input type="text" value={newCover} onChange={(e) => setNewCover(e.target.value)} placeholder="/assets/time_odyssey.jpg" />
                </div>
              </div>
              <button disabled={addLoading} type="submit" className="btn btn-primary">
                {addLoading ? "..." : t.publishInStore}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Main Views */}
      {activeTab === "library" ? (
        <section className="section library-section">
          <div className="section-header">
            <h2>{t.myLibrary}</h2>
            <p className="section-desc">{t.myLibraryDesc}</p>
          </div>

          {loading ? (
            <div className="loading-spinner">... ⏳</div>
          ) : books.length === 0 ? (
            <div className="empty-library-state">
              <p>{t.emptyLibrary}</p>
              <button onClick={() => setActiveTab("store")} className="btn btn-primary" style={{ marginTop: "1rem" }}>
                {t.goToStore}
              </button>
            </div>
          ) : (
            <div className="books-grid">
              {books.map(book => {
                const current = book.currentPage || 1;
                const total = book.totalPages;
                const pct = Math.round((current / total) * 100);

                return (
                  <div key={book.bookId} className="book-card" onClick={() => onOpenBook(book.bookId, current)}>
                    <div className="cover-wrapper">
                      <img src={book.cover} alt="Book Cover" className="book-cover" onError={(e) => {
                        e.target.src = "/assets/placeholder_cover.png";
                      }} />
                      <div className="card-overlay">
                        <button className="btn btn-light btn-read">{t.continueReading}</button>
                      </div>
                    </div>
                    <div className="book-info">
                      <h3 className="book-title">{book.title}</h3>
                      <p className="book-author">{book.author}</p>
                      <div className="progress-container">
                        <div className="progress-bar-wrapper">
                          <div className="progress-bar" style={{ width: `${pct}%` }}></div>
                        </div>
                        <span className="progress-text">
                          {t.pageOf.replace("{current}", current).replace("{total}", total)} ({pct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : activeTab === "store" ? (
        <section className="section library-section">
          <div className="section-header">
            <h2>{t.storeTitle}</h2>
            <p className="section-desc">{t.storeDesc}</p>
          </div>

          {loading ? (
            <div className="loading-spinner">... ⏳</div>
          ) : (
            <div className="books-grid">
              {catalog.map(book => {
                const isOwned = books.some(b => b.bookId === book.bookId);

                return (
                  <div key={book.bookId} className="book-card" style={{ cursor: 'default' }}>
                    <div className="cover-wrapper">
                      <img src={book.cover} alt="Book Cover" className="book-cover" onError={(e) => {
                        e.target.src = "/assets/placeholder_cover.png";
                      }} />
                    </div>
                    <div className="book-info">
                      <h3 className="book-title">{book.title}</h3>
                      <p className="book-author">{book.author}</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0' }}>{book.description}</p>
                      
                      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
                        <span style={{ fontWeight: '700', color: 'var(--primary-slate)', fontSize: '1.05rem' }}>{book.price || "₪49"}</span>
                        {isOwned ? (
                          <span className="badge badge-linked">{t.alreadyOwned}</span>
                        ) : (
                          <button onClick={() => handlePurchaseBook(book.bookId, book.title)} className="btn btn-primary btn-small">
                            {t.buyBook}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : activeTab === "journal" ? (
        /* MY READING JOURNAL TAB */
        <section className="section library-section">
          <div className="section-header-flex">
            <div className="section-header" style={{ marginBottom: 0 }}>
              <h2>{t.notesTitle}</h2>
              <p className="section-desc">{t.notesDesc}</p>
            </div>
            <button onClick={() => setShowNoteForm(!showNoteForm)} className="btn btn-primary">
              {showNoteForm ? t.closeForm : t.addNoteBtn}
            </button>
          </div>

          {/* Add Note Form */}
          {showNoteForm && (
            <form onSubmit={handleAddNoteFromJournal} className="add-book-form" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>{t.addNoteBtn}</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>ספר</label>
                  <select 
                    value={noteBookId} 
                    onChange={(e) => setNoteBookId(e.target.value)}
                    style={{
                      background: "#fdfdfc",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      padding: "0.75rem",
                      fontFamily: "var(--font-sans)",
                      fontSize: "0.95rem"
                    }}
                  >
                    {books.map(b => (
                      <option key={b.bookId} value={b.bookId}>{b.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ maxWidth: '120px' }}>
                  <label>{t.pageLabel}</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={newNotePage} 
                    onChange={(e) => setNewNotePage(e.target.value)} 
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>💬 {t.quoteInput}</label>
                <input type="text" value={newQuote} onChange={(e) => setNewQuote(e.target.value)} placeholder='לדוגמה: "הזמן איננו קו ישר..."' />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>💡 {t.noteInput}</label>
                <textarea 
                  value={newNoteText} 
                  onChange={(e) => setNewNoteText(e.target.value)} 
                  rows="3"
                  style={{
                    background: "#fdfdfc",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "0.75rem",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.95rem"
                  }}
                  placeholder="לדוגמה: מחשבה אישית שלמדתי מהעמוד..."
                />
              </div>
              <button disabled={noteSaving} type="submit" className="btn btn-primary">
                {noteSaving ? "..." : t.saveNoteBtn}
              </button>
            </form>
          )}

          {/* Notes Cards Grid */}
          {notes.length === 0 ? (
            <div className="empty-library-state" style={{ marginTop: '1.5rem' }}>
              <p>{t.emptyNotes}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
              {notes.map(n => (
                <div 
                  key={n.noteId} 
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '14px',
                    padding: '1.35rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--primary-slate)' }}>
                        {n.bookTitle}
                      </span>
                      <span className="badge badge-admin">
                        {t.pageTag} {n.page}
                      </span>
                    </div>

                    {n.quote && (
                      <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--primary-slate)', fontSize: '1.05rem', marginBottom: '0.6rem', lineHeight: '1.5' }}>
                        “{n.quote}”
                      </p>
                    )}

                    {n.note && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                        💡 {n.note}
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                    <NoteMenu
                      onGoToPage={() => {
                        onOpenBook(n.bookId, n.page);
                      }}
                      onDelete={() => handleDeleteNote(n.noteId)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* ADMIN DATABASE VIEWER TAB */
        <section className="section library-section">
          <div className="section-header">
            <h2>{t.adminDbTitle}</h2>
            <p className="section-desc">{t.adminDbDesc}</p>
          </div>

          {!adminDbData ? (
            <div className="loading-spinner">... ⏳</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div className="add-book-form">
                <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: '1rem', color: 'var(--primary-slate)' }}>{t.registeredUsers} ({adminDbData.users.length})</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: lang === 'he' ? 'right' : 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.65rem' }}>{t.email}</th>
                      <th style={{ padding: '0.65rem' }}>{t.userUid}</th>
                      <th style={{ padding: '0.65rem' }}>{t.role}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminDbData.users.map(u => (
                      <tr key={u.uid} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.65rem', fontWeight: '600' }}>{u.email}</td>
                        <td style={{ padding: '0.65rem', fontFamily: 'monospace' }}>{u.uid}</td>
                        <td style={{ padding: '0.65rem' }}>
                          <span className={`badge ${u.role === 'admin' ? 'badge-admin' : ''}`}>
                            {u.role === 'admin' ? t.adminRole : '👤 Reader'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
