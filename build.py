"""Inline src/hspr-core.js into src/app.html -> index.html (single self-contained file)."""
from pathlib import Path
root = Path(__file__).parent
page = (root / "src/app.html").read_text(encoding="utf-8")
core = (root / "src/hspr-core.js").read_text(encoding="utf-8")
assert "/*CORE*/" in page
(root / "index.html").write_text(page.replace("/*CORE*/", core), encoding="utf-8")
print("wrote index.html")
