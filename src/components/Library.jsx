import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { 
  getUserBooks, 
  getCatalog, 
  addCatalogBook, 
  purchaseBook, 
  linkBookmarkDevice, 
  getUserDevices 
} from "../dbHelper";
import { useNavigate } from "react-router-dom";

export default function Library({ onOpenBook, showToast }) {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("library"); // 'library' or 'store'
  const [books, setBooks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [linkedDevices, setLinkedDevices] = useState([]);
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
    } catch (err) {
      showToast(err.message || "שגיאה בקישור המכשיר", "error");
    } finally {
      setDeviceLoading(false);
    }
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
      <div className="tabs-nav" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
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
          🛒 חנות הספרים של החברה ({catalog.length})
        </button>
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
                    placeholder="assets/cover.jpg"
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
      ) : (
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
      )}
    </div>
  );
}
