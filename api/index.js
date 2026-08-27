import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// In Vercel Serverless environment, filesystem is read-only except /tmp
const isVercel = Boolean(process.env.VERCEL || process.env.NOW_BUILDER);
const DB_PATH = isVercel ? '/tmp/database.json' : path.join(__dirname, '..', 'data', 'database.json');

// Ensure local data directory exists if not on Vercel
if (!isVercel) {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (e) {
      console.error("Error creating local data directory:", e);
    }
  }
}

const DEFAULT_CATALOG = [
  {
    bookId: "BOOK_01",
    title: "The Odyssey of Time",
    author: "Alexander Reed",
    totalPages: 250,
    price: "₪49",
    cover: "/assets/time_odyssey.jpg",
    description: "מסע מדע בדיוני מרתק אל מעבר לאופק האירועים והזמן.",
    notes: []
  },
  {
    bookId: "BOOK_02",
    title: "Whispers of the Forest",
    author: "Aelia Nightingale",
    totalPages: 180,
    price: "₪39",
    cover: "/assets/forest_whispers.jpg",
    description: "ספר פנטזיה קסום על סודות היער העתיק והאלון המדבר.",
    notes: []
  }
];

// Global in-memory cache across serverless warm invocations
if (!global.memoryDB) {
  global.memoryDB = null;
}

// List of Admin email addresses
const ADMIN_EMAILS = ["mayda2604@gmail.com", "admin@smartbookmark.com"];

// Helper to read database safely with global memory caching
function readDB() {
  if (global.memoryDB) {
    return global.memoryDB;
  }
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      const db = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        progress: parsed.progress || {},
        devices: parsed.devices || {},
        catalog: Array.isArray(parsed.catalog) && parsed.catalog.length > 0 ? parsed.catalog : DEFAULT_CATALOG,
        notes: parsed.notes || {}
      };
      global.memoryDB = db;
      return db;
    }
  } catch (err) {
    console.error("Error reading database:", err);
  }
  const initial = { users: [], progress: {}, devices: {}, catalog: DEFAULT_CATALOG, notes: {} };
  global.memoryDB = initial;
  return initial;
}

// Helper to write database safely
function writeDB(data) {
  global.memoryDB = data;
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing database:", err);
  }
}

// --- API ENDPOINTS ---

// 1. User Authentication (SignUp)
app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "אימייל וסיסמה הם חובה" });
    }

    const dbData = readDB();
    const normalizedEmail = email.toLowerCase().trim();

    if (dbData.users.some(u => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(400).json({ error: "האימייל כבר קיים במערכת" });
    }

    const isAdmin = ADMIN_EMAILS.includes(normalizedEmail);
    const uid = "user_" + Math.random().toString(36).substr(2, 9);
    const newUser = { email: normalizedEmail, password, uid, role: isAdmin ? "admin" : "user" };
    dbData.users.push(newUser);
    
    // Seed new user with first default book
    dbData.progress[uid] = [JSON.parse(JSON.stringify(DEFAULT_CATALOG[0]))];
    
    writeDB(dbData);
    return res.json({ email: newUser.email, uid, role: newUser.role });
  } catch (err) {
    console.error("Signup exception:", err);
    return res.status(500).json({ error: "שגיאה פנימית בהרשמה: " + (err.message || "Unknown error") });
  }
});

// 2. User Authentication (Login)
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "אימייל וסיסמה הם חובה" });
    }

    const dbData = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    const user = dbData.users.find(u => u.email.toLowerCase() === normalizedEmail && u.password === password);
    
    if (user) {
      const isAdmin = ADMIN_EMAILS.includes(normalizedEmail) || user.role === "admin";
      return res.json({ email: user.email, uid: user.uid, role: isAdmin ? "admin" : "user" });
    } else {
      return res.status(400).json({ error: "שם המשתמש או הסיסמה שגויים" });
    }
  } catch (err) {
    console.error("Login exception:", err);
    return res.status(500).json({ error: "שגיאה פנימית בהתחברות: " + (err.message || "Unknown error") });
  }
});

// 3. GET Book Notes & Highlights
app.get('/api/notes', (req, res) => {
  try {
    const { userId, bookId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const dbData = readDB();
    let allNotes = [];

    // Collect notes stored directly inside user's books in progress
    if (dbData.progress[userId]) {
      dbData.progress[userId].forEach(book => {
        if (Array.isArray(book.notes)) {
          allNotes.push(...book.notes);
        }
      });
    }

    // Also include standalone notes
    if (dbData.notes[userId]) {
      allNotes.push(...dbData.notes[userId]);
    }

    // Deduplicate by noteId
    const uniqueNotesMap = new Map();
    allNotes.forEach(n => uniqueNotesMap.set(n.noteId, n));
    let uniqueNotes = Array.from(uniqueNotesMap.values());

    if (bookId) {
      uniqueNotes = uniqueNotes.filter(n => n.bookId === bookId);
    }
    
    return res.json(uniqueNotes);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשליפת ההערות" });
  }
});

// 4. POST Create Book Note / Highlight
app.post('/api/notes', (req, res) => {
  try {
    const { userId, bookId, bookTitle, page, quote, note } = req.body || {};
    if (!userId || !bookId) {
      return res.status(400).json({ error: "userId and bookId required" });
    }

    const dbData = readDB();
    if (!dbData.notes[userId]) dbData.notes[userId] = [];

    const newNote = {
      noteId: "NOTE_" + Math.random().toString(36).substr(2, 9),
      bookId,
      bookTitle: bookTitle || "ספר",
      page: parseInt(page) || 1,
      quote: quote || "",
      note: note || "",
      createdAt: new Date().toISOString()
    };

    // Save in standalone notes array
    dbData.notes[userId].unshift(newNote);

    // ALSO save directly inside user's book in dbData.progress[userId]
    if (dbData.progress[userId]) {
      dbData.progress[userId] = dbData.progress[userId].map(book => {
        if (book.bookId === bookId) {
          const currentNotes = Array.isArray(book.notes) ? book.notes : [];
          return { ...book, notes: [newNote, ...currentNotes] };
        }
        return book;
      });
    }

    writeDB(dbData);
    return res.json(newNote);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשמירת ההערה" });
  }
});

// 5. DELETE Book Note
app.delete('/api/notes/:noteId', (req, res) => {
  try {
    const { noteId } = req.params;
    const { userId } = req.query;
    if (!userId || !noteId) return res.status(400).json({ error: "userId and noteId required" });

    const dbData = readDB();
    if (dbData.notes[userId]) {
      dbData.notes[userId] = dbData.notes[userId].filter(n => n.noteId !== noteId);
    }

    if (dbData.progress[userId]) {
      dbData.progress[userId] = dbData.progress[userId].map(book => {
        if (Array.isArray(book.notes)) {
          return { ...book, notes: book.notes.filter(n => n.noteId !== noteId) };
        }
        return book;
      });
    }

    writeDB(dbData);
    return res.json({ success: true, noteId });
  } catch (err) {
    return res.status(500).json({ error: "שגיאה במחיקת ההערה" });
  }
});

// 6. Admin Raw Database Inspection Endpoint
app.get('/api/admin/db', (req, res) => {
  try {
    const { userEmail } = req.query;
    const normalizedEmail = (userEmail || "").toLowerCase().trim();

    if (!ADMIN_EMAILS.includes(normalizedEmail)) {
      return res.status(403).json({ error: "הרשאת מנהלת בלבד" });
    }

    const dbData = readDB();
    const sanitizedUsers = dbData.users.map(({ password, ...rest }) => rest);
    return res.json({
      users: sanitizedUsers,
      progress: dbData.progress,
      devices: dbData.devices,
      catalog: dbData.catalog,
      notes: dbData.notes
    });
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשליפת הדאטהבייס" });
  }
});

// 7. Get Global Books Catalog
app.get('/api/catalog', (req, res) => {
  try {
    const dbData = readDB();
    return res.json(dbData.catalog);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשליפת קטלוג הספרים" });
  }
});

// 8. Admin Add Book to Global Catalog
app.post('/api/catalog', (req, res) => {
  try {
    const { userEmail, title, author, totalPages, cover, price, description, pages } = req.body || {};
    const normalizedEmail = (userEmail || "").toLowerCase().trim();

    if (!ADMIN_EMAILS.includes(normalizedEmail)) {
      return res.status(403).json({ error: "הרשאת מנהלת בלבד" });
    }

    if (!title || !author || !totalPages) {
      return res.status(400).json({ error: "שם הספר, המחבר ומספר העמודים הם חובה" });
    }

    const dbData = readDB();
    const newBook = {
      bookId: "BOOK_" + Math.random().toString(36).substr(2, 9),
      title,
      author,
      totalPages: parseInt(totalPages),
      price: price || "₪49",
      cover: cover || "/assets/placeholder_cover.png",
      description: description || "ספר חדש בקטלוג החברה.",
      pages: Array.isArray(pages) ? pages : [],
      notes: []
    };

    dbData.catalog.push(newBook);
    writeDB(dbData);
    return res.json(newBook);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בהוספת הספר לקטלוג" });
  }
});

// 9. User Purchase / Claim Book from Catalog
app.post('/api/user/purchase', (req, res) => {
  try {
    const { userId, bookId } = req.body || {};
    if (!userId || !bookId) {
      return res.status(400).json({ error: "userId and bookId required" });
    }

    const dbData = readDB();
    const catalogBook = dbData.catalog.find(b => b.bookId === bookId);
    if (!catalogBook) {
      return res.status(404).json({ error: "הספר לא נמצא בקטלוג החברה" });
    }

    if (!dbData.progress[userId]) {
      dbData.progress[userId] = [];
    }

    const existing = dbData.progress[userId].find(b => b.bookId === bookId);
    if (existing) {
      return res.status(400).json({ error: "הספר כבר קיים בספרייה האישית שלך!" });
    }

    const purchasedBook = {
      ...catalogBook,
      currentPage: 1,
      notes: []
    };

    dbData.progress[userId].push(purchasedBook);
    writeDB(dbData);
    return res.json(purchasedBook);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה ברכישת הספר" });
  }
});

// 10. Get user's purchased books
app.get('/api/books', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "מזהה משתמש (userId) נדרש" });
    }

    const dbData = readDB();
    
    if (!dbData.progress[userId]) {
      dbData.progress[userId] = [JSON.parse(JSON.stringify(DEFAULT_CATALOG[0]))];
      writeDB(dbData);
    }

    return res.json(dbData.progress[userId]);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשליפת הספרים" });
  }
});

// 11. Link Bookmark Device (Option A)
app.post('/api/devices/link', (req, res) => {
  try {
    const { userId, deviceId } = req.body || {};
    if (!userId || !deviceId) {
      return res.status(400).json({ error: "מזהה משתמש ומזהה מכשיר נדרשים" });
    }

    const cleanDeviceId = deviceId.trim().toUpperCase();
    const dbData = readDB();
    dbData.devices[cleanDeviceId] = userId;
    writeDB(dbData);

    return res.json({ success: true, deviceId: cleanDeviceId, userId });
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בקישור המכשיר" });
  }
});

// 12. Get linked devices for a user
app.get('/api/devices', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const dbData = readDB();
    const linkedDevices = Object.keys(dbData.devices).filter(devId => dbData.devices[devId] === userId);
    return res.json(linkedDevices);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשליפת מכשירים" });
  }
});

// 13. Update reading progress
app.post('/api/update-progress', (req, res) => {
  try {
    let { userId, deviceId, bookId, currentPage } = req.body || {};
    
    const dbData = readDB();

    if (!userId && deviceId) {
      const cleanDeviceId = deviceId.trim().toUpperCase();
      userId = dbData.devices[cleanDeviceId];
      if (!userId) {
        return res.status(404).json({ error: `המכשיר ${cleanDeviceId} עדיין לא קושר לשום לחשבון משתמש באתר` });
      }
    }

    if (!userId || !bookId || currentPage === undefined) {
      return res.status(400).json({ error: "נתונים חסרים" });
    }
    
    if (!dbData.progress[userId]) {
      dbData.progress[userId] = [JSON.parse(JSON.stringify(DEFAULT_CATALOG[0]))];
    }

    let bookFound = false;
    dbData.progress[userId] = dbData.progress[userId].map(book => {
      if (book.bookId === bookId) {
        bookFound = true;
        const page = Math.min(Math.max(1, parseInt(currentPage)), book.totalPages);
        return { ...book, currentPage: page };
      }
      return book;
    });

    if (!bookFound) {
      return res.status(404).json({ error: `הספר ${bookId} לא נמצא בספריית המשתמש` });
    }

    writeDB(dbData);
    return res.json({ success: true, userId, message: `העמוד עודכן ל-${currentPage}` });
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בעדכון התקדמות הקריאה" });
  }
});

// Export app for Vercel Serverless
export default function handler(req, res) {
  return app(req, res);
}
