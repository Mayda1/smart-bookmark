async function parseResponse(response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  throw new Error(text || "שגיאת תקשורת עם השרת");
}

// ==========================================
// CLIENT-SIDE LOCALSTORAGE — PRIMARY STORAGE
// Notes are persisted in the browser's LocalStorage as the single source of truth.
// The Vercel Serverless /tmp filesystem is ephemeral and unreliable for persistence.
// ==========================================

const NOTES_STORAGE_KEY = "smart_bookmark_notes";

function getAllLocalNotes() {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setAllLocalNotes(notes) {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {
    console.error("LocalStorage write error:", e);
  }
}

// 1. Get user notes & highlights — reads from LocalStorage only
export async function getUserNotes(userId, bookId = "") {
  let notes = getAllLocalNotes().filter(n => n.userId === userId);

  if (bookId) {
    notes = notes.filter(n => n.bookId === bookId);
  }

  // Sort by creation date, newest first
  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return notes;
}

// 2. Add a new note/quote — saves to LocalStorage immediately, also tries server
export async function addNote(userId, noteData) {
  const newNote = {
    noteId: "NOTE_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
    userId,
    bookId: noteData.bookId,
    bookTitle: noteData.bookTitle || "ספר",
    page: parseInt(noteData.page) || 1,
    quote: noteData.quote || "",
    note: noteData.note || "",
    createdAt: new Date().toISOString()
  };

  // Save to LocalStorage immediately — this is the primary store
  const allNotes = getAllLocalNotes();
  allNotes.unshift(newNote);
  setAllLocalNotes(allNotes);

  // Best-effort server save (fire and forget, does not affect return value)
  try {
    fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        bookId: noteData.bookId,
        bookTitle: noteData.bookTitle,
        page: noteData.page,
        quote: noteData.quote,
        note: noteData.note
      })
    }).catch(() => {});
  } catch (e) {}

  return newNote;
}

// 3. Delete a note — removes from LocalStorage, also tries server
export async function deleteNote(userId, noteId) {
  // Remove from LocalStorage immediately
  const allNotes = getAllLocalNotes();
  const filtered = allNotes.filter(n => n.noteId !== noteId);
  setAllLocalNotes(filtered);

  // Best-effort server delete
  try {
    fetch(`/api/notes/${encodeURIComponent(noteId)}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    }).catch(() => {});
  } catch (e) {}

  return { success: true, noteId };
}

// ==========================================
// SERVER API CALLS (Non-notes — these use the server normally)
// ==========================================

// 4. Admin: Get full raw database
export async function getAdminDatabase(userEmail) {
  const ts = Date.now();
  const response = await fetch(`/api/admin/db?userEmail=${encodeURIComponent(userEmail)}&_t=${ts}`, { cache: "no-store" });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת הדאטהבייס");
  return data;
}

// 5. Get Global Catalog (Bookstore)
export async function getCatalog() {
  const ts = Date.now();
  const response = await fetch(`/api/catalog?_t=${ts}`, { cache: "no-store" });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת הקטלוג");
  return data;
}

// 6. Admin: Add book to global catalog
export async function addCatalogBook(userEmail, bookDetails) {
  const response = await fetch("/api/catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userEmail,
      title: bookDetails.title,
      author: bookDetails.author,
      totalPages: parseInt(bookDetails.totalPages),
      cover: bookDetails.cover,
      price: bookDetails.price || "₪49",
      description: bookDetails.description,
      pages: bookDetails.pages || []
    })
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בהוספת הספר לקטלוג");
  return data;
}

// 7. User: Purchase / Claim book from catalog to personal library
export async function purchaseBook(userId, bookId) {
  const response = await fetch("/api/user/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, bookId })
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה ברכישת הספר");
  return data;
}

// 8. Get all books in user's personal library
export async function getUserBooks(userId) {
  const ts = Date.now();
  const response = await fetch(`/api/books?userId=${encodeURIComponent(userId)}&_t=${ts}`, { cache: "no-store" });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בטעינת הספרייה");
  return data;
}

// 9. Update progress of a specific book
export async function updateBookProgress(userId, bookId, pageNumber) {
  const response = await fetch("/api/update-progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      bookId,
      currentPage: parseInt(pageNumber)
    })
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בעדכון התקדמות הקריאה");
  return data;
}

// 10. Link Bookmark Device ID
export async function linkBookmarkDevice(userId, deviceId) {
  const response = await fetch("/api/devices/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, deviceId })
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בקישור המכשיר");
  return data;
}

// 11. Get user linked devices
export async function getUserDevices(userId) {
  const ts = Date.now();
  const response = await fetch(`/api/devices?userId=${encodeURIComponent(userId)}&_t=${ts}`, { cache: "no-store" });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת מכשירים");
  return data;
}
