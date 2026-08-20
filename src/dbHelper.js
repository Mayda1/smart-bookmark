async function parseResponse(response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  throw new Error(text || "שגיאת תקשורת עם השרת");
}

// 1. Get Global Catalog (Bookstore)
export async function getCatalog() {
  const response = await fetch("/api/catalog");
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת הקטלוג");
  return data;
}

// 2. Admin: Add book to global catalog
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

// 3. User: Purchase / Claim book from catalog to personal library
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

// 4. Get all books in user's personal library
export async function getUserBooks(userId) {
  const response = await fetch(`/api/books?userId=${encodeURIComponent(userId)}`);
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בטעינת הספרייה");
  return data;
}

// 5. Update progress of a specific book
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

// 6. Link Bookmark Device ID
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

// 7. Get user linked devices
export async function getUserDevices(userId) {
  const response = await fetch(`/api/devices?userId=${encodeURIComponent(userId)}`);
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.error || "שגיאה בשליפת מכשירים");
  return data;
}
