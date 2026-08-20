const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Path to local JSON database for persistent offline storage
const DB_PATH = path.join(__dirname, 'data', 'database.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
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

// Helper to read database
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialData = { users: [], progress: {}, devices: {} };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed.devices) parsed.devices = {};
    return parsed;
  } catch (err) {
    console.error("Error reading database:", err);
    return { users: [], progress: {}, devices: {} };
  }
}

// Helper to write database
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
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "אימייל וסיסמה הם חובה" });
  }

  const dbData = readDB();
  if (dbData.users.some(u => u.email === email)) {
    return res.status(400).json({ error: "האימייל כבר קיים במערכת" });
  }

  const uid = "user_" + Math.random().toString(36).substr(2, 9);
  const newUser = { email, password, uid };
  dbData.users.push(newUser);
  
  // Seed new user with default books progress
  dbData.progress[uid] = DEFAULT_BOOKS.map(b => ({ ...b }));
  
  writeDB(dbData);
  res.json({ email, uid });
});

// 2. User Authentication (Login)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const dbData = readDB();
  const user = dbData.users.find(u => u.email === email && u.password === password);
  
  if (user) {
    res.json({ email: user.email, uid: user.uid });
  } else {
    res.status(400).json({ error: "שם המשתמש או הסיסמה שגויים" });
  }
});

// 3. Get all books for a user
app.get('/api/books', (req, res) => {
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

  res.json(dbData.progress[userId]);
});

// 4. Link Bookmark Device to a User Account (Option A)
app.post('/api/devices/link', (req, res) => {
  const { userId, deviceId } = req.body;
  if (!userId || !deviceId) {
    return res.status(400).json({ error: "מזהה משתמש ומזהה מכשיר נדרשים" });
  }

  const cleanDeviceId = deviceId.trim().toUpperCase();
  const dbData = readDB();
  dbData.devices[cleanDeviceId] = userId;
  writeDB(dbData);

  console.log(`[Device Link] Device ${cleanDeviceId} linked to User ${userId}`);
  res.json({ success: true, deviceId: cleanDeviceId, userId });
});

// 5. Get linked devices for a user
app.get('/api/devices', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });

  const dbData = readDB();
  const linkedDevices = Object.keys(dbData.devices).filter(devId => dbData.devices[devId] === userId);
  res.json(linkedDevices);
});

// 6. Update book reading progress (Called by Arduino or React App)
// Supports either "userId" OR "deviceId" (Option A)
app.post('/api/update-progress', (req, res) => {
  let { userId, deviceId, bookId, currentPage } = req.body;
  
  const dbData = readDB();

  // Option A: If deviceId is sent instead of userId, look up which user owns this device
  if (!userId && deviceId) {
    const cleanDeviceId = deviceId.trim().toUpperCase();
    userId = dbData.devices[cleanDeviceId];
    if (!userId) {
      return res.status(404).json({ error: `המכשיר ${cleanDeviceId} עדיין לא קושר לשום חשבון משתמש באתר` });
    }
  }

  if (!userId || !bookId || currentPage === undefined) {
    return res.status(400).json({ error: "נתונים חסרים (userId/deviceId, bookId, currentPage)" });
  }
  
  if (!dbData.progress[userId]) {
    // Seed user if not present
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
  console.log(`[API Sync] User: ${userId} (via ${deviceId || 'direct'}), Book: ${bookId}, Page updated to: ${currentPage}`);
  
  res.json({ success: true, userId, message: `העמוד עודכן ל-${currentPage}` });
});

// 7. Add new book to user's library
app.post('/api/books', (req, res) => {
  const { userId, title, author, totalPages, cover } = req.body;
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
  res.json(newBook);
});

// Start Server
app.listen(PORT, () => {
  console.log(`Backend API Server running on port ${PORT}`);
});
