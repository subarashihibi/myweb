"""下载 EB Garamond（SIL OFL，与站名同款巴洛克衬线体）的 woff2 到本地，供站点自托管。

做法与 fetch-zhuque-font.py 同思路：不整包下载，只保留站点真正会用到的子集——
  · 拉丁正字与常用符号（U+0000-00FF、U+2000-206F：含 – — ' ' " " · → ← ❋ 等）
  · 希腊文与希腊文扩展（哲学术语与拉丁转写：λόγος、ἀρχή、κόσμος…）
其余的西里尔、越南文等子集一律丢弃，避免无谓体积。

用法：python tools/fetch-garamond-font.py <站点根目录>
"""
from __future__ import annotations

import io
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(".")
OUT_DIR = os.path.join(ROOT, "assets", "fonts", "eb-garamond")
CSS_URL = ("https://fonts.loli.net/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400"
           "&display=swap")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0 Safari/537.36")

# 站点需要的字符范围（与上面注释一一对应）
WANTED = [(0x0000, 0x00FF), (0x2000, 0x206F),   # 拉丁正字 + 通用标点
          (0x0370, 0x03FF), (0x1F00, 0x1FFF)]   # 希腊文 + 希腊文扩展


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


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


def needed(spec: str) -> bool:
    """该子集是否与站点所需的字符范围有交集。"""
    for low, high in parse_ranges(spec):
        for wlow, whigh in WANTED:
            if low <= whigh and wlow <= high:
                return True
    return False


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    # 清掉上一轮抓下来的文件，避免新旧子集混在一起
    for name in os.listdir(OUT_DIR):
        if name.endswith(".woff2"):
            os.remove(os.path.join(OUT_DIR, name))

    css = fetch(CSS_URL).decode("utf-8")
    blocks = re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)
    print(f"上游 @font-face 数量: {len(blocks)}")

    kept: list[str] = []
    total = 0
    for block in blocks:
        url_match = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        range_match = re.search(r"unicode-range:\s*([^;]+);", block)
        if not url_match or not range_match:
            continue
        if not needed(range_match.group(1)):
            continue                      # 西里尔 / 越南文等：丢弃
        index = len(kept) + 1
        filename = "eb-garamond-%02d.woff2" % index
        path = os.path.join(OUT_DIR, filename)
        with open(path, "wb") as handle:
            handle.write(fetch(url_match.group(1)))
        total += os.path.getsize(path)
        body = re.sub(r"\s*url\(https://[^)]+\.woff2\)", " url(%s)" % filename, block.strip())
        kept.append("@font-face {\n  " + body + "\n}")

    with io.open(os.path.join(OUT_DIR, "site.css"), "w", encoding="utf-8", newline="") as handle:
        handle.write("\n".join(kept) + "\n")

    print(f"保留子集 {len(kept)} 个，共 {total / 1024:.0f} KB（已丢弃用不到的子集）")
    print("输出：" + os.path.join(OUT_DIR, "site.css"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
