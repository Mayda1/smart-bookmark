async function parseResponse(response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  throw new Error(text || "שגיאת תקשורת עם השרת");
}

// 1. Get user notes & highlights
export async function getUserNotes(userId, bookId = "") {
  const url = bookId 
    ? `/api/notes?userId=${encodeURIComponent(userId)}&bookId=${encodeURIComponent(bookId)}`
    : `/api/notes?userId=${encodeURIComponent(userId)}`;
  const response = await fetch(url);
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת ההערות");
  return data;
}

// 2. Add a new note/quote
export async function addNote(userId, noteData) {
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
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשמירת ההערה");
  return data;
}

// 3. Delete a note
export async function deleteNote(userId, noteId) {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה במחיקת ההערה");
  return data;
}

// 4. Admin: Get full raw database
export async function getAdminDatabase(userEmail) {
  const response = await fetch(`/api/admin/db?userEmail=${encodeURIComponent(userEmail)}`);
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת הדאטהבייס");
  return data;
}

// 5. Get Global Catalog (Bookstore)
export async function getCatalog() {
  const response = await fetch("/api/catalog");
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
  const response = await fetch(`/api/books?userId=${encodeURIComponent(userId)}`);
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
  const response = await fetch(`/api/devices?userId=${encodeURIComponent(userId)}`);
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת מכשירים");
  return data;
}
