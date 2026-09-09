import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserBooks, getCatalog, getBookPages, updateBookProgress, linkNfcTag, getUserDevices, getPendingNfcTag } from "../dbHelper";
import { translations } from "../translations";

// Reader component — full-screen, minimal "e-reader" layout (Kindle-style):
// a slim top toolbar (back button, title, settings) and the book filling
// the rest of the viewport, with edge tap-zones for page navigation.
export default function Reader({ bookId, initialPage, startPage, onBack, onClose, showToast }) {
  const { currentUser } = useAuth();
  const [book, setBook] = useState(null);
  // Ordered page contents fetched from catalog/{bookId}/pages — each item is
  // { type: "text", text } or { type: "image", image, alt }
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(initialPage || startPage || 1);
  const [loading, setLoading] = useState(true);
  const [isTurning, setIsTurning] = useState(false);

  // Reader Settings
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState("serif");
  const [theme, setTheme] = useState("cream");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  // Language
  const lang = localStorage.getItem("app_lang") || "he";
  const t = translations[lang];

  // Close the settings panel on an outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    }
    if (settingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [settingsOpen]);

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

  // Link the physical NFC sticker on this book's cover to this catalog
  // bookId, so the bookmark hardware can recognize it on its own from then
  // on. No Bluetooth involved -- the bookmark always reports every scan to
  // the server over WiFi, and when a tag isn't linked yet, the server
  // stashes it on the device's own doc (see /api/bookmark/scan). We just
  // poll that doc for a scan newer than when we started waiting, same way
  // any other reader would: put the bookmark near an unlinked sticker.
  const [nfcLinking, setNfcLinking] = useState(false);

  async function handleLinkNfcTag() {
    setNfcLinking(true);
    const startedAt = Date.now();
    try {
      const deviceIds = await getUserDevices(currentUser.uid);
      if (deviceIds.length === 0) {
        throw new Error(lang === "he"
          ? "אין לך סימנייה מקושרת לחשבון. קשרי אותה קודם מעמוד הספרייה"
          : "No bookmark linked to your account yet — link one from the Library page first");
      }

      showToast(lang === "he" ? "קרבי את התג לחיישן NFC של הסימנייה..." : "Hold the tag near the bookmark's NFC reader...", "info");

      const timeoutAt = startedAt + 30000;
      let tagUid = null;
      while (Date.now() < timeoutAt) {
        const results = await Promise.all(deviceIds.map(id => getPendingNfcTag(id)));
        const fresh = results.find(r => r && r.scannedAt >= startedAt);
        if (fresh) { tagUid = fresh.tagUid; break; }
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (!tagUid) {
        throw new Error(lang === "he" ? "לא זוהה תג NFC תוך 30 שניות. נסי שוב" : "No NFC tag detected within 30 seconds — try again");
      }

      await linkNfcTag(currentUser.uid, tagUid, bookId);
      showToast(lang === "he" ? "התג קושר לספר הזה בהצלחה!" : "Tag linked to this book!", "success");
    } catch (err) {
      showToast(err.message || "Error linking NFC tag", "error");
    } finally {
      setNfcLinking(false);
    }
  }

  // Load book details
  async function loadData() {
    try {
      setLoading(true);
      const booksData = await getUserBooks(currentUser.uid);

      let found = Array.isArray(booksData) ? booksData.find(b => b.bookId === bookId) : null;

      // If book is not in user's personal library progress list yet, fetch from global catalog!
      if (!found) {
        try {
          const catalog = await getCatalog();
          found = Array.isArray(catalog) ? catalog.find(b => b.bookId === bookId) : null;
        } catch (e) {
          console.error("Catalog fetch error:", e);
        }
      }

      if (found) {
        setBook(found);
        const requestedPage = initialPage || startPage;
        setCurrentPage(requestedPage || found.currentPage || 1);

        // Fetch the ordered page contents (text/image) from the catalog's pages subcollection
        try {
          const bookPages = await getBookPages(bookId);
          setPages(bookPages);
        } catch (e) {
          console.error("Page contents fetch error:", e);
          setPages([]);
        }
      } else {
        // Book truly wasn't found in the user's library or the global
        // catalog (deleted from the catalog, bad/stale bookId, etc.) --
        // leave book as null so the honest "book not found" state below
        // renders, instead of a fabricated placeholder.
        console.error("Book not found in library or catalog:", bookId);
        setBook(null);
      }
    } catch (err) {
      showToast("שגיאה בטעינת הספר", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [bookId, currentUser]);

  async function handlePageChange(newPage) {
    if (!book) return;
    if (newPage < 1 || newPage > book.totalPages) return;

    setIsTurning(true);
    setCurrentPage(newPage);

    try {
      // Pass along the printed page number for this page (when the book has
      // that metadata) so lastPrintedPage stays in sync -- otherwise the
      // physical bookmark's screen can end up showing a stale printed page
      // after navigating from the website. See updateBookProgress().
      const printedPageNumber = pages?.[newPage - 1]?.printedPageNumber ?? null;
      await updateBookProgress(currentUser.uid, bookId, newPage, printedPageNumber);
    } catch (err) {
      console.error("Progress update error:", err);
    } finally {
      setTimeout(() => setIsTurning(false), 200);
    }
  }

  // Keyboard arrow-key page turning — spatial, not semantic (left key
  // always moves toward the left-hand side of the screen), matching the
  // edge tap-zones below.
  useEffect(() => {
    function handleKeyDown(e) {
      if (!book || settingsOpen) return;
      if (e.key === "ArrowLeft") {
        handlePageChange(lang === "he" ? currentPage + 1 : currentPage - 1);
      } else if (e.key === "ArrowRight") {
        handlePageChange(lang === "he" ? currentPage - 1 : currentPage + 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [book, currentPage, lang, settingsOpen, pages]);

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
    cream: { bg: "#f9f6f0", text: "#1f2937" },
    white: { bg: "#ffffff", text: "#000000" },
    dark:  { bg: "#18181b", text: "#e4e4e7" }
  };

  const currentTheme = themeStyles[theme];

  // True when the current page has no selectable text (image-type page, or a
  // legacy whole-book image scan).
  const isImagePage = pages.length > 0
    ? pages[currentPage - 1]?.type === "image"
    : Boolean(book.pageImagePattern);

  // Which physical side of the screen "previous"/"next" live on. Hebrew
  // reads right-to-left, so the next page is toward the left of the screen;
  // English is the mirror image.
  const prevSide = lang === "he" ? "right" : "left";
  const nextSide = lang === "he" ? "left" : "right";
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < book.totalPages;

  return (
    <div className="ereader-container">
      {/* Slim top toolbar — the only chrome on screen besides the book itself */}
      <div className="ereader-toolbar">
        <button onClick={handleBackNav} className="ereader-back-btn" type="button">
          {t.backToLibrary}
        </button>

        <span className="ereader-title" title={book.title}>{book.title}</span>

        <div className="ereader-toolbar-right">
          {/* Book <-> physical NFC tag linking — kept as its own visible
              toolbar button (not tucked inside settings) since it's a
              primary action, not a display preference. */}
          <button
            onClick={handleLinkNfcTag}
            disabled={nfcLinking}
            className="ereader-icon-btn"
            title={lang === "he" ? "קשר תג NFC פיזי לספר הזה, כדי שהסימנייה תזהה אותו לבד" : "Link a physical NFC tag to this book"}
            aria-label={lang === "he" ? "קשר תג NFC" : "Link NFC tag"}
          >
            🔖<span className="ereader-icon-btn-label"> {nfcLinking ? "..." : (lang === "he" ? "קשר תג" : "Link tag")}</span>
          </button>

          <div className="ereader-toolbar-actions" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen(prev => !prev)}
              className="ereader-icon-btn"
              title={t.readerToolbar}
              aria-label={t.readerToolbar}
            >
              Aa
            </button>

            {settingsOpen && (
              <div className="ereader-settings-panel">
                <div className="ereader-settings-row">
                  <span className="ereader-settings-label">{t.fontScale}</span>
                  <div className="control-group">
                    <button onClick={() => setFontSize(prev => Math.max(14, prev - 2))} className="btn-icon-control" title="הקטן גופן">A-</button>
                    <button onClick={() => setFontSize(prev => Math.min(28, prev + 2))} className="btn-icon-control" title="הגדל גופן">A+</button>
                  </div>
                </div>

                <div className="ereader-settings-row">
                  <span className="ereader-settings-label">{t.fontType}</span>
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
                </div>

                <div className="ereader-settings-row">
                  <span className="ereader-settings-label">{t.theme}</span>
                  <div className="control-group themes">
                    <button onClick={() => setTheme("cream")} className={`theme-dot cream ${theme === "cream" ? "active" : ""}`} title="נייר קרם" />
                    <button onClick={() => setTheme("white")} className={`theme-dot white ${theme === "white" ? "active" : ""}`} title="לבן" />
                    <button onClick={() => setTheme("dark")} className={`theme-dot dark ${theme === "dark" ? "active" : ""}`} title="לילה כהה" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen reading pane */}
      <div
        className={`ereader-page ${isTurning ? "page-turning" : ""}`}
        style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
      >
        {/* Edge tap-zones for page navigation */}
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={!canGoPrev}
          className="ereader-tap-zone"
          style={{ [prevSide]: 0 }}
          title="עמוד קודם"
          aria-label="עמוד קודם"
        >
          {/* Always the "previous" glyph -- position (prevSide) already
              flips for RTL, so tying the glyph to screen side too made it
              point the wrong way for Hebrew books (reported by user). */}
          <span className="ereader-chevron">‹</span>
        </button>
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={!canGoNext}
          className="ereader-tap-zone"
          style={{ [nextSide]: 0 }}
          title="עמוד הבא"
          aria-label="עמוד הבא"
        >
          {/* Always the "next" glyph -- see note on the previous button. */}
          <span className="ereader-chevron">›</span>
        </button>

        <div className="ereader-content-column">
          {/* Page Content — Digital Text/Image (Uploaded Books), legacy whole-book image scan, or Fallback Demo */}
          {pages && pages.length > 0 && pages[currentPage - 1]?.type === "image" ? (
            /* IMAGE-TYPE PAGE (chapter divider / illustration) */
            <div className="ereader-image-page">
              <img
                src={pages[currentPage - 1].image}
                alt={pages[currentPage - 1].alt || `עמוד ${currentPage}`}
                draggable={false}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              {pages[currentPage - 1].alt && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7, fontStyle: 'italic' }}>
                  {pages[currentPage - 1].alt}
                </p>
              )}
            </div>
          ) : pages && pages.length > 0 && pages[currentPage - 1]?.type === "text" ? (
            /* DYNAMIC UPLOADED DIGITAL BOOK TEXT */
            <div
              className="ereader-text-content"
              style={{
                fontSize: `${fontSize}px`,
                fontFamily: fontFamily === "serif" ? "Lora, Georgia, serif" : "Assistant, sans-serif"
              }}
            >
              {(pages[currentPage - 1].text || "עמוד ריק.").split('\n\n').map((para, idx) => (
                <p key={idx} style={{ marginBottom: "1.2rem" }}>{para}</p>
              ))}
            </div>
          ) : book.pageImagePattern ? (
            /* IMAGE-BASED BOOK (scanned pages fallback) */
            <div className="ereader-image-page">
              <img
                src={book.pageImagePattern.replace('{PAGE}', String(currentPage).padStart(3, '0'))}
                alt={`עמוד ${currentPage}`}
                draggable={false}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          ) : (
            /* TEXT-BASED DEMO FALLBACK */
            <div
              className="ereader-text-content"
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
                    את נמצאת כעת בעמוד {currentPage} מתוך {book.totalPages}.
                  </p>
                  <p style={{ marginBottom: "1rem" }}>
                    הסימנייה החכמה שלך מסנכרנת אוטומטית את התקדמות הקריאה בענן. בכל פעם שתשני עמוד בסימנייה הפיזית ותלחצי על "Save", העמוד יתעדכן כאן באופן מיידי.
                  </p>
                  <blockquote style={{ borderRight: "3px solid var(--accent-sand)", paddingRight: "1rem", fontStyle: "italic", margin: "1.5rem 0", opacity: 0.75 }}>
                    "ספר טוב איננו מסתיים כשסוגרים את הכריכה; הוא ממשיך לחיות במחשבות של הקורא."
                  </blockquote>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ereader-footer" style={{ color: currentTheme.text }}>
          {(() => {
            // Show the page number as PRINTED on the physical page (when we have
            // that data) rather than our internal scan order — that's the number
            // the reader can see in the book itself and match against the
            // physical bookmark. Falls back to the scan index for legacy/demo
            // books that don't carry printedPageNumber metadata.
            const printed = pages?.[currentPage - 1]?.printedPageNumber;
            const lastPrinted = pages?.length ? pages[pages.length - 1]?.printedPageNumber : null;
            const displayTotal = lastPrinted || book.totalPages;
            if (pages?.length && printed == null) {
              return <span>עמוד ללא מספור בספר המקורי</span>;
            }
            return <span>{printed ?? currentPage} / {displayTotal}</span>;
          })()}
        </div>
      </div>
    </div>
  );
}
