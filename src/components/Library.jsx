import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserBooks, addNewBook, linkBookmarkDevice, getUserDevices } from "../dbHelper";
import { useNavigate } from "react-router-dom";

export default function Library({ onOpenBook, showToast }) {
  const { currentUser, logout } = useAuth();
  const [books, setBooks] = useState([]);
  const [linkedDevices, setLinkedDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  
  // Add Book Form state
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newTotalPages, setNewTotalPages] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Link Device State
  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [deviceLoading, setDeviceLoading] = useState(false);

  const navigate = useNavigate();

  // Load books and linked devices from server
  async function loadData(showNotification = false) {
    try {
      if (showNotification) setLoading(true);
      const [booksData, devicesData] = await Promise.all([
        getUserBooks(currentUser.uid),
        getUserDevices(currentUser.uid)
      ]);
      setBooks(booksData);
      setLinkedDevices(devicesData);
      if (showNotification) {
        showToast("הספרייה והנתונים עודכנו בהצלחה!", "success");
      }
    } catch (err) {
      showToast("שגיאה בטעינת הנתונים מהשרת", "error");
    } finally {
      setLoading(false);
    }
  }

  // Load data on mount
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

  // Add book handler
  async function handleAddBook(e) {
    e.preventDefault();
    if (!newTitle || !newAuthor || !newTotalPages) return;
    
    try {
      setAddLoading(true);
      const added = await addNewBook(currentUser.uid, {
        title: newTitle,
        author: newAuthor,
        totalPages: parseInt(newTotalPages)
      });
      setBooks(prev => [...prev, added]);
      showToast(`הספר "${newTitle}" נוסף בהצלחה!`, "success");
      setShowAddForm(false);
      setNewTitle("");
      setNewAuthor("");
      setNewTotalPages("");
    } catch (err) {
      showToast("שגיאה בהוספת הספר", "error");
    } finally {
      setAddLoading(false);
    }
  }

  // Link device handler (Option A)
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
          {linkedDevices.length > 0 && (
            <span className="badge badge-mock" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              סימנייה מקושרת: {linkedDevices.join(", ")}
            </span>
          )}
        </div>
        <button onClick={handleLogout} className="btn btn-secondary btn-small">התנתק 🚪</button>
      </div>

      {/* Device Linking Modal */}
      {showDeviceModal && (
        <div className="add-book-form glass-card" style={{ borderLeft: '4px solid var(--accent-color)' }}>
          <h3>קישור סימנייה פיזית לחשבונך (Option A)</h3>
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

      {/* Library Content */}
      <section className="section library-section" style={{ marginTop: "1rem" }}>
        <div className="section-header-flex">
          <div className="section-header" style={{ marginBottom: 0 }}>
            <h2>הספרייה שלי</h2>
            <p className="section-desc">בחרי ספר כדי להמשיך לקרוא. התקדמות שבוצעה בסימנייה המקושרת מסתנכרנת אוטומטית בענן.</p>
          </div>
          <button 
            onClick={() => setShowAddForm(!showAddForm)} 
            className="btn btn-secondary"
          >
            {showAddForm ? "סגור טופס" : "➕ הוסף ספר חדש"}
          </button>
        </div>

        {/* Add Book Form Section */}
        {showAddForm && (
          <form onSubmit={handleAddBook} className="add-book-form glass-card">
            <h3>הוספת ספר חדש לספרייה</h3>
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
            <button disabled={addLoading} type="submit" className="btn btn-primary">
              {addLoading ? "מוסיף..." : "שמור ספר"}
            </button>
          </form>
        )}

        {/* Loading / Books Grid */}
        {loading ? (
          <div className="loading-spinner">טוען ספרים מהשרת... ⏳</div>
        ) : books.length === 0 ? (
          <div className="empty-library-state">
            <p>הספרייה שלך ריקה. הוסיפי את הספר הראשון שלך כדי להתחיל!</p>
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
    </div>
  );
}
