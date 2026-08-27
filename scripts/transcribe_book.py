#!/usr/bin/env python3
"""
Transcribe scanned Hebrew book PDFs into a complete digital text book JSON file (.book.json).
Uses PyMuPDF, OpenCV, and Tesseract OCR (Hebrew).
"""

import pymupdf
import cv2
import numpy as np
import subprocess
import os
import json
import base64

PDF_PART1 = "/Users/maydaniel/HCI/Idea/CamScanner 26-08-2026 13.36.pdf"
PDF_PART2 = "/Users/maydaniel/HCI/Idea/CamScanner 26-08-2026 13.57.pdf"
OUTPUT_JSON = "/Users/maydaniel/HCI/Idea/man_search_for_meaning.book.json"
SCRATCH_DIR = "/Users/maydaniel/HCI/Idea/scratch"

os.makedirs(SCRATCH_DIR, exist_ok=True)

def preprocess_and_ocr(pix, page_num):
    # Save pixmap to temporary PNG image
    img_path = os.path.join(SCRATCH_DIR, f"temp_page_{page_num}.png")
    pix.save(img_path)

    # Load with OpenCV
    img = cv2.imread(img_path)
    if img is None:
        return ""

    # Rotate 180 degrees (scans are upside down)
    rotated = cv2.rotate(img, cv2.ROTATE_180)
    gray = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)

    # Contrast enhancement & adaptive thresholding
    contrast = cv2.normalize(gray, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
    thresh = cv2.adaptiveThreshold(contrast, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)

    thresh_path = os.path.join(SCRATCH_DIR, f"thresh_page_{page_num}.png")
    cv2.imwrite(thresh_path, thresh)

    # Run Tesseract with Hebrew language
    cmd = ['/opt/homebrew/bin/tesseract', thresh_path, 'stdout', '-l', 'heb', '--psm', '6']
    res = subprocess.run(cmd, capture_output=True)
    raw_text = res.stdout.decode('utf-8', errors='ignore')

    # Clean up temp files
    try:
        os.remove(img_path)
        os.remove(thresh_path)
    except Exception:
        pass

    # Post-process text cleanup
    lines = [line.strip() for line in raw_text.splitlines()]
    clean_lines = [l for l in lines if l and not l.isdigit() and len(l) > 1]
    
    return "\n".join(clean_lines)


def generate_book_json():
    print("🚀 Starting complete book OCR transcription for 'האדם מחפש משמעות'...")

    pages_text = []

    # Get cover image from page 1 of part 1
    doc1 = pymupdf.open(PDF_PART1)
    cover_page = doc1[0]
    cover_pix = cover_page.get_pixmap(dpi=150)
    cover_img_path = os.path.join(SCRATCH_DIR, "cover_raw.png")
    cover_pix.save(cover_img_path)
    
    # Rotate cover 180 deg
    cover_mat = cv2.imread(cover_img_path)
    if cover_mat is not None:
        cover_rot = cv2.rotate(cover_mat, cv2.ROTATE_180)
        cover_final_path = "/Users/maydaniel/HCI/Idea/public/assets/man_search_cover.jpg"
        cv2.imwrite(cover_final_path, cover_rot)
        cover_url = "/assets/man_search_cover.jpg"
    else:
        cover_url = "/assets/placeholder_cover.png"

    total_pages = 0

    for pdf_path in [PDF_PART1, PDF_PART2]:
        print(f"\n📖 Processing PDF: {os.path.basename(pdf_path)}")
        doc = pymupdf.open(pdf_path)
        for idx in range(len(doc)):
            total_pages += 1
            pix = doc[idx].get_pixmap(dpi=180)
            text = preprocess_and_ocr(pix, total_pages)
            pages_text.append(text)
            
            if total_pages % 20 == 0 or total_pages <= 5:
                print(f"  ✓ Page {total_pages}/{210}: {len(text)} chars extracted")
        doc.close()

    book_package = {
        "title": "האדם מחפש משמעות",
        "author": "ויקטור פרנקל",
        "price": "₪10",
        "cover": cover_url,
        "description": "מבוא ללוגותרפיה — מהדורה חדשה לציון 75 שנה לצאת הספר לאור. מאת ויקטור פרנקל.",
        "totalPages": len(pages_text),
        "pages": pages_text
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(book_package, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 COMPLETE! Successfully transcribed all {total_pages} pages!")
    print(f"📄 Book JSON Package created at: {OUTPUT_JSON}")
    print(f"📦 Total size: {os.path.getsize(OUTPUT_JSON) / 1024:.1f} KB")

if __name__ == "__main__":
    generate_book_json()
