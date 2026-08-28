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

// Admin: remove a book from the catalog entirely (its catalog doc + all page docs).
// Does NOT touch copies already in users' personal libraries or their saved notes.
export async function deleteCatalogBook(userEmail, bookId) {
  const normalizedEmail = (userEmail || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(normalizedEmail)) {
    throw new Error("הרשאת מנהלת בלבד");
  }

  const pagesSnap = await getDocs(collection(db, "catalog", bookId, "pages"));
  const CHUNK = 450;
  const pageDocs = pagesSnap.docs;
  for (let start = 0; start < pageDocs.length; start += CHUNK) {
    const batch = writeBatch(db);
    pageDocs.slice(start, start + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  await deleteDoc(doc(db, "catalog", bookId));
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
    const catalogData = catalogSnap.exists() ? catalogSnap.data() : {};
    return { ...catalogData, ...entry };
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

// ==========================================
// ADMIN — raw database inspection
// ==========================================

export async function getAdminDatabase(userEmail) {
  const normalizedEmail = (userEmail || "").toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(normalizedEmail)) {
    throw new Error("הרשאת מנהלת בלבד");
  }

  const [usersSnap, catalogSnap, librarySnap, notesSnap, devicesSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "catalog")),
    getDocs(collectionGroup(db, "library")),
    getDocs(collectionGroup(db, "notes")),
    getDocs(collection(db, "devices"))
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
