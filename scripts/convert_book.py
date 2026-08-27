#!/usr/bin/env python3
"""
Convert scanned PDF book to optimized page images for the Smart Bookmark reader.
Merges two CamScanner PDFs (part 1: 120 pages, part 2: 90 pages) into 210 page images.
"""

import fitz  # PyMuPDF
import os
import json

OUTPUT_DIR = "/Users/maydaniel/HCI/Idea/public/books/man-search-meaning"
PDF_PART1 = "/Users/maydaniel/HCI/Idea/CamScanner 26-08-2026 13.36.pdf"
PDF_PART2 = "/Users/maydaniel/HCI/Idea/CamScanner 26-08-2026 13.57.pdf"

# Image quality settings — balance between readability and file size
DPI = 150  # Good quality for screen reading
JPEG_QUALITY = 82  # Good compression with minimal quality loss

os.makedirs(OUTPUT_DIR, exist_ok=True)

page_count = 0
total_size = 0

for pdf_path in [PDF_PART1, PDF_PART2]:
    print(f"\nProcessing: {os.path.basename(pdf_path)}")
    doc = fitz.open(pdf_path)
    num_pages = len(doc)
    print(f"  Pages in this PDF: {num_pages}")

    for i in range(num_pages):
        page_count += 1
        page = doc[i]

        # Render page to image at specified DPI
        zoom = DPI / 72  # PDF default is 72 DPI
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)

        # Save as JPEG
        filename = f"page_{page_count:03d}.jpg"
        filepath = os.path.join(OUTPUT_DIR, filename)
        pix.save(filepath, jpg_quality=JPEG_QUALITY)

        file_size = os.path.getsize(filepath)
        total_size += file_size

        if page_count % 20 == 0 or page_count <= 3:
            print(f"  Page {page_count}: {pix.width}x{pix.height}px, {file_size // 1024}KB")

    doc.close()

# Create book manifest JSON
manifest = {
    "bookId": "man-search-meaning",
    "title": "האדם מחפש משמעות",
    "author": "ויקטור פרנקל",
    "totalPages": page_count,
    "price": "₪10",
    "description": "מבוא ללוגותרפיה — מהדורה חדשה לציון 75 שנה לצאת הספר לאור",
    "cover": "/books/man-search-meaning/page_001.jpg",
    "pageImagePattern": "/books/man-search-meaning/page_{PAGE}.jpg",
    "pageFormat": "image"
}

manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"\n{'='*50}")
print(f"✅ Done! Converted {page_count} pages")
print(f"📁 Total size: {total_size / (1024*1024):.1f} MB")
print(f"📄 Average per page: {total_size // page_count // 1024} KB")
print(f"📋 Manifest saved to: {manifest_path}")
