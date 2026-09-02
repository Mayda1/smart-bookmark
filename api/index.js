import express from 'express';
import cors from 'cors';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
//
// NOTE: firebase-admin v12+ dropped the old `admin.apps` / `admin.firestore()`
// namespace object from its default ESM export — only the modular
// `firebase-admin/app` + `firebase-admin/firestore` subpackages work now.
// (The previous version of this file used the old namespace pattern, which
// silently threw "Cannot read properties of undefined (reading 'length')"
// on every call — this endpoint had never actually worked.)
// ==========================================

function getAdminApp() {
  if (getApps().length > 0) return getApp();

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!encoded) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set");
  }
  const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  return initializeApp({
    credential: cert(serviceAccount)
  });
}

function getDb() {
  return getFirestore(getAdminApp());
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

// Look up the printed page number for a given internal sequence number —
// mirror image of resolveSequenceNumber, used when a library doc hasn't
// been touched by the hardware yet (no lastPrintedPage saved) so the
// bookmark still has something sensible to show.
async function resolvePrintedPage(db, bookId, sequenceNumber) {
  const pagesRef = db.collection('catalog').doc(bookId).collection('pages');
  const snap = await pagesRef.where('pageNumber', '==', sequenceNumber).limit(1).get();
  if (!snap.empty) {
    const printed = snap.docs[0].data().printedPageNumber;
    if (printed != null) return printed;
  }
  return sequenceNumber;
}

// The last (highest) printed page number in the book — used to show
// "page X of Y" on the bookmark's tiny screen the same way the site does.
async function getTotalPrintedPages(db, bookId, fallbackTotal) {
  const pagesRef = db.collection('catalog').doc(bookId).collection('pages');
  const snap = await pagesRef.orderBy('pageNumber', 'desc').limit(1).get();
  if (!snap.empty) {
    const printed = snap.docs[0].data().printedPageNumber;
    if (printed != null) return printed;
  }
  return fallbackTotal;
}

// Resolve a physical NFC tag scan into "who is reading what, and where they
// left off" — called directly by the bookmark hardware over WiFi (no phone
// or browser involved). Two independent lookups combine to answer this:
//   deviceId -> uid       (already set up from the site's "Link Device" step)
//   tagUid   -> bookId    (set up once from the Reader page's NFC-link button)
app.post('/api/bookmark/scan', async (req, res) => {
  try {
    const db = getDb();
    const { deviceId, tagUid } = req.body || {};

    if (!deviceId || !tagUid) {
      return res.status(400).json({ error: "נתונים חסרים" });
    }

    const cleanDeviceId = String(deviceId).trim().toUpperCase();
    const cleanTagUid = String(tagUid).trim().toUpperCase();

    const [deviceSnap, tagSnap] = await Promise.all([
      db.collection('devices').doc(cleanDeviceId).get(),
      db.collection('nfcTags').doc(cleanTagUid).get()
    ]);

    if (!deviceSnap.exists) {
      return res.status(404).json({ error: `המכשיר ${cleanDeviceId} עדיין לא קושר לשום חשבון משתמש באתר` });
    }
    if (!tagSnap.exists) {
      // No Bluetooth involved anymore -- the device just always reports every
      // scan here. When the tag isn't linked yet, remember it on the device's
      // own doc (owner-readable per firestore.rules) so the Reader page can
      // pick this up by itself (it already knows its own linked device) and
      // finish the tagUid -> bookId link, without any special "linking mode"
      // on the device side.
      await db.collection('devices').doc(cleanDeviceId).set({
        lastUnlinkedTag: { tagUid: cleanTagUid, scannedAt: FieldValue.serverTimestamp() }
      }, { merge: true });
      return res.status(404).json({ error: "התג הזה עדיין לא קושר לספר" });
    }

    const uid = deviceSnap.data().uid;
    const bookId = tagSnap.data().bookId;

    const [libSnap, catalogSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('library').doc(bookId).get(),
      db.collection('catalog').doc(bookId).get()
    ]);

    if (!libSnap.exists) {
      return res.status(404).json({ error: "הספר הזה לא נמצא בספרייה של המשתמש המקושר למכשיר" });
    }

    const libData = libSnap.data();
    const catalogData = catalogSnap.exists ? catalogSnap.data() : {};
    const sequenceNumber = libData.currentPage || 1;

    const printedPage = libData.lastPrintedPage != null
      ? libData.lastPrintedPage
      : await resolvePrintedPage(db, bookId, sequenceNumber);

    const totalPrintedPages = await getTotalPrintedPages(db, bookId, catalogData.totalPages || sequenceNumber);

    return res.json({
      bookId,
      title: catalogData.title || "",
      printedPage,
      totalPrintedPages
    });
  } catch (err) {
    console.error("bookmark/scan exception:", err);
    return res.status(500).json({ error: "שגיאה באיתור הספר: " + (err.message || "Unknown error") });
  }
});

// Update reading progress — called by the physical Smart Bookmark device (deviceId),
// or usable directly with a userId for testing.
app.post('/api/update-progress', async (req, res) => {
  try {
    const db = getDb();
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
