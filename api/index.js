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

// Initial Global Catalog Books (Created by Company Admin)
const DEFAULT_CATALOG = [
  {
    bookId: "BOOK_01",
    title: "The Odyssey of Time",
    author: "Alexander Reed",
    totalPages: 250,
    price: "₪49",
    cover: "/assets/time_odyssey.jpg",
    description: "מסע מדע בדיוני מרתק אל מעבר לאופק האירועים והזמן."
  },
  {
    bookId: "BOOK_02",
    title: "Whispers of the Forest",
    author: "Aelia Nightingale",
    totalPages: 180,
    price: "₪39",
    cover: "/assets/forest_whispers.jpg",
    description: "ספר פנטזיה קסום על סודות היער העתיק והאלון המדבר."
  }
];

// List of Admin email addresses
const ADMIN_EMAILS = ["mayda2604@gmail.com", "admin@smartbookmark.com"];

// Helper to read database safely
function readDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        progress: parsed.progress || {},
        devices: parsed.devices || {},
        catalog: Array.isArray(parsed.catalog) && parsed.catalog.length > 0 ? parsed.catalog : DEFAULT_CATALOG
      };
    }
  } catch (err) {
    console.error("Error reading database:", err);
  }
  return { users: [], progress: {}, devices: {}, catalog: DEFAULT_CATALOG };
}

// Helper to write database safely
function writeDB(data) {
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
    
    // Seed new user with first default book in their purchased library
    dbData.progress[uid] = [DEFAULT_CATALOG[0]];
    
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

// 3. Get Global Books Catalog (For Bookstore)
app.get('/api/catalog', (req, res) => {
  try {
    const dbData = readDB();
    return res.json(dbData.catalog);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשליפת קטלוג הספרים" });
  }
});

// 4. Admin Add Book to Global Catalog
app.post('/api/catalog', (req, res) => {
  try {
    const { userEmail, title, author, totalPages, cover, price, description } = req.body || {};
    const normalizedEmail = (userEmail || "").toLowerCase().trim();

    if (!ADMIN_EMAILS.includes(normalizedEmail)) {
      return res.status(403).json({ error: "הרשאת מנהלת בלבד. אין ל משתמש זה הרשאה להוסיף ספרים לקטלוג" });
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
      description: description || "ספר חדש בקטלוג החברה."
    };

    dbData.catalog.push(newBook);
    writeDB(dbData);
    return res.json(newBook);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בהוספת הספר לקטלוג" });
  }
});

// 5. User Purchase / Claim Book from Catalog
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

    // Check if user already owns this book
    const existing = dbData.progress[userId].find(b => b.bookId === bookId);
    if (existing) {
      return res.status(400).json({ error: "הספר כבר קיים בספרייה האישית שלך!" });
    }

    const purchasedBook = {
      ...catalogBook,
      currentPage: 1
    };

    dbData.progress[userId].push(purchasedBook);
    writeDB(dbData);
    return res.json(purchasedBook);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה ברכישת הספר" });
  }
});

// 6. Get user's purchased books
app.get('/api/books', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "מזהה משתמש (userId) נדרש" });
    }

    const dbData = readDB();
    
    // If user progress record doesn't exist, create it with seed data
    if (!dbData.progress[userId]) {
      dbData.progress[userId] = [dbData.catalog[0]];
      writeDB(dbData);
    }

    return res.json(dbData.progress[userId]);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בשליפת הספרים" });
  }
});

// 7. Link Bookmark Device (Option A)
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

// 8. Get linked devices for a user
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

// 9. Update reading progress
app.post('/api/update-progress', (req, res) => {
  try {
    let { userId, deviceId, bookId, currentPage } = req.body || {};
    
    const dbData = readDB();

    if (!userId && deviceId) {
      const cleanDeviceId = deviceId.trim().toUpperCase();
      userId = dbData.devices[cleanDeviceId];
      if (!userId) {
        return res.status(404).json({ error: `המכשיר ${cleanDeviceId} עדיין לא קושר לשום חשבון משתמש באתר` });
      }
    }

    if (!userId || !bookId || currentPage === undefined) {
      return res.status(400).json({ error: "נתונים חסרים" });
    }
    
    if (!dbData.progress[userId]) {
      dbData.progress[userId] = [dbData.catalog[0]];
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
