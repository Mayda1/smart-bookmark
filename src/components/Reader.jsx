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
  
  // Notes state for this book
  const [notes, setNotes] = useState([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
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

  async function handlePageChange(newPage) {
    if (!book) return;
    if (newPage < 1 || newPage > book.totalPages) return;

    setIsTurning(true);
    setCurrentPage(newPage);

    try {
      await updateBookProgress(currentUser.uid, bookId, newPage);
    } catch (err) {
      console.error("Progress update error:", err);
    } finally {
      setTimeout(() => setIsTurning(false), 200);
    }
  }

  async function handleAddNote(e) {
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

      {/* Book Reading Canvas */}
      <div className="book-container">
        <button 
          onClick={() => handlePageChange(currentPage - 1)} 
          disabled={currentPage <= 1}
          className="nav-page-btn"
          title="עמוד קודם"
        >
          {lang === "he" ? "→" : "←"}
        </button>

        <div 
          className={`book-page-viewport ${isTurning ? "page-turning" : ""}`}
          style={{
            backgroundColor: currentTheme.bg,
            color: currentTheme.text,
            borderLeftColor: currentTheme.border
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

        <button 
          onClick={() => handlePageChange(currentPage + 1)} 
          disabled={currentPage >= book.totalPages}
          className="nav-page-btn"
          title="עמוד הבא"
        >
          {lang === "he" ? "←" : "→"}
        </button>
      </div>

      {/* Book Notes & Highlights Section */}
      <div className="notes-section" style={{ maxWidth: '850px', margin: '2.5rem auto 0', textRight: 'right' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: 'var(--primary-slate)' }}>
            📝 ציטוטים והערות מעמוד זה ({notes.length})
          </h3>
          <button 
            onClick={() => setShowNoteForm(!showNoteForm)} 
            className="btn btn-secondary btn-small"
          >
            {showNoteForm ? "סגור" : t.addNoteBtn}
          </button>
        </div>

        {/* Add Note Form */}
        {showNoteForm && (
          <form onSubmit={handleAddNote} className="add-book-form" style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>
              שמירת ציטוט / הערה מעמוד {currentPage}
            </h4>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>💬 {t.quoteInput}</label>
              <input 
                type="text" 
                value={newQuote} 
                onChange={(e) => setNewQuote(e.target.value)} 
                placeholder='לדוגמה: "הזמן איננו קו ישר..."'
              />
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
                placeholder="לדוגמה: רעיון מעולה שמתחבר לפרויקט שלי..."
              />
            </div>
            <button disabled={noteSaving} type="submit" className="btn btn-primary btn-small">
              {noteSaving ? "..." : t.saveNoteBtn}
            </button>
          </form>
        )}

        {/* Saved Notes List */}
        {notes.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem' }}>
            עדיין לא שמרת ציטוטים או הערות מתוך הספר הזה. לחצי על <strong>"{t.addNoteBtn}"</strong> כדי לשמור מחשבה!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {notes.map(n => (
              <div 
                key={n.noteId} 
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '1.15rem',
                  boxShadow: 'var(--shadow-sm)',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge badge-admin">
                    {t.pageTag} {n.page}
                  </span>
                  <button 
                    onClick={() => handleDeleteNote(n.noteId)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    {t.deleteBtn} 🗑️
                  </button>
                </div>

                {n.quote && (
                  <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--primary-slate)', fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                    “{n.quote}”
                  </p>
                )}

                {n.note && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    💡 {n.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
