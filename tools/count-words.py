"""统计各篇文章的字数（与 tools/check.py 的自检口径一致）。

口径：CJK 逐字 + 西文按词（连续的字母或数字算一个词）。
不计入：脚注区（.footnotes）、代码块（<pre>）与行内代码（<code>）。

用法：python tools/count-words.py            # 列出全部文章
      python tools/count-words.py 文件名.html # 只看一篇
"""
from __future__ import annotations

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
LATIN_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’\-]*")


def article_body(html: str) -> str:
    body = re.search(r'<div class="article__body" id="article-body">(.*?)\s*</div>\s*\n\s*<footer',
                     html, re.S)
    inner = body.group(1) if body else html
    inner = re.sub(r'<section class="footnotes">.*?</section>', "", inner, flags=re.S)
    inner = re.sub(r"<pre\b.*?</pre>", " ", inner, flags=re.S)
    inner = re.sub(r"<code\b.*?</code>", " ", inner, flags=re.S)
    return re.sub(r"<[^>]+>", " ", inner)


def count(text: str) -> tuple[int, int]:
    return len(CJK.findall(text)), len(LATIN_WORD.findall(text))


def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    posts_dir = os.path.join(ROOT, "posts")
    files = sorted(f for f in os.listdir(posts_dir) if f.endswith(".html") and not f.startswith("_"))
    if only:
        files = [f for f in files if f == only] or [only]

    print("{:<34}{:>7}{:>9}{:>9}".format("文件", "汉字", "西文词", "合计"))
    print("-" * 60)
    for name in files:
        path = os.path.join(posts_dir, name)
        if not os.path.exists(path):
            print("找不到：" + path)
            continue
        with io.open(path, encoding="utf-8") as handle:
            text = article_body(handle.read())
        cjk, latin = count(text)
        print("{:<34}{:>7}{:>9}{:>9}".format(name, cjk, latin, cjk + latin))
    print()
    print("把「合计」填进 assets/index.js 对应记录的 words 字段；自检会核对是否一致。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
