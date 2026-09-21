"""
Finishes the walkthrough PDF that headless Chrome printed.

Chrome keeps every link clickable but cannot number pages or be relied on for
a bookmark outline, so this adds both: a bookmark sidebar that mirrors the
chapters, a quiet footer with the page number, and the document's metadata.

    python finish.py raw.pdf out.pdf
"""
import sys

import fitz  # PyMuPDF

CHAPTERS = [
    "Contents",
    "The platform at a glance",
    "Signing in & credentials",
    "How a card is checked",
    "University Admin",
    "Librarian",
    "Guard",
    "Records Office",
    "Student Pass",
    "Fests & Events",
    "The activity record",
    "Who can do what",
    "A 10-minute demo script",
    "Scannable demo cards",
    "Straight answers",
]

raw, out = sys.argv[1], sys.argv[2]
doc = fitz.open(raw)

# Bookmarks: each chapter's title, on the first page (after the previous
# chapter's) where it appears as large text.
toc, start = [[1, "Cover", 1]], 1
for title in CHAPTERS:
    for index in range(start, len(doc)):
        page = doc[index]
        hits = [
            span
            for block in page.get_text("dict")["blocks"]
            for line in block.get("lines", [])
            for span in line["spans"]
            if title in span["text"] and span["size"] >= 15
        ]
        if hits:
            toc.append([1, title, index + 1])
            start = index + 1
            break
doc.set_toc(toc)

# Footer, on every page but the cover.
total = len(doc)
for index in range(1, total):
    page = doc[index]
    width, height = page.rect.width, page.rect.height
    y = height - 22
    page.insert_text((40, y), "GBPUAT Smart Campus · Platform Walkthrough", fontsize=7.5, color=(0.45, 0.52, 0.62))
    label = f"{index + 1} / {total}"
    page.insert_text((width - 40 - fitz.get_text_length(label, fontsize=7.5), y), label, fontsize=7.5, color=(0.45, 0.52, 0.62))
    page.draw_line((40, y - 9), (width - 40, y - 9), color=(0.85, 0.88, 0.93), width=0.5)

doc.set_metadata({
    "title": "GBPUAT Smart Campus — Platform Walkthrough",
    "author": "GBPUAT Smart Identity",
    "subject": "Logins, screens, flows and features of the smart campus platform",
    "keywords": "GBPUAT, smart identity, verification, library, fests, walkthrough",
    "creator": "scripts/walkthrough/build.mjs",
})

links = sum(len(page.get_links()) for page in doc)
internal = sum(1 for page in doc for l in page.get_links() if l.get("kind") in (fitz.LINK_GOTO, fitz.LINK_NAMED))
doc.save(out, garbage=3, deflate=True)
print(f"pages={total} bookmarks={len(toc)} links={links} (internal {internal})")
