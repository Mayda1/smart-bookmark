import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// FIREBASE ADMIN SDK
// Everything else in the app (auth, catalog, library, notes) is handled
// client-side directly against Firestore, governed by firestore.rules.
// This server exists ONLY for the one operation that can't come from a
// signed-in browser session: the physical Smart Bookmark device reporting
// a page change. The device has no Firebase Auth identity, so it can't
// satisfy the client-side security rules — this trusted endpoint (using
// the Admin SDK, which bypasses those rules) resolves its deviceId to the
// linked user and writes the progress on their behalf.
// ==========================================

function getAdminApp() {
  if (admin.apps.length > 0) return admin.app();

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!encoded) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set");
  }
  const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// The physical bookmark reports the page number PRINTED on the physical page —
// that's the only number a human reader ever sees. Our digital reader, though,
// indexes pages by scan/reading order (pages[0..N-1]), which drifts away from the
// printed numbers whenever the source book has unnumbered pages (front matter,
// chapter dividers, ...). This resolves a reported printed number to the matching
// internal sequence number (pageNumber) so the digital reader opens on the exact
// same page the physical bookmark was left on. Falls back to nearest-lower printed
// page, then to the raw number itself (legacy books with no printedPageNumber data).
async function resolveSequenceNumber(db, bookId, printedPage) {
  const pagesRef = db.collection('catalog').doc(bookId).collection('pages');

  const exact = await pagesRef.where('printedPageNumber', '==', printedPage).limit(1).get();
  if (!exact.empty) return exact.docs[0].data().pageNumber;

  const lower = await pagesRef
    .where('printedPageNumber', '<=', printedPage)
    .orderBy('printedPageNumber', 'desc')
    .limit(1)
    .get();
  if (!lower.empty) return lower.docs[0].data().pageNumber;

  return printedPage;
}

// Update reading progress — called by the physical Smart Bookmark device (deviceId),
// or usable directly with a userId for testing.
app.post('/api/update-progress', async (req, res) => {
  try {
    getAdminApp();
    const db = admin.firestore();
    let { userId, deviceId, bookId, currentPage } = req.body || {};

    if (!userId && deviceId) {
      const cleanDeviceId = deviceId.trim().toUpperCase();
      const deviceSnap = await db.collection('devices').doc(cleanDeviceId).get();
      if (!deviceSnap.exists) {
        return res.status(404).json({ error: `המכשיר ${cleanDeviceId} עדיין לא קושר לשום לחשבון משתמש באתר` });
      }
      userId = deviceSnap.data().uid;
    }

    if (!userId || !bookId || currentPage === undefined) {
      return res.status(400).json({ error: "נתונים חסרים" });
    }

    const libraryRef = db.collection('users').doc(userId).collection('library').doc(bookId);
    const librarySnap = await libraryRef.get();
    if (!librarySnap.exists) {
      return res.status(404).json({ error: `הספר ${bookId} לא נמצא בספריית המשתמש` });
    }

    const printedPage = parseInt(currentPage);
    const sequenceNumber = await resolveSequenceNumber(db, bookId, printedPage);

    const catalogSnap = await db.collection('catalog').doc(bookId).get();
    const totalPages = catalogSnap.exists ? catalogSnap.data().totalPages : sequenceNumber;
    const page = Math.min(Math.max(1, sequenceNumber), totalPages || sequenceNumber);

    await libraryRef.update({ currentPage: page, lastPrintedPage: printedPage });

    return res.json({ success: true, userId, message: `העמוד עודכן ל-${page}` });
  } catch (err) {
    console.error("update-progress exception:", err);
    return res.status(500).json({ error: "שגיאה בעדכון התקדמות הקריאה: " + (err.message || "Unknown error") });
  }
});

// Export app for Vercel Serverless
export default function handler(req, res) {
  return app(req, res);
}
