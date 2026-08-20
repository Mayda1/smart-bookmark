async function parseResponse(response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  throw new Error(text || "שגיאת תקשורת עם השרת");
}

// Client-side LocalStorage Helpers for zero-loss persistence on Vercel
function getLocalNotes(userId) {
  try {
    const raw = localStorage.getItem(`smart_bookmark_notes_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalNote(userId, noteObj) {
  try {
    const current = getLocalNotes(userId);
    const updated = [noteObj, ...current.filter(n => n.noteId !== noteObj.noteId)];
    localStorage.setItem(`smart_bookmark_notes_${userId}`, JSON.stringify(updated));
  } catch (e) {}
}

function removeLocalNote(userId, noteId) {
  try {
    const current = getLocalNotes(userId);
    const updated = current.filter(n => n.noteId !== noteId);
    localStorage.setItem(`smart_bookmark_notes_${userId}`, JSON.stringify(updated));
  } catch (e) {}
}

// 1. Get user notes & highlights (combines API + client LocalStorage fail-safe)
export async function getUserNotes(userId, bookId = "") {
  let apiNotes = [];
  try {
    const ts = Date.now();
    const url = bookId 
      ? `/api/notes?userId=${encodeURIComponent(userId)}&bookId=${encodeURIComponent(bookId)}&_t=${ts}`
      : `/api/notes?userId=${encodeURIComponent(userId)}&_t=${ts}`;
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      apiNotes = await parseResponse(response);
    }
  } catch (e) {
    console.warn("API notes fetch warning, using local backup:", e);
  }

  const localNotes = getLocalNotes(userId);
  
  // Merge API and LocalStorage notes, deduplicating by noteId
  const map = new Map();
  [...apiNotes, ...localNotes].forEach(n => {
    if (n && n.noteId) map.set(n.noteId, n);
  });

  let merged = Array.from(map.values());

  if (bookId) {
    merged = merged.filter(n => n.bookId === bookId);
  }

  return merged;
}

// 2. Add a new note/quote (saves to API + LocalStorage)
export async function addNote(userId, noteData) {
  const newNote = {
    noteId: "NOTE_" + Math.random().toString(36).substr(2, 9),
    bookId: noteData.bookId,
    bookTitle: noteData.bookTitle || "ספר",
    page: parseInt(noteData.page) || 1,
    quote: noteData.quote || "",
    note: noteData.note || "",
    createdAt: new Date().toISOString()
  };

  // Save to client LocalStorage backup immediately
  saveLocalNote(userId, newNote);

  try {
    const response = await fetch("/api/notes", {
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
    });
    if (response.ok) {
      const serverNote = await parseResponse(response);
      saveLocalNote(userId, serverNote);
      return serverNote;
    }
  } catch (err) {
    console.warn("Server save warning, note kept in local storage:", err);
  }

  return newNote;
}

// 3. Delete a note (deletes from API + LocalStorage)
export async function deleteNote(userId, noteId) {
  removeLocalNote(userId, noteId);
  try {
    const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    if (response.ok) {
      return await parseResponse(response);
    }
  } catch (err) {
    console.warn("Delete note server error:", err);
  }
  return { success: true, noteId };
}

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
      description: bookDetails.description
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
