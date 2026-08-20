import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserBooks, updateBookProgress, getUserNotes, addNote, deleteNote } from "../dbHelper";
import { translations } from "../translations";

// Subtle marker highlight style
const HIGHLIGHT_STYLE = {
  backgroundColor: 'rgba(232, 210, 160, 0.35)',
  borderRadius: '2px',
  padding: '1px 0',
  transition: 'background-color 0.3s ease'
};

// Takes a text string and array of saved quotes for this page,
// returns React elements with matching fragments wrapped in <mark>
function highlightText(text, savedQuotes) {
  if (!savedQuotes || savedQuotes.length === 0 || !text) return text;

  // Collect all quote strings for this page (non-empty)
  const quoteStrings = savedQuotes
    .map(n => n.quote)
    .filter(q => q && q.trim().length > 3);

  if (quoteStrings.length === 0) return text;

  // Escape regex special chars and build a combined pattern
  const escaped = quoteStrings.map(q =>
    q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  // Sort longest first so longer matches take priority
  escaped.sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = text.split(pattern);

  if (parts.length === 1) return text; // No matches

  return parts.map((part, i) => {
    const isMatch = quoteStrings.some(q => part === q);
    if (isMatch) {
      return <mark key={i} style={HIGHLIGHT_STYLE}>{part}</mark>;
    }
    return part;
  });
}

// Reader component - Single Back button at top header only
export default function Reader({ bookId, initialPage, startPage, onBack, onClose, showToast }) {
  const { currentUser } = useAuth();
  const [book, setBook] = useState(null);
  const [currentPage, setCurrentPage] = useState(initialPage || startPage || 1);

  // Single navigation back handler (Triggers top header back button)
  function handleBackNav() {
    try {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
    } catch (e) {}
    
    if (typeof onBack === 'function') {
      onBack();
    } else if (typeof onClose === 'function') {
      onClose();
    }
  }

  const [loading, setLoading] = useState(true);
  const [isTurning, setIsTurning] = useState(false);
  
  // Selected Text & Flow state
  const [selectedText, setSelectedText] = useState("");
  const [showBottomForm, setShowBottomForm] = useState(false);
  
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

  // Load book details and quotes
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

  useEffect(() => {
    loadData();
  }, [bookId, currentUser]);

  // Step 1: Capture user text selection on the page
  function handleTextSelection() {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString().trim();
      if (text.length > 2) {
        setSelectedText(text);
      } else {
        if (!showBottomForm) setSelectedText("");
      }
    }
  }

  // Step 2: Clicking the SIDE button opens the BOTTOM form pre-filled with selected text
  function handleSideButtonClick() {
    setNewQuote(selectedText);
    setShowBottomForm(true);
  }

  async function handlePageChange(newPage) {
    if (!book) return;
    if (newPage < 1 || newPage > book.totalPages) return;

    setIsTurning(true);
    setCurrentPage(newPage);
    setSelectedText("");
    setShowBottomForm(false);

    try {
      await updateBookProgress(currentUser.uid, bookId, newPage);
    } catch (err) {
      console.error("Progress update error:", err);
    } finally {
      setTimeout(() => setIsTurning(false), 200);
    }
  }

  // Step 3: Submitting the bottom form
  async function handleAddHighlightNote(e) {
    if (e) e.preventDefault();
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
      setShowBottomForm(false);
      
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
        <button onClick={handleBackNav} className="btn btn-primary">{t.backToLibrary}</button>
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
    <div className="reader-container" style={{ position: 'relative' }}>
      {/* Upper Navigation Bar (THE ONLY Back to Library button on the entire page!) */}
      <div className="reader-header">
        <button onClick={handleBackNav} className="btn btn-secondary btn-small" type="button">
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

      {/* Reading Canvas & Page Navigation Container */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        
        {/* Navigation Button Left */}
        <button 
          onClick={() => handlePageChange(currentPage - 1)} 
          disabled={currentPage <= 1}
          className="nav-page-btn"
          title="עמוד קודם"
        >
          {lang === "he" ? "→" : "←"}
        </button>

        {/* Book Reading Viewport Canvas */}
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
              {(() => {
                const pageNotes = notes.filter(n => n.page === currentPage);
                return null;
              })()}
              {currentPage === 1 ? (
                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontFamily: "Lora, serif", fontSize: "1.8rem", textAlign: "center" }}>פרק ראשון</h3>
                  <p style={{ marginBottom: "1rem" }}>
                    {highlightText("\"הזמן איננו קו ישר,\" אמר הפרופסור והביט אל החלון הגדול שפנה לעבר העמק. \"הוא דומה יותר לדפים בספר. כשאתה נמצא בעמוד 45, עמוד 1 עדיין קיים ועמוד 250 כבר מחכה לך במקומו.\"", notes.filter(n => n.page === 1))}
                  </p>
                  <p>
                    {highlightText("הרוח מחוץ לבניין לחשה דרך העצים. השעון על הקיר תקתק בקצב אטי וקצוב, כאילו מזכיר לכל הנוכחים בחדר כי כל מילה שנאמרת נחרתת בתוך דברי הימים של הזיכרון.", notes.filter(n => n.page === 1))}
                  </p>
                </div>
              ) : currentPage === 2 ? (
                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontFamily: "Lora, serif", fontSize: "1.8rem", textAlign: "center" }}>פרק שני</h3>
                  <p style={{ marginBottom: "1rem" }}>
                    {highlightText("המסע במעלה ההר החל בשעות הבוקר המוקדמות. הערפל הכבד שכיסה את העמק החל להתפוגג לאט, כשהוא חושף את שבילי האבן העתיקים שנסללו לפני מאות שנים.", notes.filter(n => n.page === 2))}
                  </p>
                  <p>
                    {highlightText("\"כל צעד שאנחנו עושים מקרב אותנו אל הפסגה,\" אמרה אליסה בלחש. \"אבל היופי האמיתי הוא לא ההגעה, אלא הדרך שבה אנחנו מתבוננים בנוף מסביב.\"", notes.filter(n => n.page === 2))}
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: "1rem" }}>
                    {highlightText(`את נמצאת כעת בעמוד ${currentPage} מתוך ${book.totalPages}.`, notes.filter(n => n.page === currentPage))}
                  </p>
                  <p style={{ marginBottom: "1rem" }}>
                    {highlightText("הסימנייה החכמה שלך מסנכרנת אוטומטית את התקדמות הקריאה בענן. בכל פעם שתשני עמוד בסימנייה הפיזית ותלחצי על \"Save\", העמוד יתעדכן כאן באופן מיידי.", notes.filter(n => n.page === currentPage))}
                  </p>
                  <blockquote style={{ borderRight: "3px solid var(--accent-sand)", paddingRight: "1rem", fontStyle: "italic", margin: "1.5rem 0", color: "var(--text-secondary)" }}>
                    {highlightText("\"ספר טוב איננו מסתיים כשסוגרים את הכריכה; הוא ממשיך לחיות במחשבות של הקורא.\"", notes.filter(n => n.page === currentPage))}
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
          title="עמוד הבא"
        >
          {lang === "he" ? "←" : "→"}
        </button>

        {/* STEP 1: FLOATING SIDE BUTTON (Appears ON THE SIDE only when text is selected!) */}
        {selectedText && !showBottomForm && (
          <div 
            style={{
              position: 'absolute',
              right: lang === 'he' ? '-140px' : 'auto',
              left: lang === 'he' ? 'auto' : '-140px',
              top: '30%',
              zIndex: 100
            }}
          >
            <button 
              onClick={handleSideButtonClick} 
              className="btn btn-primary"
              style={{
                boxShadow: 'var(--shadow-md)',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                animation: 'slideIn 0.25s ease-out',
                whiteSpace: 'nowrap',
                fontSize: '0.85rem'
              }}
            >
              ✍️ שמור ציטוט
            </button>
          </div>
        )}

      </div>

      {/* STEP 2: BOTTOM FORM (Opens at the bottom of the page when side button is clicked) */}
      {showBottomForm && (
        <div 
          className="add-book-form" 
          style={{ 
            maxWidth: '900px', 
            margin: '2rem auto 0', 
            padding: '1.5rem', 
            borderLeft: '4px solid var(--accent-sand)',
            animation: 'slideDown 0.3s ease-out'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', color: 'var(--primary-slate)' }}>
              ✍️ שמירת ציטוט מעמוד {currentPage}
            </h3>
            <button 
              type="button" 
              onClick={() => { setShowBottomForm(false); setSelectedText(""); }} 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-secondary)' }}
            >
              ✕ סגור
            </button>
          </div>

          <form onSubmit={handleAddHighlightNote}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: '600' }}>💬 הציטוט שסומן (מועתק אוטומטית)</label>
              <textarea 
                value={newQuote} 
                onChange={(e) => setNewQuote(e.target.value)}
                rows="3"
                style={{
                  background: "#fdfdfc",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  fontFamily: "var(--font-serif)",
                  fontSize: "1rem",
                  fontStyle: "italic",
                  lineHeight: "1.5"
                }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: '600' }}>💡 המחשבה או ההערה האישית שלך (אופציונלי)</label>
              <input 
                type="text" 
                value={newNoteText} 
                onChange={(e) => setNewNoteText(e.target.value)} 
                placeholder="הוסיפי מחשבה אישית שלמדת מהציטוט הזה..."
                style={{
                  background: "#fdfdfc",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.95rem"
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => { setShowBottomForm(false); setSelectedText(""); }} 
                className="btn btn-secondary btn-small"
              >
                ביטול
              </button>
              
              <button 
                disabled={noteSaving} 
                type="submit" 
                className="btn btn-primary btn-small"
              >
                {noteSaving ? "שומר..." : t.saveNoteBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Saved Notes Section at the Bottom of Page */}
      {notes.length > 0 && (
        <div style={{ maxWidth: '900px', margin: '2.5rem auto 0' }}>
          <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', color: 'var(--primary-slate)', marginBottom: '1rem' }}>
            📓 ציטוטים והערות שמורות בספר זה ({notes.length})
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {notes.map(n => (
              <div key={n.noteId} style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span className="badge badge-admin">עמוד {n.page}</span>
                  <button onClick={() => handleDeleteNote(n.noteId)} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️ מחק</button>
                </div>
                {n.quote && <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--primary-slate)', fontSize: '0.95rem', marginBottom: '0.35rem' }}>“{n.quote}”</p>}
                {n.note && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>💡 {n.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
