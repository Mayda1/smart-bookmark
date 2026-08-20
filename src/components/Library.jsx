import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { 
  getUserBooks, 
  getCatalog, 
  addCatalogBook, 
  purchaseBook, 
  linkBookmarkDevice, 
  getUserDevices,
  getAdminDatabase
} from "../dbHelper";
import { translations } from "../translations";
import { useNavigate } from "react-router-dom";

export default function Library({ onOpenBook, showToast }) {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("library"); // 'library', 'store', or 'admin_db'
  const [books, setBooks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [linkedDevices, setLinkedDevices] = useState([]);
  const [adminDbData, setAdminDbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);

  // Language state: 'he' or 'en'
  const [lang, setLang] = useState(() => localStorage.getItem("app_lang") || "he");
  const t = translations[lang];

  // Admin view toggle: 'admin' or 'user' (allows admin to preview site as regular user)
  const [adminViewMode, setAdminViewMode] = useState("admin");

  const isActualAdmin = currentUser.email.toLowerCase() === "mayda2604@gmail.com" || currentUser.role === "admin";
  const showAdminControls = isActualAdmin && adminViewMode === "admin";

  // Admin Add Book Form state
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newTotalPages, setNewTotalPages] = useState("");
  const [newPrice, setNewPrice] = useState("₪49");
  const [newCover, setNewCover] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Link Device State
  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [deviceLoading, setDeviceLoading] = useState(false);

  const navigate = useNavigate();

  // Apply language direction to document root
  useEffect(() => {
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("app_lang", lang);
  }, [lang]);

  // Load books and catalog
  async function loadData(showNotification = false) {
    try {
      if (showNotification) setLoading(true);
      const [booksData, catalogData, devicesData] = await Promise.all([
        getUserBooks(currentUser.uid),
        getCatalog(),
        getUserDevices(currentUser.uid)
      ]);
      setBooks(booksData);
      setCatalog(catalogData);
      setLinkedDevices(devicesData);

      if (isActualAdmin) {
        const dbData = await getAdminDatabase(currentUser.email);
        setAdminDbData(dbData);
      }

      if (showNotification) {
        showToast(lang === "he" ? "הנתונים עודכנו בהצלחה!" : "Data updated successfully!", "success");
      }
    } catch (err) {
      showToast(lang === "he" ? "שגיאה בטעינת הנתונים מהשרת" : "Error loading data", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(false);
  }, [currentUser]);

  // Toggle Language
  function toggleLanguage() {
    const newLang = lang === "he" ? "en" : "he";
    setLang(newLang);
  }

  // Toggle Admin View Mode
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

  // Log out handler
  async function handleLogout() {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      showToast(lang === "he" ? "התנתקות נכשלה" : "Logout failed", "error");
    }
  }

  // Admin: Add book to global catalog
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
      showToast(lang === "he" ? `הספר "${newTitle}" נוסף בהצלחה לקטלוג החברה!` : `Book "${newTitle}" added to catalog!`, "success");
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

  // User: Purchase / Claim book from store to personal library
  async function handlePurchaseBook(bookId, bookTitle) {
    try {
      const added = await purchaseBook(currentUser.uid, bookId);
      setBooks(prev => [...prev, added]);
      showToast(lang === "he" ? `תתחדשי! הספר "${bookTitle}" נוסף לספרייה האישית שלך` : `Enjoy! "${bookTitle}" added to your library`, "success");
      setActiveTab("library");
      loadData(false);
    } catch (err) {
      showToast(err.message || "Error purchasing book", "warning");
    }
  }

  // Link device handler
  async function handleLinkDevice(e) {
    e.preventDefault();
    if (!deviceIdInput.trim()) return;

    try {
      setDeviceLoading(true);
      const res = await linkBookmarkDevice(currentUser.uid, deviceIdInput);
      setLinkedDevices(prev => [...new Set([...prev, res.deviceId])]);
      showToast(lang === "he" ? `הסימנייה (מזהה: ${res.deviceId}) קושרה בהצלחה לחשבונך!` : `Bookmark (${res.deviceId}) linked!`, "success");
      setDeviceIdInput("");
      setShowDeviceModal(false);
      loadData(false);
    } catch (err) {
      showToast(err.message || "Error linking device", "error");
    } finally {
      setDeviceLoading(false);
    }
  }

  // Map UID to User Email for Admin DB display
  function getUserEmailByUid(uid) {
    if (!adminDbData || !adminDbData.users) return uid;
    const u = adminDbData.users.find(user => user.uid === uid);
    return u ? u.email : uid;
  }

  return (
    <div className="library-container">
      {/* Upper Panel */}
      <div className="main-header" style={{ marginTop: 0 }}>
        <div className="logo-area">
          <span className="icon">📖</span>
          <h1>{t.appName}</h1>
        </div>
        
        <div className="connection-panel">
          {/* Language Switcher */}
          <button onClick={toggleLanguage} className="btn btn-secondary" style={{ minWidth: '100px', fontWeight: '700' }}>
            <span>🌐</span>
            {lang === "he" ? "English" : "עברית"}
          </button>

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

      {/* User Bar & View Mode Toggle */}
      <div className="user-profile-bar">
        <div className="user-info-text">
          <span>{t.hello}, <strong>{currentUser.email}</strong></span>
          {isActualAdmin && (
            <span className="badge" style={{ backgroundColor: showAdminControls ? '#6b46c1' : '#718096', color: '#fff' }}>
              {showAdminControls ? t.adminRole : (lang === "he" ? "👁️ במצב תצוגת קוראת" : "👁️ User View Mode")}
            </span>
          )}
          {linkedDevices.length > 0 && (
            <span className="badge" style={{ backgroundColor: 'rgba(47, 133, 90, 0.15)', color: '#2f855a', border: '1px solid rgba(47, 133, 90, 0.3)' }}>
              {t.linkedBookmark}: {linkedDevices.join(", ")}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Admin Toggle View Button */}
          {isActualAdmin && (
            <button 
              onClick={toggleAdminViewMode} 
              className="btn btn-secondary btn-small"
              style={{ borderColor: showAdminControls ? '#6b46c1' : '#2b6cb0', color: showAdminControls ? '#6b46c1' : '#2b6cb0', fontWeight: '700' }}
            >
              {adminViewMode === "admin" ? t.viewAsUser : t.viewAsAdmin}
            </button>
          )}

          <button onClick={handleLogout} className="btn btn-secondary btn-small">{t.logout}</button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-nav" style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab("library")} 
          className={`btn ${activeTab === "library" ? "btn-primary" : "btn-secondary"}`}
          style={{ flex: 1 }}
        >
          📚 {t.myLibrary} ({books.length})
        </button>
        <button 
          onClick={() => setActiveTab("store")} 
          className={`btn ${activeTab === "store" ? "btn-primary" : "btn-secondary"}`}
          style={{ flex: 1 }}
        >
          🛒 {t.bookstore} ({catalog.length})
        </button>
        {showAdminControls && (
          <button 
            onClick={() => setActiveTab("admin_db")} 
            className={`btn ${activeTab === "admin_db" ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1, backgroundColor: activeTab === "admin_db" ? "#2c3e50" : "#fff", color: activeTab === "admin_db" ? "#fff" : "#2c3e50" }}
          >
            🗄️ {t.adminDb}
          </button>
        )}
      </div>

      {/* Device Linking Modal */}
      {showDeviceModal && (
        <div className="add-book-form glass-card" style={{ borderLeft: '4px solid var(--accent-color)' }}>
          <h3>{t.linkDeviceModalTitle}</h3>
          <p className="section-desc" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            {t.linkDeviceDesc}
          </p>
          <form onSubmit={handleLinkDevice} className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>{t.deviceId}</label>
              <input 
                type="text" 
                value={deviceIdInput} 
                onChange={(e) => setDeviceIdInput(e.target.value)} 
                required 
                placeholder="BOOKMARK_01 / AA:BB:CC:11:22:33"
              />
            </div>
            <div className="form-group" style={{ flex: 1, justifyContent: 'flex-end' }}>
              <button disabled={deviceLoading} type="submit" className="btn btn-primary btn-block">
                {deviceLoading ? "..." : t.linkBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Add Book Form Section */}
      {showAdminControls && activeTab === "store" && (
        <div style={{ marginBottom: "2rem" }}>
          <button 
            onClick={() => setShowAdminForm(!showAdminForm)} 
            className="btn btn-primary"
            style={{ width: "100%", marginBottom: "1rem" }}
          >
            {showAdminForm ? t.closeForm : t.adminAddBookBtn}
          </button>

          {showAdminForm && (
            <form onSubmit={handleAddCatalogBook} className="add-book-form glass-card">
              <h3>{t.addBookTitle}</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>{t.bookTitle}</label>
                  <input 
                    type="text" 
                    value={newTitle} 
                    onChange={(e) => setNewTitle(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>{t.author}</label>
                  <input 
                    type="text" 
                    value={newAuthor} 
                    onChange={(e) => setNewAuthor(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>{t.totalPages}</label>
                  <input 
                    type="number" 
                    min="1"
                    value={newTotalPages} 
                    onChange={(e) => setNewTotalPages(e.target.value)} 
                    required 
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t.price}</label>
                  <input 
                    type="text" 
                    value={newPrice} 
                    onChange={(e) => setNewPrice(e.target.value)} 
                    placeholder="₪49"
                  />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>{t.coverUrl}</label>
                  <input 
                    type="text" 
                    value={newCover} 
                    onChange={(e) => setNewCover(e.target.value)} 
                    placeholder="/assets/time_odyssey.jpg"
                  />
                </div>
              </div>
              <button disabled={addLoading} type="submit" className="btn btn-primary">
                {addLoading ? "..." : t.publishInStore}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === "library" ? (
        /* MY LIBRARY VIEW */
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
        /* BOOKSTORE / CATALOG VIEW */
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
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>{book.description}</p>
                      
                      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', itemsCenter: 'center', paddingTop: '0.5rem' }}>
                        <span style={{ fontWeight: '800', color: 'var(--primary-color)', fontSize: '1.1rem' }}>{book.price || "₪49"}</span>
                        {isOwned ? (
                          <span className="badge" style={{ backgroundColor: 'rgba(47, 133, 90, 0.15)', color: '#2f855a' }}>{t.alreadyOwned}</span>
                        ) : (
                          <button 
                            onClick={() => handlePurchaseBook(book.bookId, book.title)} 
                            className="btn btn-primary btn-small"
                          >
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* 1. REGISTERED USERS TABLE */}
              <div className="glass-card" style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>{t.registeredUsers} ({adminDbData.users.length})</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: lang === 'he' ? 'right' : 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>{t.email}</th>
                      <th style={{ padding: '0.75rem' }}>{t.userUid}</th>
                      <th style={{ padding: '0.75rem' }}>{t.role}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminDbData.users.map(u => (
                      <tr key={u.uid} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: '700' }}>{u.email}</td>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{u.uid}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span className="badge" style={{ backgroundColor: u.role === 'admin' ? '#6b46c1' : '#e2e8f0', color: u.role === 'admin' ? '#fff' : '#1e293b' }}>
                            {u.role === 'admin' ? t.adminRole : '👤 Reader'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 2. USER BOOKS & READING PROGRESS TABLE */}
              <div className="glass-card" style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>{t.userProgressTitle}</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: lang === 'he' ? 'right' : 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>{t.email}</th>
                      <th style={{ padding: '0.75rem' }}>{t.bookTitle}</th>
                      <th style={{ padding: '0.75rem' }}>{t.author}</th>
                      <th style={{ padding: '0.75rem' }}>{t.currentPage}</th>
                      <th style={{ padding: '0.75rem' }}>{t.totalPages}</th>
                      <th style={{ padding: '0.75rem' }}>{t.completionPct}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(adminDbData.progress).flatMap(([uid, userBooks]) => 
                      userBooks.map(b => {
                        const pct = Math.round(((b.currentPage || 1) / b.totalPages) * 100);
                        return (
                          <tr key={uid + "_" + b.bookId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: '700' }}>{getUserEmailByUid(uid)}</td>
                            <td style={{ padding: '0.75rem' }}>{b.title}</td>
                            <td style={{ padding: '0.75rem' }}>{b.author}</td>
                            <td style={{ padding: '0.75rem', fontWeight: '800', color: 'var(--primary-color)' }}>{b.currentPage || 1}</td>
                            <td style={{ padding: '0.75rem' }}>{b.totalPages}</td>
                            <td style={{ padding: '0.75rem' }}>
                              <span className="badge" style={{ backgroundColor: 'rgba(107, 70, 193, 0.12)', color: 'var(--primary-color)' }}>
                                {pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* 3. LINKED DEVICES TABLE */}
              <div className="glass-card" style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>{t.linkedDevicesTitle} ({Object.keys(adminDbData.devices).length})</h3>
                {Object.keys(adminDbData.devices).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No devices linked yet.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: lang === 'he' ? 'right' : 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.75rem' }}>{t.deviceId}</th>
                        <th style={{ padding: '0.75rem' }}>{t.belongsTo}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(adminDbData.devices).map(([devId, uid]) => (
                        <tr key={devId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontWeight: '700' }}>{devId}</td>
                          <td style={{ padding: '0.75rem' }}>{getUserEmailByUid(uid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          )}
        </section>
      )}
    </div>
  );
}
