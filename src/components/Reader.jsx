import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { updateBookProgress } from "../dbHelper";

// Mock sentences database for page text generation (same as previous MVP)
const bookTexts = {
  'BOOK_01': {
    chapters: [
      { startPage: 1, title: 'פרק 1: השער הקוסמי' },
      { startPage: 51, title: 'פרק 2: שדות החלל והאבק' },
      { startPage: 121, title: 'פרק 3: פרדוקס שרדינגר' },
      { startPage: 201, title: 'פרק 4: מעבר לזמן ולמרחב' }
    ],
    sentences: [
      "ספינת המחקר 'אוריון' חצתה את אופק האירועים במהירות שעלתה על כל דמיון.",
      "הבקרים במרכז השליטה הבהבו באדום עמום, מזהירים מפני קריסת כבידה קרבה.",
      "אלכס הביט מבעד לצוהר השקוף, היכן שהכוכבים נראו כמו קווים דקים של אור לבן.",
      "משוואות הזמן של איינשטיין כבר לא היו תקפות באזור הזה של הגלקסיה.",
      "הוא הניח את ידו על לוח הבקרה הקריסטלי והרגיש רטט קל שחדר לעורו.",
      "מערכת הניווט האוטונומית דיווחה על קליטת אות לא מוכר שמקורו במרכז הליבה.",
      "האם אלו היו שרידים של תרבות עתיקה, או סתם רעש רקע קוסמי שעבר עיוות?",
      "הזמן החל להימתח. כל דקה על הסיפון הרגישה כמו נצח שלם על פני כדור הארץ.",
      "הם ידעו שאין דרך חזרה, השער הקוסמי נסגר מאחוריהם בנשימה חרישית אחת."
    ]
  },
  'BOOK_02': {
    chapters: [
      { startPage: 1, title: 'פרק 1: צללים בין העצים העתיקים' },
      { startPage: 41, title: 'פרק 2: סודו של האלון המדבר' },
      { startPage: 101, title: 'פרק 3: שירת הפיות באור הירח' }
    ],
    sentences: [
      "הערפל התקדם לאיטו בין גזעי העצים העבותים, מכסה את פני האדמה בשמיכה לחה.",
      "אליה שמעה לחישה עמומה מבין ענפי האורן, קול שקרא בשמה המקורי והנשכח.",
      "פרחי יער קטנים החלו לזהור באור ירוק עדין ככל שהלילה העמיק.",
      "היא החזיקה את מטה העץ שלה מקרוב, מרגישה את החום הזורם מתוכו.",
      "היער זכר הכל: את המלחמות הגדולות, את תור הזהב ואת הילדה שנעלמה.",
      "העלים רשרשו ברוח קלה, משמיעים מנגינה עתיקה שעברה מדור לדור.",
      "פסיעותיה על האדמה הבוצית היו שקטות, משתלבות בקולות הלילה של היער.",
      "זוג עיניים זוהרות הביטו בה מתוך השיחים, מחכות לראות מה יהיה הצעד הבא שלה.",
      "במרכז היער עמד האלון העתיק, שורשיו מגיעים עד לבטן האדמה וסודותיו שמורים היטב."
    ]
  }
};

export default function Reader({ bookId, startPage, onClose, showToast }) {
  const { currentUser } = useAuth();
  const [currentPage, setCurrentPage] = useState(startPage);
  const [bookDetails, setBookDetails] = useState(null);
  const [chapterTitle, setChapterTitle] = useState("פרק ראשון");
  const [pageText, setPageText] = useState("");
  const [hasScannedImage, setHasScannedImage] = useState(false);
  const [scannedSrc, setScannedSrc] = useState("");
  const [isTurning, setIsTurning] = useState(false);

  // Comfort & Accessibility States
  const [fontSize, setFontSize] = useState(1.15); // rem
  const [fontFamily, setFontFamily] = useState("Georgia, serif");
  const [readerTheme, setReaderTheme] = useState("cream"); // cream, white, dark

  // Load book metadata and content
  useEffect(() => {
    const mockBookData = bookTexts[bookId] || {
      chapters: [{ startPage: 1, title: "פרק 1: קריאה דיגיטלית" }],
      sentences: ["עמוד ריק. הוסיפי תוכן או תמונות עבור ספר זה."]
    };
    setBookDetails(mockBookData);
    generatePageContent(mockBookData, currentPage);
  }, [bookId, currentPage]);

  // Generate page chapter and paragraphs
  function generatePageContent(book, pageNum) {
    // Determine Chapter
    let chap = book.chapters[0].title;
    for (let i = 0; i < book.chapters.length; i++) {
      if (pageNum >= book.chapters[i].startPage) {
        chap = book.chapters[i].title;
      } else {
        break;
      }
    }
    setChapterTitle(chap);

    // Verify if scanned page image exists
    const imagePath = `/assets/books/${bookId}/page_${pageNum}.png`;
    const imgTest = new Image();
    imgTest.src = imagePath;
    imgTest.onload = () => {
      setHasScannedImage(true);
      setScannedSrc(imagePath);
    };
    imgTest.onerror = () => {
      setHasScannedImage(false);
      setScannedSrc("");
      // Generate fallback text
      const sentences = book.sentences;
      let sentenceIndex = (pageNum * 7) % sentences.length;
      
      let p1 = "";
      for (let i = 0; i < 4; i++) {
        p1 += sentences[(sentenceIndex + i) % sentences.length] + " ";
      }
      
      let p2 = "";
      for (let i = 4; i < 7; i++) {
        p2 += sentences[(sentenceIndex + i) % sentences.length] + " ";
      }
      setPageText(`<p>${p1}</p><br><p>${p2}</p>`);
    };
  }

  // Handle page turn navigation
  async function handlePageChange(newPage) {
    setIsTurning(true);
    try {
      setCurrentPage(newPage);
      await updateBookProgress(currentUser.uid, bookId, newPage);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        setIsTurning(false);
      }, 150);
    }
  }

  // Text scaling handlers
  const increaseFontSize = () => fontSize < 2.0 && setFontSize(prev => prev + 0.1);
  const decreaseFontSize = () => fontSize > 0.8 && setFontSize(prev => prev - 0.1);

  // Theme style mapping
  const getThemeStyles = () => {
    switch (readerTheme) {
      case "dark":
        return {
          background: "#18181b",
          color: "#e4e4e7",
          borderLeftColor: "#27272a"
        };
      case "white":
        return {
          background: "#ffffff",
          color: "#09090b",
          borderLeftColor: "#e4e4e7"
        };
      case "cream":
      default:
        return {
          background: "#f9f6f0",
          color: "#1f2937",
          borderLeftColor: "#dcd1be"
        };
    }
  };

  return (
    <section className="section reader-section">
      {/* Reader Header */}
      <div className="reader-header">
        <button onClick={onClose} className="btn btn-secondary" id="btn-back-library">
          <span>←</span> חזרה לספרייה
        </button>
        
        <div className="reader-book-details">
          <h2 id="reader-book-title">{bookId === "BOOK_01" ? "The Odyssey of Time" : bookId === "BOOK_02" ? "Whispers of the Forest" : "ספר אישי"}</h2>
          <p id="reader-book-author">{bookId === "BOOK_01" ? "Alexander Reed" : bookId === "BOOK_02" ? "Aelia Nightingale" : "המחבר שלי"}</p>
        </div>

        {/* Accessibility Toolbar */}
        <div className="accessibility-toolbar">
          {/* FontSize */}
          <div className="control-group">
            <button onClick={decreaseFontSize} className="btn-icon-control" title="הקטן טקסט">A-</button>
            <button onClick={increaseFontSize} className="btn-icon-control" title="הגדל טקסט">A+</button>
          </div>
          
          {/* FontFace */}
          <div className="control-group">
            <button 
              onClick={() => setFontFamily("Georgia, serif")} 
              className={`btn-text-control ${fontFamily.includes("serif") ? "active" : ""}`}
            >
              סריף
            </button>
            <button 
              onClick={() => setFontFamily("'Assistant', sans-serif")} 
              className={`btn-text-control ${fontFamily.includes("Assistant") ? "active" : ""}`}
            >
              סנס
            </button>
          </div>

          {/* Color Theme */}
          <div className="control-group themes">
            <button 
              onClick={() => setReaderTheme("cream")} 
              className={`theme-dot cream ${readerTheme === "cream" ? "active" : ""}`} 
              title="ערכת נושא נייר"
            />
            <button 
              onClick={() => setReaderTheme("white")} 
              className={`theme-dot white ${readerTheme === "white" ? "active" : ""}`} 
              title="ערכת נושא לבנה"
            />
            <button 
              onClick={() => setReaderTheme("dark")} 
              className={`theme-dot dark ${readerTheme === "dark" ? "active" : ""}`} 
              title="ערכת נושא כהה"
            />
          </div>
        </div>
      </div>

      {/* Book Layout */}
      <div className="book-container">
        <button 
          onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)} 
          className="nav-page-btn prev"
          disabled={currentPage <= 1}
        >
          ◀
        </button>
        
        <div 
          className={`book-page-viewport ${isTurning ? 'page-turning' : ''}`}
          style={getThemeStyles()}
        >
          <div className="book-page">
            <div 
              className="page-decor-header"
              style={{ color: readerTheme === 'dark' ? '#71717a' : '#8b7d6b' }}
            >
              <span className="decor-line" style={{ background: readerTheme === 'dark' ? '#3f3f46' : '#e2d9c8' }}></span>
              <span>{chapterTitle}</span>
              <span className="decor-line" style={{ background: readerTheme === 'dark' ? '#3f3f46' : '#e2d9c8' }}></span>
            </div>
            
            {hasScannedImage ? (
              <div className="scanned-image-container">
                <img src={scannedSrc} alt="עמוד ספר סרוק" className="scanned-page" />
              </div>
            ) : (
              <div className="digital-text-container">
                <div 
                  className="page-text-content" 
                  style={{ fontSize: `${fontSize}rem`, fontFamily: fontFamily, color: getThemeStyles().color }}
                  dangerouslySetInnerHTML={{ __html: pageText }}
                />
              </div>
            )}

            <div 
              className="page-footer"
              style={{ color: readerTheme === 'dark' ? '#71717a' : '#8b7d6b' }}
            >
              <span className="page-num">{currentPage}</span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => handlePageChange(currentPage + 1)} 
          className="nav-page-btn next"
        >
          ▶
        </button>
      </div>
    </section>
  );
}
