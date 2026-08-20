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

// Initial seed books database
const DEFAULT_BOOKS = [
  {
    bookId: "BOOK_01",
    title: "The Odyssey of Time",
    author: "Alexander Reed",
    totalPages: 250,
    currentPage: 1,
    cover: "/assets/time_odyssey.jpg"
  },
  {
    bookId: "BOOK_02",
    title: "Whispers of the Forest",
    author: "Aelia Nightingale",
    totalPages: 180,
    currentPage: 1,
    cover: "/assets/forest_whispers.jpg"
  }
];

// Helper to read database safely
function readDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        progress: parsed.progress || {},
        devices: parsed.devices || {}
      };
    }
  } catch (err) {
    console.error("Error reading database:", err);
  }
  return { users: [], progress: {}, devices: {} };
}

// Helper to write database safely
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing database:", err);
  }
}

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

    const uid = "user_" + Math.random().toString(36).substr(2, 9);
    const newUser = { email: normalizedEmail, password, uid };
    dbData.users.push(newUser);
    
    // Seed new user with default books progress
    dbData.progress[uid] = DEFAULT_BOOKS.map(b => ({ ...b }));
    
    writeDB(dbData);
    return res.json({ email: newUser.email, uid });
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
      return res.json({ email: user.email, uid: user.uid });
    } else {
      return res.status(400).json({ error: "שם המשתמש או הסיסמה שגויים" });
    }
  } catch (err) {
    console.error("Login exception:", err);
    return res.status(500).json({ error: "שגיאה פנימית בהתחברות: " + (err.message || "Unknown error") });
  }
});

// 3. Get all books for a user
app.get('/api/books', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "מזהה משתמש (userId) נדרש" });
    }

    const dbData = readDB();
    
    // If user progress record doesn't exist, create it with seed data
    if (!dbData.progress[userId]) {
      dbData.progress[userId] = DEFAULT_BOOKS.map(b => ({ ...b }));
      writeDB(dbData);
    }

    return res.json(dbData.progress[userId]);
  } catch (err) {
    console.error("Get books exception:", err);
    return res.status(500).json({ error: "שגיאה בשליפת הספרים" });
  }
});

// 4. Link Bookmark Device to a User Account (Option A)
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

// 5. Get linked devices for a user
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

// 6. Update book reading progress (Called by Arduino or React App)
app.post('/api/update-progress', (req, res) => {
  try {
    let { userId, deviceId, bookId, currentPage } = req.body || {};
    
    const dbData = readDB();

    // Option A: If deviceId is sent instead of userId, look up which user owns this device
    if (!userId && deviceId) {
      const cleanDeviceId = deviceId.trim().toUpperCase();
      userId = dbData.devices[cleanDeviceId];
      if (!userId) {
        return res.status(404).json({ error: `המכשיר ${cleanDeviceId} עדיין לא קושר לשום לחשבון משתמש באתר` });
      }
    }

    if (!userId || !bookId || currentPage === undefined) {
      return res.status(400).json({ error: "נתונים חסרים (userId/deviceId, bookId, currentPage)" });
    }
    
    if (!dbData.progress[userId]) {
      dbData.progress[userId] = DEFAULT_BOOKS.map(b => ({ ...b }));
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
    console.error("Update progress exception:", err);
    return res.status(500).json({ error: "שגיאה בעדכון התקדמות הקריאה" });
  }
});

// 7. Add new book to user's library
app.post('/api/books', (req, res) => {
  try {
    const { userId, title, author, totalPages, cover } = req.body || {};
    if (!userId || !title || !author || !totalPages) {
      return res.status(400).json({ error: "נתונים חסרים להוספת ספר" });
    }

    const dbData = readDB();
    if (!dbData.progress[userId]) {
      dbData.progress[userId] = DEFAULT_BOOKS.map(b => ({ ...b }));
    }

    const newBook = {
      bookId: "BOOK_" + Math.random().toString(36).substr(2, 9),
      title,
      author,
      totalPages: parseInt(totalPages),
      currentPage: 1,
      cover: cover || "/assets/placeholder_cover.png"
    };

    dbData.progress[userId].push(newBook);
    writeDB(dbData);
    return res.json(newBook);
  } catch (err) {
    return res.status(500).json({ error: "שגיאה בהוספת הספר" });
  }
});

// Default Vercel Serverless Function Handler
export default function handler(req, res) {
  return app(req, res);
}
