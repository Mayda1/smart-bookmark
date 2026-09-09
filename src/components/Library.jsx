import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getUserBooks,
  getCatalog,
  addCatalogBook,
  purchaseBook,
  linkBookmarkDevice,
  getUserDevices,
  deleteCatalogBook,
  removeFromLibrary
} from "../dbHelper";
import { translations } from "../translations";
import { useNavigate } from "react-router-dom";

export default function Library({ onOpenBook, showToast, refreshTrigger }) {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("library"); // 'library' or 'store'
  const [books, setBooks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [linkedDevices, setLinkedDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, confirmLabel, danger?, onConfirm }
  const [storeSubTab, setStoreSubTab] = useState("recommendations"); // 'recommendations' or 'browse'

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
  const [newBookPages, setNewBookPages] = useState([]);
  const [addLoading, setAddLoading] = useState(false);

  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [deviceLoading, setDeviceLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("app_lang", lang);
  }, [lang]);

  // Load books, catalog, devices
  async function loadData(showNotification = false) {
    try {
      if (showNotification) setLoading(true);
      const tag = (label, p) => p.catch(e => { e.message = `[${label}] ${e.message}`; throw e; });
      const [booksData, catalogData, devicesData] = await Promise.all([
        tag("getUserBooks", getUserBooks(currentUser.uid)),
        tag("getCatalog", getCatalog()),
        tag("getUserDevices", getUserDevices(currentUser.uid))
      ]);
      setBooks(booksData);
      setCatalog(catalogData);
      setLinkedDevices(devicesData);

      // Raw database inspection (users/devices/nfcTags/etc) now happens
      // directly in the Firebase Console -- that's the real, reliable admin
      // view of Firestore, with none of the client-side security-rule edge
      // cases (e.g. collectionGroup queries) a custom in-app viewer runs into.

      if (showNotification) {
        showToast(lang === "he" ? "הנתונים עודכנו בהצלחה" : "Refreshed successfully", "success");
      }
    } catch (err) {
      console.error("Library loadData failed:", err);
      showToast(
        (lang === "he" ? "שגיאה בטעינת הנתונים מהשרת: " : "Error loading data: ") + (err.message || err.code || "Unknown error"),
        "error"
      );
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

  function handleBookFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        if (json.title) setNewTitle(json.title);
        if (json.author) setNewAuthor(json.author);
        if (json.price) setNewPrice(json.price);
        if (json.description) setNewDescription(json.description);
        if (json.cover) setNewCover(json.cover);
        if (Array.isArray(json.pages)) {
          setNewBookPages(json.pages);
          setNewTotalPages(String(json.pages.length));
        }
        const pageCountMsg = json.pages ? `${json.pages.length} עמודים` : "";
        showToast(lang === "he" ? `קובץ הספר "${json.title || file.name}" נטען בהצלחה! ${pageCountMsg}` : "Book file loaded successfully!", "success");
      } catch (err) {
        showToast(lang === "he" ? "קובץ הספר אינו בפורמט JSON תקין" : "Invalid book JSON file format", "error");
      }
    };
    reader.readAsText(file);
  }

  function handleRemoveFromLibrary(bookId, title) {
    setConfirmDialog({
      message: lang === "he" ? `להסיר את "${title}" מהספרייה שלך?` : `Remove "${title}" from your library?`,
      confirmLabel: lang === "he" ? "הסרה" : "Remove",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await removeFromLibrary(currentUser.uid, bookId);
          setBooks(prev => prev.filter(b => b.bookId !== bookId));
          showToast(lang === "he" ? "הספר הוסר מהספרייה שלך" : "Removed from your library", "success");
        } catch (err) {
          console.error("removeFromLibrary failed:", err);
          showToast(err.message || "Error removing book", "error");
        }
      }
    });
  }

  function handleDeleteCatalogBook(bookId, title) {
    setConfirmDialog({
      message: lang === "he" ? `למחוק את "${title}" מהקטלוג? הפעולה לא הפיכה.` : `Delete "${title}" from the catalog? This can't be undone.`,
      confirmLabel: lang === "he" ? "מחיקה" : "Delete",
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await deleteCatalogBook(currentUser.email, bookId);
          setCatalog(prev => prev.filter(b => b.bookId !== bookId));
          showToast(lang === "he" ? `הספר "${title}" נמחק מהקטלוג` : `"${title}" deleted from catalog`, "success");
        } catch (err) {
          console.error("deleteCatalogBook failed:", err);
          showToast((lang === "he" ? "שגיאה במחיקת הספר: " : "Error deleting book: ") + (err.message || err.code || "Unknown error"), "error");
        }
      }
    });
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
        description: newDescription,
        pages: newBookPages
      });
      setCatalog(prev => [...prev, added]);
      showToast(lang === "he" ? `הספר "${newTitle}" נוסף לקטלוג!` : `Book "${newTitle}" added!`, "success");
      setShowAdminForm(false);
      setNewTitle("");
      setNewAuthor("");
      setNewTotalPages("");
      setNewCover("");
      setNewDescription("");
      setNewBookPages([]);
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

  return (
    <div className="library-container">
      {/* Confirm dialog (replaces window.confirm — browsers silently swallow
          native confirm()/alert() calls after the user has dismissed several
          of them, which made the delete/remove buttons look like they were
          doing nothing) */}
      {confirmDialog && (
        <div
          onClick={() => setConfirmDialog(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card, #fff)', borderRadius: '12px', padding: '1.5rem',
              maxWidth: '380px', width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.25)'
            }}
          >
            <p style={{ margin: '0 0 1.25rem', fontSize: '1rem', lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDialog(null)} className="btn btn-small">
                {lang === "he" ? "ביטול" : "Cancel"}
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="btn btn-small"
                style={confirmDialog.danger
                  ? { background: '#b3452c', color: '#fff', border: '1px solid #b3452c' }
                  : { background: 'var(--primary-slate)', color: '#fff' }}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

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
      </div>

      {/* Device Modal */}
      {showDeviceModal && (
        <div className="add-book-form">
          <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: '0.5rem' }}>{t.linkDeviceModalTitle}</h3>
          <p className="section-desc" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            {lang === "he"
              ? "מספר הזיהוי מופיע על המסך הקטן של הסימנייה עצמה (למשל BOOKIFY-1A2B)."
              : t.linkDeviceDesc}
          </p>
          <form onSubmit={handleLinkDevice} className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>{t.deviceId}</label>
              <input type="text" value={deviceIdInput} onChange={(e) => setDeviceIdInput(e.target.value)} required placeholder="BOOKIFY-1A2B" />
            </div>
            <div className="form-group" style={{ flex: 1, justifyContent: 'flex-end' }}>
              <button disabled={deviceLoading} type="submit" className="btn btn-primary" style={{ marginTop: '1.4rem' }}>
                {deviceLoading ? "..." : t.linkBtn}
              </button>
            </div>
          </form>

          <hr style={{ margin: '1.25rem 0', border: 'none', borderTop: '1px solid var(--card-border, #e5e0d8)' }} />

          <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: '0.5rem' }}>
            {lang === "he" ? "חיבור הסימנייה לרשת WiFi" : "Connect the bookmark to WiFi"}
          </h3>
          <p className="section-desc" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            {lang === "he"
              ? "צעד חד-פעמי, ישירות מהסימנייה עצמה (בלי צורך בדפדפן שתומך ב-Bluetooth):"
              : "A one-time step, done directly on the bookmark itself (no Bluetooth-capable browser needed):"}
          </p>
          <ol style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', paddingInlineStart: '1.25rem', margin: 0, lineHeight: 1.7 }}>
            <li>{lang === "he" ? "כשלסימנייה אין עדיין רשת שמורה, המסך שלה יראה \"Setup WiFi\" ושם רשת כמו Bookify-Setup-XXXX." : 'When the bookmark has no saved network yet, its screen shows "Setup WiFi" and a network name like Bookify-Setup-XXXX.'}</li>
            <li>{lang === "he" ? "מתחברים עם הטלפון או המחשב לרשת הזו (בדיוק כמו כל רשת WiFi רגילה)." : "Connect your phone or computer to that network (just like any regular WiFi network)."}</li>
            <li>{lang === "he" ? "בדרך כלל ייפתח אוטומטית דף הגדרה קטן; אם לא, פותחים דפדפן וגולשים לכתובת 192.168.4.1." : "A small setup page usually opens automatically; if not, open a browser and go to 192.168.4.1."}</li>
            <li>{lang === "he" ? "מזינים שם וסיסמה של רשת ה-WiFi הביתית, ושולחים. הסימנייה תתחבר ותזכור את הרשת גם אחרי כיבוי/הפעלה." : "Enter your home WiFi's name and password and submit. The bookmark will connect and remember that network from then on."}</li>
          </ol>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
            {lang === "he" ? "רוצים לחבר אותה לרשת אחרת בעתיד? מחזיקים את אזור האמצע של הסימנייה (זה של השמירה) בזמן חיבור הכבל, וזה יפתח מחדש את מסך ההגדרה." : "Need to move it to a different network later? Hold down the middle of the softpot (the save zone) while plugging it in, and the setup screen reopens."}</p>
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
              <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: '0.5rem' }}>{t.addBookTitle}</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                ניתן למלא את הפרטים ידנית או להעלות קובץ ספר דיגיטלי מוכן בפורמט JSON.
              </p>

              {/* Digital Book JSON File Uploader */}
              <div style={{
                background: 'linear-gradient(135deg, #fdf8ef, #f6edd8)',
                border: '2px dashed var(--border-strong)',
                borderRadius: '12px',
                padding: '1.15rem',
                textAlign: 'center',
                marginBottom: '1.25rem'
              }}>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>📄</div>
                  <div style={{ fontWeight: '700', color: 'var(--primary-slate)', fontSize: '0.95rem' }}>
                    לחצי כאן להעלאת קובץ ספר דיגיטלי (.book.json / .json)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    הקובץ יטען אוטומטית את שם הספר, המחבר, מספר העמודים וכל טקסט העמודים לקורא!
                  </div>
                  <input
                    type="file"
                    accept=".json,.book.json"
                    onChange={handleBookFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {newBookPages.length > 0 && (
                  <div style={{
                    marginTop: '0.75rem',
                    background: '#e8f5e9',
                    color: '#2e7d32',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    display: 'inline-block'
                  }}>
                    ✓ נטענו בהצלחה {newBookPages.length} עמודים דיגיטליים מלאים!
                  </div>
                )}
              </div>

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
                if (book.catalogMissing) {
                  return (
                    <div key={book.bookId} className="book-card" style={{ cursor: 'default', opacity: 0.75 }}>
                      <div className="cover-wrapper">
                        <img src="/assets/placeholder_cover.png" alt="Book Cover" className="book-cover" />
                      </div>
                      <div className="book-info">
                        <h3 className="book-title">{book.title}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0' }}>
                          {lang === "he" ? "הספר הוסר מהקטלוג ואינו זמין עוד לקריאה." : "This book was removed from the catalog and is no longer available."}
                        </p>
                        <button
                          onClick={() => handleRemoveFromLibrary(book.bookId, book.title)}
                          className="btn btn-small"
                          style={{ width: '100%', color: '#b3452c', border: '1px solid #e3c9c0', background: 'transparent' }}
                        >
                          {lang === "he" ? "הסרה מהספרייה שלי" : "Remove from my library"}
                        </button>
                      </div>
                    </div>
                  );
                }

                // Two independent page-numbering systems exist for the same
                // book (see the comment on getBookTotalPrintedPages in
                // dbHelper.js): the raw sequence position in the uploaded
                // pages (currentPage/totalPages), and the number actually
                // PRINTED on the physical page (lastPrintedPage/
                // totalPrintedPages) -- which is what the Reader page and the
                // physical bookmark's own screen both display. Showing the
                // library card's progress in the sequence system while the
                // reader shows the printed system (e.g. "2 of 210" here vs
                // "5 of 216" in the book) looked like a sync bug even though
                // both numbers were individually correct -- so this now shows
                // the same printed-page numbers everywhere, falling back to
                // the sequence numbers only for books that don't have
                // printed-page metadata at all.
                const sequenceCurrent = book.currentPage || 1;
                const current = book.lastPrintedPage || sequenceCurrent;
                const total = book.totalPrintedPages || book.totalPages;
                const pct = Math.round((current / total) * 100);

                return (
                  <div key={book.bookId} className="book-card" onClick={() => onOpenBook(book.bookId, sequenceCurrent)}>
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

          {/* Store Sub-Tabs */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            background: 'var(--surface-card)',
            borderRadius: '12px',
            padding: '5px',
            border: '1px solid var(--border-subtle)'
          }}>
            <button
              onClick={() => setStoreSubTab("recommendations")}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                border: 'none',
                borderRadius: '9px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600',
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.2s ease',
                background: storeSubTab === "recommendations"
                  ? 'linear-gradient(135deg, #f8e8c8, #f0d8a8)'
                  : 'transparent',
                color: storeSubTab === "recommendations"
                  ? 'var(--primary-slate)'
                  : 'var(--text-secondary)',
                boxShadow: storeSubTab === "recommendations"
                  ? '0 2px 8px rgba(0,0,0,0.08)'
                  : 'none'
              }}
            >
              {t.storeSubTabRecommendations}
            </button>
            <button
              onClick={() => setStoreSubTab("browse")}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                border: 'none',
                borderRadius: '9px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600',
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.2s ease',
                background: storeSubTab === "browse"
                  ? 'linear-gradient(135deg, #f8e8c8, #f0d8a8)'
                  : 'transparent',
                color: storeSubTab === "browse"
                  ? 'var(--primary-slate)'
                  : 'var(--text-secondary)',
                boxShadow: storeSubTab === "browse"
                  ? '0 2px 8px rgba(0,0,0,0.08)'
                  : 'none'
              }}
            >
              {t.storeSubTabBrowse}
            </button>
          </div>

          {loading ? (
            <div className="loading-spinner">... ⏳</div>
          ) : storeSubTab === "recommendations" ? (
            /* PERSONALIZED RECOMMENDATIONS SUB-TAB */
            (() => {
              // Demo AI recommendations engine
              const demoRecommendations = [
                {
                  id: "rec_1",
                  title: "מסע אל תוך הדממה",
                  author: "נועה שלום",
                  cover: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&h=450&fit=crop",
                  price: "₪42",
                  description: "מסע פנימי של גילוי עצמי דרך מדיטציה, שקט ושהייה בטבע.",
                  matchScore: 94,
                  reason: lang === "he"
                    ? "מבוסס על הספרים שקראת על זמן, מרחב ותודעה — ספר זה מרחיב את העולמות הפילוסופיים שמשכו אותך."
                    : "Based on the books you've read about time, space, and consciousness — this book deepens the philosophical themes you enjoy."
                },
                {
                  id: "rec_2",
                  title: "גשר מעל ערפל",
                  author: "דניאל ברקוביץ׳",
                  cover: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=300&h=450&fit=crop",
                  price: "₪55",
                  description: "רומן מתח פילוסופי על פרופסור שמגלה כתב יד עתיק שמאתגר את תפיסת המציאות.",
                  matchScore: 89,
                  reason: lang === "he"
                    ? "סגנון הכתיבה דומה לספרים שאהבת, עם שילוב של עלילה מרתקת ושאלות פילוסופיות עמוקות."
                    : "Similar writing style to books you loved, combining compelling plot with deep philosophical questions."
                },
                {
                  id: "rec_3",
                  title: "אור בין השורות",
                  author: "מיכל אורן",
                  cover: "https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=300&h=450&fit=crop",
                  price: "₪38",
                  description: "אוסף סיפורים קצרים על רגעי הארה קטנים שמשנים את מהלך החיים.",
                  matchScore: 85,
                  reason: lang === "he"
                    ? "קוראים שאהבו את הספרים בספרייה שלך נהנו במיוחד מהאוסף הזה — 87% מהם דירגו אותו 5 כוכבים."
                    : "Readers who enjoyed books in your library especially loved this collection — 87% rated it 5 stars."
                },
                {
                  id: "rec_4",
                  title: "הנוסע האחרון",
                  author: "יונתן גלעד",
                  cover: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=300&h=450&fit=crop",
                  price: "₪49",
                  description: "סיפור מופלא על מסע בזמן, אהבה ובחירות שמעצבות גורלות.",
                  matchScore: 82,
                  reason: lang === "he"
                    ? "בהתבסס על העניין שלך בנושאי זמן ומרחב — הספר הזה לוקח את המוטיבים האלה לסיפור הרפתקאות סוחף."
                    : "Based on your interest in time and space themes — this book turns these motifs into a thrilling adventure story."
                },
                {
                  id: "rec_5",
                  title: "צלילים של שקיעה",
                  author: "רותם כהן-צדק",
                  cover: "https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=300&h=450&fit=crop",
                  price: "₪44",
                  description: "שירה ופרוזה על חיבור לטבע, מוזיקה ורגעי שלווה בעולם סוער.",
                  matchScore: 78,
                  reason: lang === "he"
                    ? "הספרים שקראת מגלים רגישות לשפה יפה ולתיאורי טבע — הספר הזה ידבר אל הלב שלך."
                    : "The books in your library reveal a sensitivity to beautiful language and nature descriptions — this book will speak to your heart."
                }
              ];

              const hasBooks = books.length > 0;

              return (
                <div>
                  {/* Recommendations Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.25rem'
                  }}>
                    <h3 style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '1.2rem',
                      color: 'var(--primary-slate)',
                      margin: 0
                    }}>
                      {t.recsTitle}
                    </h3>
                    <span style={{
                      fontSize: '0.8rem',
                      color: 'var(--accent-sand)',
                      fontWeight: '600',
                      background: 'linear-gradient(135deg, #fdf6e8, #f8e8c8)',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      border: '1px solid rgba(210,180,130,0.3)'
                    }}>
                      {t.recsPoweredBy}
                    </span>
                  </div>

                  {!hasBooks ? (
                    <div className="empty-library-state" style={{ marginTop: '1.5rem' }}>
                      <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📚</p>
                      <p>{t.recsEmpty}</p>
                      <button onClick={() => setStoreSubTab("browse")} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                        {t.storeSubTabBrowse}
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
                      gap: '1.25rem'
                    }}>
                      {demoRecommendations.map(rec => {
                        const isOwned = books.some(b => b.title === rec.title);

                        return (
                          <div
                            key={rec.id}
                            style={{
                              background: 'var(--surface-card)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '16px',
                              overflow: 'hidden',
                              boxShadow: 'var(--shadow-sm)',
                              display: 'flex',
                              flexDirection: 'column',
                              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'translateY(-3px)';
                              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                            }}
                          >
                            {/* Cover */}
                            <div style={{ position: 'relative', height: '180px', overflow: 'hidden' }}>
                              <img
                                src={rec.cover}
                                alt={rec.title}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  filter: 'brightness(0.92)'
                                }}
                                onError={(e) => { e.target.src = "/assets/placeholder_cover.png"; }}
                              />
                              {/* Match Score Badge */}
                              <div style={{
                                position: 'absolute',
                                top: '10px',
                                left: '10px',
                                background: 'rgba(255,255,255,0.92)',
                                backdropFilter: 'blur(6px)',
                                borderRadius: '10px',
                                padding: '4px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                              }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b8860b' }}>
                                  {t.recsMatchScore}
                                </span>
                                <span style={{
                                  fontSize: '0.85rem',
                                  fontWeight: '800',
                                  color: rec.matchScore >= 90 ? '#2e7d32' : rec.matchScore >= 80 ? '#b8860b' : '#666'
                                }}>
                                  {rec.matchScore}%
                                </span>
                              </div>
                            </div>

                            {/* Info */}
                            <div style={{ padding: '1rem 1.15rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <h4 style={{
                                fontFamily: 'var(--font-serif)',
                                fontSize: '1.05rem',
                                color: 'var(--primary-slate)',
                                margin: '0 0 0.2rem'
                              }}>
                                {rec.title}
                              </h4>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
                                {rec.author}
                              </p>
                              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem', lineHeight: '1.5' }}>
                                {rec.description}
                              </p>

                              {/* AI Reason */}
                              <div style={{
                                background: 'linear-gradient(135deg, #fdf8ef, #f6edd8)',
                                border: '1px solid rgba(210,180,130,0.25)',
                                borderRadius: '10px',
                                padding: '0.65rem 0.85rem',
                                marginBottom: '0.75rem'
                              }}>
                                <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#b8860b', margin: '0 0 0.3rem', letterSpacing: '0.3px' }}>
                                  🤖 {t.recsWhyLabel}
                                </p>
                                <p style={{ fontSize: '0.8rem', color: 'var(--primary-slate)', margin: 0, lineHeight: '1.55', fontStyle: 'italic' }}>
                                  {rec.reason}
                                </p>
                              </div>

                              {/* Price & Action */}
                              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem' }}>
                                <span style={{ fontWeight: '700', color: 'var(--primary-slate)', fontSize: '1.05rem' }}>{rec.price}</span>
                                {isOwned ? (
                                  <span className="badge badge-linked">{t.alreadyOwned}</span>
                                ) : (
                                  <button className="btn btn-primary btn-small">
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
                </div>
              );
            })()
          ) : (
            /* BROWSE ALL CATALOG SUB-TAB */
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
                      {showAdminControls && (
                        <button
                          onClick={() => handleDeleteCatalogBook(book.bookId, book.title)}
                          className="btn btn-small"
                          style={{ marginTop: '0.5rem', width: '100%', color: '#b3452c', border: '1px solid #e3c9c0', background: 'transparent' }}
                        >
                          {lang === "he" ? "מחיקה מהקטלוג" : "Delete from catalog"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
