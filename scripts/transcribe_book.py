#!/usr/bin/env python3
"""
High-Fidelity Hebrew OCR Transcriber for 'האדם מחפש משמעות'.
1. Sequentially renders all 210 PDF pages into high-resolution images.
2. Runs 4 parallel processes to test 0° and 180° orientations per page to find max Hebrew text accuracy.
3. Cleans OCR artifacts and generates man_search_for_meaning.book.json.
"""

import pymupdf
import cv2
import re
import subprocess
import os
import json
from concurrent.futures import ProcessPoolExecutor

PDF_PART1 = "/Users/maydaniel/HCI/Idea/CamScanner 26-08-2026 13.36.pdf"
PDF_PART2 = "/Users/maydaniel/HCI/Idea/CamScanner 26-08-2026 13.57.pdf"
OUTPUT_JSON = "/Users/maydaniel/HCI/Idea/man_search_for_meaning.book.json"
SCRATCH_DIR = "/Users/maydaniel/HCI/Idea/scratch"

os.makedirs(SCRATCH_DIR, exist_ok=True)

def clean_hebrew_text(text):
    lines = text.splitlines()
    cleaned_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        hebrew_chars = len(re.findall(r'[\u0590-\u05FF]', line))
        total_chars = len(line)
        # Drop lines that are mostly noise symbols
        if total_chars > 0 and (hebrew_chars / total_chars < 0.35 and total_chars < 12):
            continue
        line = re.sub(r'[^\u0590-\u05FF0-9\s.,?!\"\'():\-–—]', '', line)
        line = re.sub(r'\s+', ' ', line).strip()
        if line:
            cleaned_lines.append(line)
    return "\n".join(cleaned_lines)

def process_img_task(task):
    img_path, page_num = task
    img = cv2.imread(img_path)
    if img is None:
        return page_num, ""

    best_count = -1
    best_text = ""

    # Test 0° (normal) and 180° (upside down)
    for angle in [0, 180]:
        if angle == 180:
            rotated = cv2.rotate(img, cv2.ROTATE_180)
        else:
            rotated = img

        gray = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)
        tmp_path = os.path.join(SCRATCH_DIR, f"opt_{page_num}_{angle}.png")
        cv2.imwrite(tmp_path, gray)

        cmd = ['/opt/homebrew/bin/tesseract', tmp_path, 'stdout', '-l', 'heb', '--psm', '6']
        res = subprocess.run(cmd, capture_output=True)
        raw_text = res.stdout.decode('utf-8', errors='ignore')

        hebrew_count = len(re.findall(r'[\u0590-\u05FF]', raw_text))
        if hebrew_count > best_count:
            best_count = hebrew_count
            best_text = raw_text

        try:
            os.remove(tmp_path)
        except Exception:
            pass

    cleaned = clean_hebrew_text(best_text)
    return page_num, cleaned

def main():
    print("📸 Step 1: Extracting 210 page images sequentially...")
    image_tasks = []
    page_counter = 0

    for pdf_path in [PDF_PART1, PDF_PART2]:
        doc = pymupdf.open(pdf_path)
        for i in range(len(doc)):
            page_counter += 1
            pix = doc[i].get_pixmap(dpi=180)
            img_path = os.path.join(SCRATCH_DIR, f"page_{page_counter:03d}.png")
            pix.save(img_path)
            image_tasks.append((img_path, page_counter))
        doc.close()

    print(f"✓ Extracted {len(image_tasks)} page images.")
    print("🚀 Step 2: Running parallel multi-angle Hebrew OCR...")

    results_map = {}
    with ProcessPoolExecutor(max_workers=4) as executor:
        for p_num, text in executor.map(process_img_task, image_tasks):
            results_map[p_num] = text
            if len(results_map) % 25 == 0 or len(results_map) == len(image_tasks):
                print(f"  ✓ Processed {len(results_map)}/{len(image_tasks)} pages")

    pages_list = [results_map[i] for i in sorted(results_map.keys())]

    book_data = {
        "title": "האדם מחפש משמעות",
        "author": "ויקטור פרנקל",
        "price": "₪10",
        "cover": "/assets/man_search_cover.jpg",
        "description": "מבוא ללוגותרפיה — מהדורה חדשה לציון 75 שנה לצאת הספר לאור. מאת ויקטור פרנקל.",
        "totalPages": len(pages_list),
        "pages": pages_list
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(book_data, f, ensure_ascii=False, indent=2)

    # Cleanup raw page PNGs
    for img_path, _ in image_tasks:
        try:
            os.remove(img_path)
        except Exception:
            pass

    print(f"\n🎉 DONE! Transcribed all {len(pages_list)} pages into {OUTPUT_JSON}")
    print(f"📦 File size: {os.path.getsize(OUTPUT_JSON)/1024:.1f} KB")

if __name__ == "__main__":
    main()
