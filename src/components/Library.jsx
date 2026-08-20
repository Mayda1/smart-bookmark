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

  const isAdmin = currentUser.email.toLowerCase() === "mayda2604@gmail.com" || currentUser.role === "admin";

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

      if (isAdmin) {
        const dbData = await getAdminDatabase(currentUser.email);
        setAdminDbData(dbData);
      }

      if (showNotification) {
        showToast("הנתונים עודכנו בהצלחה!", "success");
      }
    } catch (err) {
      showToast("שגיאה בטעינת הנתונים מהשרת", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(false);
  }, [currentUser]);

  // Log out handler
  async function handleLogout() {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      showToast("התנתקות נכשלה", "error");
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
      showToast(`הספר "${newTitle}" נוסף בהצלחה לקטלוג החברה!`, "success");
      setShowAdminForm(false);
      setNewTitle("");
      setNewAuthor("");
      setNewTotalPages("");
      setNewCover("");
      setNewDescription("");
      loadData(false);
    } catch (err) {
      showToast(err.message || "שגיאה בהוספת הספר לקטלוג", "error");
    } finally {
      setAddLoading(false);
    }
  }

  // User: Purchase / Claim book from store to personal library
  async function handlePurchaseBook(bookId, bookTitle) {
    try {
      const added = await purchaseBook(currentUser.uid, bookId);
      setBooks(prev => [...prev, added]);
      showToast(`תתחדשי! הספר "${bookTitle}" נוסף לספרייה האישית שלך`, "success");
      setActiveTab("library");
      loadData(false);
    } catch (err) {
      showToast(err.message || "שגיאה ברכישת הספר", "warning");
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
      showToast(`הסימנייה (מזהה: ${res.deviceId}) קושרה בהצלחה לחשבונך!`, "success");
      setDeviceIdInput("");
      setShowDeviceModal(false);
      loadData(false);
    } catch (err) {
      showToast(err.message || "שגיאה בקישור המכשיר", "error");
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
          <h1>Smart Bookmark</h1>
        </div>
        
        <div className="connection-panel">
          <button onClick={() => setShowDeviceModal(true)} className="btn btn-secondary">
            <span>🔌</span>
            קשר סימנייה פיזית
          </button>
          <button onClick={() => loadData(true)} className="btn btn-primary" id="btn-sync">
            <span className="btn-icon">🔄</span>
            רענן ספרייה
          </button>
        </div>
      </div>

      {/* User Bar */}
      <div className="user-profile-bar">
        <div className="user-info-text">
          <span>שלום, <strong>{currentUser.email}</strong></span>
          {isAdmin && <span className="badge" style={{ backgroundColor: '#6b46c1', color: '#fff' }}>👑 מנהלת החברה</span>}
          {linkedDevices.length > 0 && (
            <span className="badge" style={{ backgroundColor: 'rgba(47, 133, 90, 0.15)', color: '#2f855a', border: '1px solid rgba(47, 133, 90, 0.3)' }}>
              סימנייה מקושרת: {linkedDevices.join(", ")}
            </span>
          )}
        </div>
        <button onClick={handleLogout} className="btn btn-secondary btn-small">התנתק 🚪</button>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-nav" style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab("library")} 
          className={`btn ${activeTab === "library" ? "btn-primary" : "btn-secondary"}`}
          style={{ flex: 1 }}
        >
          📚 הספרייה שלי ({books.length})
        </button>
        <button 
          onClick={() => setActiveTab("store")} 
          className={`btn ${activeTab === "store" ? "btn-primary" : "btn-secondary"}`}
          style={{ flex: 1 }}
        >
          🛒 חנות הספרים ({catalog.length})
        </button>
        {isAdmin && (
          <button 
            onClick={() => setActiveTab("admin_db")} 
            className={`btn ${activeTab === "admin_db" ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1, backgroundColor: activeTab === "admin_db" ? "#2c3e50" : "#fff", color: activeTab === "admin_db" ? "#fff" : "#2c3e50" }}
          >
            🗄️ ניהול דאטהבייס (Admin DB)
          </button>
        )}
      </div>

      {/* Device Linking Modal */}
      {showDeviceModal && (
        <div className="add-book-form glass-card" style={{ borderLeft: '4px solid var(--accent-color)' }}>
          <h3>קישור סימנייה פיזית לחשבונך</h3>
          <p className="section-desc" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            הזיני את מזהה המכשיר (Device ID / MAC Address) המוצג על מסך הסימנייה הפיזית שלך כדי לקשר אותה לחשבונך.
          </p>
          <form onSubmit={handleLinkDevice} className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>מזהה מכשיר / כתובת MAC</label>
              <input 
                type="text" 
                value={deviceIdInput} 
                onChange={(e) => setDeviceIdInput(e.target.value)} 
                required 
                placeholder="לדוגמה: BOOKMARK_01 או AA:BB:CC:11:22:33"
              />
            </div>
            <div className="form-group" style={{ flex: 1, justifyContent: 'flex-end' }}>
              <button disabled={deviceLoading} type="submit" className="btn btn-primary btn-block">
                {deviceLoading ? "מקשר..." : "קשר סימנייה לחשבון"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Add Book Form Section */}
      {isAdmin && activeTab === "store" && (
        <div style={{ marginBottom: "2rem" }}>
          <button 
            onClick={() => setShowAdminForm(!showAdminForm)} 
            className="btn btn-primary"
            style={{ width: "100%", marginBottom: "1rem" }}
          >
            {showAdminForm ? "סגור טופס מנהלת" : "👑 מנהלת החברה: הוסף ספר חדש לקטלוג החברה"}
          </button>

          {showAdminForm && (
            <form onSubmit={handleAddCatalogBook} className="add-book-form glass-card">
              <h3>הוספת ספר חדש לקטלוג החברה (Admin Only)</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>שם הספר</label>
                  <input 
                    type="text" 
                    value={newTitle} 
                    onChange={(e) => setNewTitle(e.target.value)} 
                    required 
                    placeholder="לדוגמה: הארי פוטר"
                  />
                </div>
                <div className="form-group">
                  <label>שם המחבר</label>
                  <input 
                    type="text" 
                    value={newAuthor} 
                    onChange={(e) => setNewAuthor(e.target.value)} 
                    required 
                    placeholder="לדוגמה: ג'יי קיי רולינג"
                  />
                </div>
                <div className="form-group">
                  <label>סה"כ עמודים</label>
                  <input 
                    type="number" 
                    min="1"
                    value={newTotalPages} 
                    onChange={(e) => setNewTotalPages(e.target.value)} 
                    required 
                    placeholder="לדוגמה: 350"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>מחיר</label>
                  <input 
                    type="text" 
                    value={newPrice} 
                    onChange={(e) => setNewPrice(e.target.value)} 
                    placeholder="₪49"
                  />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>קישור לתמונת עטיפה (אופציונלי)</label>
                  <input 
                    type="text" 
                    value={newCover} 
                    onChange={(e) => setNewCover(e.target.value)} 
                    placeholder="/assets/time_odyssey.jpg"
                  />
                </div>
              </div>
              <button disabled={addLoading} type="submit" className="btn btn-primary">
                {addLoading ? "מוסיף לקטלוג..." : "פרסם ספר בחנות"}
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
            <h2>הספרייה שלי</h2>
            <p className="section-desc">הספרים שרכשת. בחרי ספר כדי להמשיך לקרוא. התקדמות שבוצעה בסימנייה מסתנכרנת אוטומטית.</p>
          </div>

          {loading ? (
            <div className="loading-spinner">טוען ספרים אישיים... ⏳</div>
          ) : books.length === 0 ? (
            <div className="empty-library-state">
              <p>עדיין לא רכשת ספרים. כנסי ל-<strong>"חנות הספרים"</strong> כדי לבחור את הספר הראשון שלך!</p>
              <button onClick={() => setActiveTab("store")} className="btn btn-primary" style={{ marginTop: "1rem" }}>
                עבור לחנות הספרים 🛒
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
                      <img src={book.cover} alt="עטיפת הספר" className="book-cover" onError={(e) => {
                        e.target.src = "/assets/placeholder_cover.png";
                      }} />
                      <div className="card-overlay">
                        <button className="btn btn-light btn-read">המשך לקרוא</button>
                      </div>
                    </div>
                    <div className="book-info">
                      <h3 className="book-title">{book.title}</h3>
                      <p className="book-author">{book.author}</p>
                      <div className="progress-container">
                        <div className="progress-bar-wrapper">
                          <div className="progress-bar" style={{ width: `${pct}%` }}></div>
                        </div>
                        <span className="progress-text">עמוד {current} מתוך {total} ({pct}%)</span>
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
            <h2>חנות הספרים של החברה</h2>
            <p className="section-desc">קטלוג הספרים הרשמי. בחרי ספר לרכישה/הוספה לספרייה האישית שלך.</p>
          </div>

          {loading ? (
            <div className="loading-spinner">טוען קטלוג ספרים... ⏳</div>
          ) : (
            <div className="books-grid">
              {catalog.map(book => {
                const isOwned = books.some(b => b.bookId === book.bookId);

                return (
                  <div key={book.bookId} className="book-card" style={{ cursor: 'default' }}>
                    <div className="cover-wrapper">
                      <img src={book.cover} alt="עטיפת הספר" className="book-cover" onError={(e) => {
                        e.target.src = "/assets/placeholder_cover.png";
                      }} />
                    </div>
                    <div className="book-info">
                      <h3 className="book-title">{book.title}</h3>
                      <p className="book-author">{book.author}</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>{book.description}</p>
                      
                      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
                        <span style={{ fontWeight: '800', color: 'var(--primary-color)', fontSize: '1.1rem' }}>{book.price || "₪49"}</span>
                        {isOwned ? (
                          <span className="badge" style={{ backgroundColor: 'rgba(47, 133, 90, 0.15)', color: '#2f855a' }}>✓ כבר בספרייה שלך</span>
                        ) : (
                          <button 
                            onClick={() => handlePurchaseBook(book.bookId, book.title)} 
                            className="btn btn-primary btn-small"
                          >
                            🛒 רכוש ספר
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
            <h2>🗄️ מסד הנתונים החי של המערכת (Admin View)</h2>
            <p className="section-desc">מבט מלא על כל המשתמשים הרשומים באתר, הספרים המשויכים לכל משתמש והתקדמות הקריאה שלהם בזמן אמת.</p>
          </div>

          {!adminDbData ? (
            <div className="loading-spinner">טוען את מסד הנתונים... ⏳</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* 1. REGISTERED USERS TABLE */}
              <div className="glass-card" style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>👥 משתמשים רשומים ({adminDbData.users.length})</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>אימייל</th>
                      <th style={{ padding: '0.75rem' }}>מזהה משתמש (UID)</th>
                      <th style={{ padding: '0.75rem' }}>תפקיד</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminDbData.users.map(u => (
                      <tr key={u.uid} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: '700' }}>{u.email}</td>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{u.uid}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span className="badge" style={{ backgroundColor: u.role === 'admin' ? '#6b46c1' : '#e2e8f0', color: u.role === 'admin' ? '#fff' : '#1e293b' }}>
                            {u.role === 'admin' ? '👑 מנהלת' : '👤 קורא'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 2. USER BOOKS & READING PROGRESS TABLE */}
              <div className="glass-card" style={{ background: '#fff', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>📖 ספרים והתקדמות קריאה לפי משתמש</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>משתמש</th>
                      <th style={{ padding: '0.75rem' }}>שם הספר</th>
                      <th style={{ padding: '0.75rem' }}>מחבר</th>
                      <th style={{ padding: '0.75rem' }}>עמוד נוכחי</th>
                      <th style={{ padding: '0.75rem' }}>סה"כ עמודים</th>
                      <th style={{ padding: '0.75rem' }}>אחוז השלמה</th>
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
                <h3 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>🔌 סימניות פיזיות מקושרות ({Object.keys(adminDbData.devices).length})</h3>
                {Object.keys(adminDbData.devices).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>עדיין לא קושרו סימניות פיזיות במערכת.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.75rem' }}>מזהה סימנייה (Device ID / MAC)</th>
                        <th style={{ padding: '0.75rem' }}>שייך למשתמש</th>
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
