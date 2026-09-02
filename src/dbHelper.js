import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  arrayUnion,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

const ADMIN_EMAILS = ["mayda2604@gmail.com", "admin@smartbookmark.com"];

function toMillis(ts) {
  // Firestore Timestamp -> epoch ms, tolerant of a still-pending serverTimestamp() (null locally)
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : Date.now();
}

// ==========================================
// NOTES & HIGHLIGHTS — users/{uid}/notes/{noteId}
// ==========================================

export async function getUserNotes(userId, bookId = "") {
  const notesRef = collection(db, "users", userId, "notes");
  const snap = await getDocs(notesRef);
  let notes = snap.docs.map(d => {
    const data = d.data();
    return { noteId: d.id, ...data, createdAt: new Date(toMillis(data.createdAt)).toISOString() };
  });

  if (bookId) {
    notes = notes.filter(n => n.bookId === bookId);
  }
  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return notes;
}

export async function addNote(userId, noteData) {
  const notesRef = collection(db, "users", userId, "notes");
  const payload = {
    userId,
    bookId: noteData.bookId,
    bookTitle: noteData.bookTitle || "ספר",
    page: parseInt(noteData.page) || 1,
    quote: noteData.quote || "",
    note: noteData.note || "",
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(notesRef, payload);
  return { noteId: ref.id, ...payload, createdAt: new Date().toISOString() };
}

export async function deleteNote(userId, noteId) {
  await deleteDoc(doc(db, "users", userId, "notes", noteId));
  return { success: true, noteId };
}

// ==========================================
// GLOBAL CATALOG (BOOKSTORE) — catalog/{bookId}, pages in catalog/{bookId}/pages/{n}
// ==========================================

export async function getCatalog() {
  const snap = await getDocs(collection(db, "catalog"));
  return snap.docs.map(d => ({ bookId: d.id, ...d.data() }));
}

// Admin: add a book to the global catalog. bookDetails.pages is an array of either
// plain strings (legacy text-only books) or { type: "text", text } / { type: "image", image, alt } objects.
export async function addCatalogBook(userEmail, bookDetails) {
  const normalizedEmail = (userEmail || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(normalizedEmail)) {
    throw new Error("הרשאת מנהלת בלבד");
  }
  if (!bookDetails.title || !bookDetails.author || !bookDetails.totalPages) {
    throw new Error("שם הספר, המחבר ומספר העמודים הם חובה");
  }

  const catalogRef = collection(db, "catalog");
  const bookDoc = await addDoc(catalogRef, {
    title: bookDetails.title,
    author: bookDetails.author,
    totalPages: parseInt(bookDetails.totalPages),
    price: bookDetails.price || "₪49",
    cover: bookDetails.cover || "/assets/placeholder_cover.png",
    description: bookDetails.description || "ספר חדש בקטלוג החברה.",
    createdAt: serverTimestamp(),
    createdBy: normalizedEmail
  });

  const pages = Array.isArray(bookDetails.pages) ? bookDetails.pages : [];
  if (pages.length > 0) {
    // Firestore batches are capped at 500 writes — chunk accordingly
    const CHUNK = 450;
    for (let start = 0; start < pages.length; start += CHUNK) {
      const batch = writeBatch(db);
      const slice = pages.slice(start, start + CHUNK);
      slice.forEach((page, i) => {
        const pageNumber = start + i + 1;
        // printedPageNumber = the page number actually printed on the physical page
        // (may differ from pageNumber, our scan/reading order — front matter, chapter
        // dividers, etc. mean the two sequences drift apart). Kept null when unknown
        // (legacy string pages, or a divider/illustration page with no printed number).
        const printedPageNumber = (typeof page === "object" && page.printedPageNumber != null)
          ? parseInt(page.printedPageNumber)
          : null;
        const pageData = typeof page === "string"
          ? { type: "text", text: page, pageNumber, printedPageNumber }
          : page.type === "image"
            ? { type: "image", image: page.image, alt: page.alt || "", pageNumber, printedPageNumber }
            : { type: "text", text: page.text || "", pageNumber, printedPageNumber };
        const pageRef = doc(db, "catalog", bookDoc.id, "pages", String(pageNumber));
        batch.set(pageRef, pageData);
      });
      await batch.commit();
    }
  }

  return {
    bookId: bookDoc.id,
    title: bookDetails.title,
    author: bookDetails.author,
    totalPages: parseInt(bookDetails.totalPages),
    price: bookDetails.price || "₪49",
    cover: bookDetails.cover || "/assets/placeholder_cover.png",
    description: bookDetails.description || ""
  };
}

// Admin: remove a book from the catalog entirely — its catalog doc, all page
// docs, AND every user's personal library entry for it (otherwise a deleted
// book lingers as a broken card in "My Library" for anyone who owned it).
// Saved notes/quotes are left alone — they store their own bookTitle, so
// they still render fine, and a reader may want to keep a quote even after
// the book is pulled from the store.
export async function deleteCatalogBook(userEmail, bookId) {
  const normalizedEmail = (userEmail || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(normalizedEmail)) {
    throw new Error("הרשאת מנהלת בלבד");
  }

  const CHUNK = 450;

  const pagesSnap = await getDocs(collection(db, "catalog", bookId, "pages"));
  const pageDocs = pagesSnap.docs;
  for (let start = 0; start < pageDocs.length; start += CHUNK) {
    const batch = writeBatch(db);
    pageDocs.slice(start, start + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  const librarySnap = await getDocs(query(collectionGroup(db, "library"), where("bookId", "==", bookId)));
  const libraryDocs = librarySnap.docs;
  for (let start = 0; start < libraryDocs.length; start += CHUNK) {
    const batch = writeBatch(db);
    libraryDocs.slice(start, start + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  await deleteDoc(doc(db, "catalog", bookId));
  return { success: true, bookId, removedFromLibraries: libraryDocs.length };
}

// Let a user remove a stale/orphaned entry from their own library — mainly a
// self-service cleanup for library entries left over from before this file's
// deleteCatalogBook started cascading, but also a normal "remove this book"
// action a user might want.
export async function removeFromLibrary(userId, bookId) {
  await deleteDoc(doc(db, "users", userId, "library", bookId));
  return { success: true, bookId };
}

// Fetch the ordered page contents for a book, for the Reader
export async function getBookPages(bookId) {
  const snap = await getDocs(collection(db, "catalog", bookId, "pages"));
  const pages = snap.docs.map(d => d.data());
  pages.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
  return pages;
}

// ==========================================
// USER LIBRARY (OWNERSHIP + READING PROGRESS) — users/{uid}/library/{bookId}
// ==========================================

export async function purchaseBook(userId, bookId) {
  const catalogSnap = await getDoc(doc(db, "catalog", bookId));
  if (!catalogSnap.exists()) {
    throw new Error("הספר לא נמצא בקטלוג החברה");
  }

  const libraryDocRef = doc(db, "users", userId, "library", bookId);
  const existing = await getDoc(libraryDocRef);
  if (existing.exists()) {
    throw new Error("הספר כבר קיים בספרייה האישית שלך!");
  }

  await setDoc(libraryDocRef, {
    bookId,
    currentPage: 1,
    purchasedAt: serverTimestamp()
  });

  return { bookId, currentPage: 1, ...catalogSnap.data() };
}

export async function getUserBooks(userId) {
  const librarySnap = await getDocs(collection(db, "users", userId, "library"));
  const libraryDocs = librarySnap.docs.map(d => ({ bookId: d.id, ...d.data() }));

  const books = await Promise.all(libraryDocs.map(async (entry) => {
    const catalogSnap = await getDoc(doc(db, "catalog", entry.bookId));
    if (!catalogSnap.exists()) {
      // The book was pulled from the catalog (or this is a leftover entry from
      // before deleteCatalogBook cascaded to libraries) — surface it clearly
      // instead of silently producing NaN%/undefined in the UI.
      return { ...entry, catalogMissing: true, title: entry.title || "ספר שהוסר מהקטלוג", totalPages: entry.totalPages || null };
    }
    return { ...catalogSnap.data(), ...entry, catalogMissing: false };
  }));

  return books;
}

export async function updateBookProgress(userId, bookId, pageNumber) {
  const catalogSnap = await getDoc(doc(db, "catalog", bookId));
  const totalPages = catalogSnap.exists() ? catalogSnap.data().totalPages : parseInt(pageNumber);
  const page = Math.min(Math.max(1, parseInt(pageNumber)), totalPages || parseInt(pageNumber));

  await updateDoc(doc(db, "users", userId, "library", bookId), { currentPage: page });
  return { success: true, userId, message: `העמוד עודכן ל-${page}` };
}

// ==========================================
// NFC TAGS — nfcTags/{tagUid} = { bookId }
// Links a physical NFC sticker (on a physical copy of a book) to a catalog
// bookId. Global/shared on purpose: the tag only says WHICH BOOK, not who
// owns it — the bookmark's own deviceId->uid link supplies the "who" at
// scan time (see /api/bookmark/scan on the server).
// ==========================================

export async function linkNfcTag(userId, tagUid, bookId) {
  const cleanTagUid = (tagUid || "").trim().toUpperCase();
  if (!cleanTagUid) throw new Error("תג NFC לא תקין");

  await setDoc(doc(db, "nfcTags", cleanTagUid), {
    bookId,
    linkedBy: userId,
    linkedAt: serverTimestamp()
  });

  return { success: true, tagUid: cleanTagUid, bookId };
}

// ==========================================
// BOOKMARK DEVICES — devices/{deviceId} = { uid }
// (Progress updates *from* the physical device go through /api/update-progress
//  on the server, using the Firebase Admin SDK, since the hardware isn't a
//  signed-in Firebase user and can't satisfy the client-side security rules.)
// ==========================================

export async function linkBookmarkDevice(userId, deviceId) {
  const cleanDeviceId = deviceId.trim().toUpperCase();
  await setDoc(doc(db, "devices", cleanDeviceId), {
    uid: userId,
    linkedAt: serverTimestamp()
  });
  await setDoc(doc(db, "users", userId), { linkedDevices: arrayUnion(cleanDeviceId) }, { merge: true });

  return { success: true, deviceId: cleanDeviceId, userId };
}

export async function getUserDevices(userId) {
  const q = query(collection(db, "devices"), where("uid", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.id);
}

// No Bluetooth involved in NFC-tag linking anymore -- the bookmark just
// always reports every scan to the server (see /api/bookmark/scan), and
// when the tag isn't linked to a book yet, the server stashes it on the
// device's own doc. The Reader page polls this (see linkNfcTagViaDevice in
// Reader.jsx) instead of waiting for a BLE notification.
export async function getPendingNfcTag(deviceId) {
  const snap = await getDoc(doc(db, "devices", deviceId));
  if (!snap.exists()) return null;
  const pending = snap.data().lastUnlinkedTag;
  if (!pending || !pending.tagUid) return null;
  return { tagUid: pending.tagUid, scannedAt: toMillis(pending.scannedAt) };
}

// ==========================================
// ADMIN — raw database inspection
// ==========================================

export async function getAdminDatabase(userEmail) {
  const normalizedEmail = (userEmail || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(normalizedEmail)) {
    throw new Error("הרשאת מנהלת בלבד");
  }

  const tag = (label, p) => p.catch(e => { e.message = `[admin:${label}] ${e.message}`; throw e; });
  const [usersSnap, catalogSnap, librarySnap, notesSnap, devicesSnap] = await Promise.all([
    tag("users", getDocs(collection(db, "users"))),
    tag("catalog", getDocs(collection(db, "catalog"))),
    tag("library(group)", getDocs(collectionGroup(db, "library"))),
    tag("notes(group)", getDocs(collectionGroup(db, "notes"))),
    tag("devices", getDocs(collection(db, "devices")))
  ]);

  const users = usersSnap.docs.map(d => ({
    uid: d.id,
    email: d.data().email,
    role: ADMIN_EMAILS.includes((d.data().email || "").toLowerCase()) ? "admin" : "user"
  }));

  const catalog = catalogSnap.docs.map(d => ({ bookId: d.id, ...d.data() }));

  const progress = {};
  librarySnap.docs.forEach(d => {
    const uid = d.ref.parent.parent.id;
    if (!progress[uid]) progress[uid] = [];
    progress[uid].push({ bookId: d.id, ...d.data() });
  });

  const notes = {};
  notesSnap.docs.forEach(d => {
    const uid = d.ref.parent.parent.id;
    if (!notes[uid]) notes[uid] = [];
    notes[uid].push({ noteId: d.id, ...d.data() });
  });

  const devices = {};
  devicesSnap.docs.forEach(d => {
    devices[d.id] = d.data().uid;
  });

  return { users, catalog, progress, devices, notes };
}
