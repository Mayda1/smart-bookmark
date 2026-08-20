import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserBooks, updateBookProgress, getUserNotes, addNote, deleteNote } from "../dbHelper";
import { translations } from "../translations";

export default function Reader({ bookId, initialPage, onBack, showToast }) {
  const { currentUser } = useAuth();
  const [book, setBook] = useState(null);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const [loading, setLoading] = useState(true);
  const [isTurning, setIsTurning] = useState(false);
  
  // Selected Text & Highlight Sidebar state
  const [selectedText, setSelectedText] = useState("");
  const [showHighlightPanel, setShowHighlightPanel] = useState(false);
  
  // Notes state for this book
  const [notes, setNotes] = useState([]);
  const [newQuote, setNewQuote] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Reader Settings
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState("serif");
  const [theme, setTheme] = useState("cream");

  // Language
  const lang = localStorage.getItem("app_lang") || "he";
  const t = translations[lang];

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [booksData, notesData] = await Promise.all([
          getUserBooks(currentUser.uid),
          getUserNotes(currentUser.uid, bookId)
        ]);
        
        const found = booksData.find(b => b.bookId === bookId);
        if (found) {
          setBook(found);
          setCurrentPage(found.currentPage || 1);
        }
        setNotes(notesData);
      } catch (err) {
        showToast("שגיאה בטעינת הספר", "error");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [bookId, currentUser]);

  // Capture user text selection on the page
  function handleTextSelection() {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString().trim();
      if (text.length > 2) {
        setSelectedText(text);
      }
    }
  }

  // Open side highlight panel pre-filled with selected text
  function openHighlightPanel() {
    setNewQuote(selectedText);
    setShowHighlightPanel(true);
  }

  async function handlePageChange(newPage) {
    if (!book) return;
    if (newPage < 1 || newPage > book.totalPages) return;

    setIsTurning(true);
    setCurrentPage(newPage);
    setSelectedText("");
    setShowHighlightPanel(false);

    try {
      await updateBookProgress(currentUser.uid, bookId, newPage);
    } catch (err) {
      console.error("Progress update error:", err);
    } finally {
      setTimeout(() => setIsTurning(false), 200);
    }
  }

  async function handleAddHighlightNote(e) {
    e.preventDefault();
    if (!newQuote.trim() && !newNoteText.trim()) return;

    try {
      setNoteSaving(true);
      const added = await addNote(currentUser.uid, {
        bookId,
        bookTitle: book.title,
        page: currentPage,
        quote: newQuote,
        note: newNoteText
      });
      setNotes(prev => [added, ...prev]);
      setNewQuote("");
      setNewNoteText("");
      setSelectedText("");
      setShowHighlightPanel(false);
      
      // Clear native text selection
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }

      showToast(lang === "he" ? "הציטוט נשמר במחברת שלך!" : "Highlight saved to your journal!", "success");
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

  if (loading) {
    return <div className="loading-spinner">טוען קורא... ⏳</div>;
  }

  if (!book) {
    return (
      <div className="empty-library-state">
        <p>הספר המבוקש לא נמצא.</p>
        <button onClick={onBack} className="btn btn-primary">{t.backToLibrary}</button>
      </div>
    );
  }

  const themeStyles = {
    cream: { bg: "#f9f6f0", text: "#1f2937", border: "#dcd1be" },
    white: { bg: "#ffffff", text: "#000000", border: "#e5e7eb" },
    dark:  { bg: "#18181b", text: "#e4e4e7", border: "#27272a" }
  };

  const currentTheme = themeStyles[theme];

  return (
    <div className="reader-container">
      {/* Upper Navigation Bar */}
      <div className="reader-header">
        <button onClick={onBack} className="btn btn-secondary btn-small">
          {t.backToLibrary}
        </button>

        <div className="reader-book-details">
          <h2 id="reader-book-title">{book.title}</h2>
          <p id="reader-book-author">{book.author}</p>
        </div>

        {/* Accessibility & Ergonomic Reading Toolbar */}
        <div className="accessibility-toolbar">
          <div className="control-group">
            <button onClick={() => setFontSize(prev => Math.max(14, prev - 2))} className="btn-icon-control" title="הקטן גופן">A-</button>
            <button onClick={() => setFontSize(prev => Math.min(28, prev + 2))} className="btn-icon-control" title="הגדל גופן">A+</button>
          </div>

          <div className="control-group">
            <button 
              onClick={() => setFontFamily("serif")} 
              className={`btn-text-control ${fontFamily === "serif" ? "active" : ""}`}
            >
              Serif
            </button>
            <button 
              onClick={() => setFontFamily("sans")} 
              className={`btn-text-control ${fontFamily === "sans" ? "active" : ""}`}
            >
              Sans
            </button>
          </div>

          <div className="control-group themes">
            <button onClick={() => setTheme("cream")} className={`theme-dot cream ${theme === "cream" ? "active" : ""}`} title="נייר קרם" />
            <button onClick={() => setTheme("white")} className={`theme-dot white ${theme === "white" ? "active" : ""}`} title="לבן" />
            <button onClick={() => setTheme("dark")} className={`theme-dot dark ${theme === "dark" ? "active" : ""}`} title="לילה כהה" />
          </div>
        </div>
      </div>

      {/* Main Layout: Reading Page Canvas + Side Action Panel */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', justifyContent: 'center', maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Navigation Button Left */}
        <button 
          onClick={() => handlePageChange(currentPage - 1)} 
          disabled={currentPage <= 1}
          className="nav-page-btn"
          style={{ marginTop: '200px' }}
          title="עמוד קודם"
        >
          {lang === "he" ? "→" : "←"}
        </button>

        {/* Book Reading Viewport (Clean Canvas - No overlays on top of text!) */}
        <div 
          className={`book-page-viewport ${isTurning ? "page-turning" : ""}`}
          onMouseUp={handleTextSelection}
          onTouchEnd={handleTextSelection}
          style={{
            backgroundColor: currentTheme.bg,
            color: currentTheme.text,
            borderLeftColor: currentTheme.border,
            userSelect: 'text',
            cursor: 'text'
          }}
        >
          <div className="book-page">
            <div className="page-decor-header" style={{ color: currentTheme.text, opacity: 0.6 }}>
              <span className="decor-line" style={{ backgroundColor: currentTheme.text, opacity: 0.3 }}></span>
              <span>{book.title}</span>
              <span className="decor-line" style={{ backgroundColor: currentTheme.text, opacity: 0.3 }}></span>
            </div>

            <div 
              className="page-text-content"
              style={{
                fontSize: `${fontSize}px`,
                fontFamily: fontFamily === "serif" ? "Lora, Georgia, serif" : "Assistant, sans-serif"
              }}
            >
              {currentPage === 1 ? (
                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontFamily: "Lora, serif", fontSize: "1.8rem", textAlign: "center" }}>פרק ראשון</h3>
                  <p style={{ marginBottom: "1rem" }}>
                    "הזמן איננו קו ישר," אמר הפרופסור והביט אל החלון הגדול שפנה לעבר העמק. "הוא דומה יותר לדפים בספר. כשאתה נמצא בעמוד 45, עמוד 1 עדיין קיים ועמוד 250 כבר מחכה לך במקומו."
                  </p>
                  <p>
                    הרוח מחוץ לבניין לחשה דרך העצים. השעון על הקיר תקתק בקצב אטי וקצוב, כאילו מזכיר לכל הנוכחים בחדר כי כל מילה שנאמרת נחרתת בתוך דברי הימים של הזיכרון.
                  </p>
                </div>
              ) : currentPage === 2 ? (
                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontFamily: "Lora, serif", fontSize: "1.8rem", textAlign: "center" }}>פרק שני</h3>
                  <p style={{ marginBottom: "1rem" }}>
                    המסע במעלה ההר החל בשעות הבוקר המוקדמות. הערפל הכבד שכיסה את העמק החל להתפוגג לאט, כשהוא חושף את שבילי האבן העתיקים שנסללו לפני מאות שנים.
                  </p>
                  <p>
                    "כל צעד שאנחנו עושים מקרב אותנו אל הפסגה," אמרה אליסה בלחש. "אבל היופי האמיתי הוא לא ההגעה, אלא הדרך שבה אנחנו מתבוננים בנוף מסביב."
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: "1rem" }}>
                    את נמצאת כעת ב<strong>עמוד {currentPage}</strong> מתוך {book.totalPages}.
                  </p>
                  <p style={{ marginBottom: "1rem" }}>
                    הסימנייה החכמה שלך מסנכרנת אוטומטית את התקדמות הקריאה בענן. בכל פעם שתשני עמוד בסימנייה הפיזית ותלחצי על "Save", העמוד יתעדכן כאן באופן מיידי.
                  </p>
                  <blockquote style={{ borderRight: "3px solid var(--accent-sand)", paddingRight: "1rem", fontStyle: "italic", margin: "1.5rem 0", color: "var(--text-secondary)" }}>
                    "ספר טוב איננו מסתיים כשסוגרים את הכריכה; הוא ממשיך לחיות במחשבות של הקורא."
                  </blockquote>
                </div>
              )}
            </div>

            <div className="page-footer" style={{ color: currentTheme.text, opacity: 0.7 }}>
              <span>— עמוד {currentPage} מתוך {book.totalPages} —</span>
            </div>
          </div>
        </div>

        {/* Navigation Button Right */}
        <button 
          onClick={() => handlePageChange(currentPage + 1)} 
          disabled={currentPage >= book.totalPages}
          className="nav-page-btn"
          style={{ marginTop: '200px' }}
          title="עמוד הבא"
        >
          {lang === "he" ? "←" : "→"}
        </button>

        {/* SIDE ACTIONS & HIGHLIGHT PANEL (Completely outside the page canvas!) */}
        <div style={{ width: '280px', flexShrink: 0 }}>
          
          {/* Side Trigger Button: Appears ONLY when text is highlighted on page */}
          {selectedText && !showHighlightPanel && (
            <div 
              className="add-book-form"
              style={{
                background: '#ffffff',
                border: '1px solid var(--accent-sand)',
                boxShadow: 'var(--shadow-md)',
                animation: 'fadeIn 0.3s ease-out',
                padding: '1.15rem'
              }}
            >
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                ✍️ סומן משפט בעמוד {currentPage}:
              </p>
              <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '0.95rem', color: 'var(--primary-slate)', marginBottom: '1rem', lineClamp: 3, overflow: 'hidden' }}>
                “{selectedText}”
              </p>
              <button 
                onClick={openHighlightPanel} 
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                ✍️ שמור ציטוט זה במחברת
              </button>
            </div>
          )}

          {/* Side Form Panel: Opens when user clicks Save Quote */}
          {showHighlightPanel && (
            <form onSubmit={handleAddHighlightNote} className="add-book-form" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>שמירת ציטוט מעמוד {currentPage}</h4>
                <button type="button" onClick={() => setShowHighlightPanel(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
              </div>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem' }}>💬 הציטוט שסומן</label>
                <textarea 
                  value={newQuote} 
                  onChange={(e) => setNewQuote(e.target.value)}
                  rows="3"
                  style={{
                    background: "#fdfdfc",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "0.5rem",
                    fontFamily: "var(--font-serif)",
                    fontSize: "0.9rem",
                    fontStyle: "italic"
                  }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem' }}>💡 מחשבה אישית (אופציונלי)</label>
                <textarea 
                  value={newNoteText} 
                  onChange={(e) => setNewNoteText(e.target.value)} 
                  rows="2"
                  style={{
                    background: "#fdfdfc",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "0.5rem",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.85rem"
                  }}
                  placeholder="הרעיון שלך..."
                />
              </div>

              <button disabled={noteSaving} type="submit" className="btn btn-primary" style={{ width: '100%', fontSize: '0.85rem' }}>
                {noteSaving ? "..." : t.saveNoteBtn}
              </button>
            </form>
          )}

          {/* Saved Highlights List for this book */}
          {notes.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--primary-slate)', marginBottom: '0.85rem' }}>
                📓 ציטוטים שמורים בספר ({notes.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '400px', overflowY: 'auto' }}>
                {notes.map(n => (
                  <div key={n.noteId} style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.85rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span className="badge badge-admin" style={{ fontSize: '0.7rem' }}>עמוד {n.page}</span>
                      <button onClick={() => handleDeleteNote(n.noteId)} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                    </div>
                    {n.quote && <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--primary-slate)', marginBottom: '0.3rem' }}>“{n.quote}”</p>}
                    {n.note && <p style={{ color: 'var(--text-secondary)' }}>💡 {n.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
