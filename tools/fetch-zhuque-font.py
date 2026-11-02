"""把朱雀仿宋（Zhuque Fangsong）按站点实际用字下载为本地字体。

做法：
  1. 取上游 result.css（185 个 unicode-range 子集）
  2. 扫描站点所有可见文本，挑出真正被用到的子集
  3. 只下载这些 woff2，并生成一份 url 指向本地的 site.css
这样站点离线可用，体积只占完整字体的一部分。

用法：python tools/fetch-zhuque-font.py <站点根目录>
"""
from __future__ import annotations

import io
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(".")
BASE = "https://blog.yanyuteng.cn/font/ZhuqueFangsong/"
OUT_DIR = os.path.join(ROOT, "assets", "fonts", "zhuque-fangsong")

SOURCES = ["index.html", "archive.html", "topics.html", "about.html", "write.html",
           "posts/ancient-greek-philosophy.html", "posts/what-is-romanticism.html",
           "posts/writing-guide.html", "posts/_template.html",
           "assets/index.js", "assets/render.js"]

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; local-blog-font-fetch)"}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def strip_html(text: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<!--[\s\S]*?-->", " ", text)
    return re.sub(r"<[^>]+>", " ", text)


def collect_characters() -> set[str]:
    chars: set[str] = set()
    for relative in SOURCES:
        path = os.path.join(ROOT, relative.replace("/", os.sep))
        if not os.path.exists(path):
            continue
        with io.open(path, encoding="utf-8") as handle:
            raw = handle.read()
        chars.update(strip_html(raw) if relative.endswith(".html") else raw)
    return chars


def parse_ranges(spec: str) -> list[tuple[int, int]]:
    ranges = []
    for part in spec.split(","):
        part = part.strip()
        if part.startswith("U+"):
            part = part[2:]
        if not part:
            continue
        if "-" in part:
            low, high = part.split("-", 1)
            ranges.append((int(low, 16), int(high, 16)))
        else:
            value = int(part, 16)
            ranges.append((value, value))
    return ranges


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    characters = collect_characters()
    print(f"站点去重字符 {len(characters)} 个")
    print("下载上游 result.css …")
    css = fetch(BASE + "result.css").decode("utf-8")
    with io.open(os.path.join(OUT_DIR, "result.css"), "w", encoding="utf-8", newline="") as handle:
        handle.write(css)

    blocks = re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)
    kept, total_bytes = [], 0
    for block in blocks:
        url_match = re.search(r"url\(([^)]+)\)", block)
        range_match = re.search(r"unicode-range:\s*([^;}]+)", block)
        if not url_match or not range_match:
            continue
        filename = url_match.group(1).strip().lstrip("./")
        covered = set()
        for low, high in parse_ranges(range_match.group(1)):
            if high - low > 0x2000:
                continue
            covered.update(range(low, high + 1))
        if not any(ord(c) in covered for c in characters):
            continue

        target = os.path.join(OUT_DIR, filename)
        if not os.path.exists(target):
            data = fetch(BASE + filename)
            with open(target, "wb") as handle:
                handle.write(data)
        total_bytes += os.path.getsize(target)
        # 生成指向本地文件的 @font-face
        kept.append(
            "@font-face{"
            'font-family:"Zhuque Fangsong (technical preview)";'
            f'src:local("Zhuque Fangsong (technical preview)"),url({filename}) format("woff2");'
            "font-style:normal;font-display:swap;font-weight:400;"
            f"unicode-range:{range_match.group(1).strip()}"
            "}"
        )

    site_css = "\n".join(kept) + "\n"
    with io.open(os.path.join(OUT_DIR, "site.css"), "w", encoding="utf-8", newline="") as handle:
        handle.write(site_css)

    print(f"保留子集 {len(kept)} / {len(blocks)}")
    print(f"本地字体体积 {total_bytes / 1024 / 1024:.2f} MB")
    print("输出：" + os.path.join(OUT_DIR, "site.css"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
