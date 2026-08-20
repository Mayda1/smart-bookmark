async function parseResponse(response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  throw new Error(text || "שגיאת תקשורת עם השרת");
}

// 1. Get all books for a specific user from the Express Server
export async function getUserBooks(userId) {
  const response = await fetch(`/api/books?userId=${encodeURIComponent(userId)}`);
  const data = await parseResponse(response);
  
  if (!response.ok) {
    throw new Error(data.error || "שגיאה בטעינת הספרייה");
  }
  return data;
}

// 2. Update progress of a specific book (Called when reading on the web app)
export async function updateBookProgress(userId, bookId, pageNumber) {
  const response = await fetch("/api/update-progress", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      bookId,
      currentPage: parseInt(pageNumber)
    })
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "שגיאה בעדכון התקדמות הקריאה");
  }
  return data;
}

// 3. Add a new book to user's library
export async function addNewBook(userId, bookDetails) {
  const response = await fetch("/api/books", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      title: bookDetails.title,
      author: bookDetails.author,
      totalPages: parseInt(bookDetails.totalPages),
      cover: bookDetails.cover
    })
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "שגיאה בהוספת הספר");
  }
  return data;
}

// 4. Link a Bookmark Device ID / MAC Address to user account (Option A)
export async function linkBookmarkDevice(userId, deviceId) {
  const response = await fetch("/api/devices/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, deviceId })
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "שגיאה בקישור המכשיר");
  }
  return data;
}

// 5. Get user linked devices
export async function getUserDevices(userId) {
  const response = await fetch(`/api/devices?userId=${encodeURIComponent(userId)}`);
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(data.error || "שגיאה בשליפת מכשירים");
  }
  return data;
}
