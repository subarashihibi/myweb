"""站点自检：链接、文章元信息、标签分类一致性。

用法：python tools/check.py
不依赖任何第三方库，仅用于本仓库发布前的检查。
"""
from __future__ import annotations

import html
import os
import re
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Windows 控制台默认可能是 GBK，先确保以 UTF-8 输出，避免中文报错信息本身报错
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

LINK_RE = re.compile(r'(?:href|src)\s*=\s*"([^"]+)"')
ENTRY_RE = re.compile(
    r"\{\s*file:\s*\"([^\"]+)\",\s*"
    r"title:\s*\"([^\"]*)\",\s*"
    r"date:\s*\"([^\"]*)\",\s*"
    r"category:\s*\"([^\"]*)\",\s*"
    r"tags:\s*\[([^\]]*)\],\s*"
    r"summary:\s*\"([^\"]*)\"(?:,\s*words:\s*(\d+))?",
    re.S,
)

CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
LATIN_WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’\-]*")


def count_words(html_text: str) -> int:
    """字数：CJK 逐字 + 西文按词（与 tools/count-words.py 同一算法）。

    不计入：脚注区（.footnotes）、代码块（<pre>）与行内代码（<code>）——
    后两者是示例代码，不属于行文，且能让「写作指南里写着自己字数」这种自指保持稳定。
    """
    body = re.search(r'<div class="article__body" id="article-body">(.*?)\s*</div>\s*\n\s*<footer',
                     html_text, re.S)
    inner = body.group(1) if body else html_text
    inner = re.sub(r'<section class="footnotes">.*?</section>', "", inner, flags=re.S)
    inner = re.sub(r"<pre\b.*?</pre>", " ", inner, flags=re.S)
    inner = re.sub(r"<code\b.*?</code>", " ", inner, flags=re.S)
    inner = re.sub(r"<[^>]+>", " ", inner)
    return len(CJK_RE.findall(inner)) + len(LATIN_WORD_RE.findall(inner))

problems: list[str] = []
checked_links = 0


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace("\\", "/")


def read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def walk_html() -> list[str]:
    files = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in {".git", "tools", "__pycache__"}]
        for name in names:
            if name.endswith(".html"):
                files.append(os.path.join(base, name))
    return sorted(files)


def check_links(pages: list[str]) -> None:
    global checked_links
    for page in pages:
        # 以 _ 开头的文件是模板，其中的占位链接不参与检查
        if os.path.basename(page).startswith("_"):
            continue
        text = read(page)
        for raw in LINK_RE.findall(text):
            if raw.startswith(("http://", "https://", "mailto:", "data:", "#")):
                continue
            target = urllib.parse.unquote(raw.split("#")[0].split("?")[0])
            if not target:
                continue
            checked_links += 1
            resolved = os.path.normpath(os.path.join(os.path.dirname(page), target))
            if not os.path.exists(resolved):
                problems.append(f"断链：{rel(page)} → {raw}")


def check_fragment_ids(pages: list[str]) -> None:
    for page in pages:
        if os.path.basename(page).startswith("_"):
            continue
        text = read(page)
        # 代码示例里的 #fn1 之类不算真链接
        text = re.sub(r"<pre.*?</pre>|<code.*?</code>", "", text, flags=re.S)
        ids = set(re.findall(r'\sid="([^"]+)"', text))
        for raw in re.findall(r'href="(#[^"]+)"', text):
            fragment = urllib.parse.unquote(raw[1:])
            if fragment and fragment not in ids:
                problems.append(f"锚点缺失：{rel(page)} → {raw}")


def check_posts() -> dict[str, dict]:
    index_path = os.path.join(ROOT, "assets", "index.js")
    index = read(index_path)
    entries = {}
    for match in ENTRY_RE.finditer(index):
        file_, title, date, category, tags, summary, words = match.groups()
        tags_list = [t.strip().strip('"') for t in tags.split(",") if t.strip()]
        entries[file_] = {
            "file": file_,
            "title": title,
            "date": date,
            "category": category,
            "tags": tags_list,
            "summary": summary,
            "words": int(words) if words else None,
        }

    if not entries:
        problems.append("assets/index.js 中没有解析到任何文章记录")

    for file_, meta in entries.items():
        path = os.path.join(ROOT, file_.replace("/", os.sep))
        if not os.path.exists(path):
            problems.append(f"索引指向的文件不存在：{file_}")
            continue
        text = read(path)

        title_tag = re.search(r"<title>(.*?)</title>", text, re.S)
        if not title_tag:
            problems.append(f"{file_} 缺少 <title>")
        else:
            page_title = html.unescape(title_tag.group(1)).split(" · ")[0].strip()
            if page_title != meta["title"]:
                problems.append(
                    f"标题不一致：{file_}\n    索引 index.js：{meta['title']}\n    文件 <title>：{page_title}"
                )

        h1 = re.search(r'<h1 class="article__title">(.*?)</h1>', text, re.S)
        if not h1:
            problems.append(f"{file_} 缺少 <h1 class=\"article__title\">")
        else:
            page_h1 = html.unescape(h1.group(1)).strip()
            if page_h1 != meta["title"]:
                problems.append(
                    f"标题不一致：{file_}\n    索引 index.js：{meta['title']}\n    正文 h1：{page_h1}"
                )

        if not re.search(r'<meta name="description" content="', text):
            problems.append(f"{file_} 缺少 meta description")

        # 只在头部元信息与文末标签区里查主题、标签，避免把正文里的示例文字误判为登记
        zones = "".join(re.findall(r'<p class="meta article__meta">(.*?)</p>', text, re.S))
        zones += "".join(re.findall(r'<div class="article__tags">(.*?)</div>', text, re.S))
        if f">{meta['category']}</a>" not in zones:
            problems.append(f"分类未出现在文章页元信息中：{file_} → {meta['category']}")
        for tag in meta["tags"]:
            if f"#{tag}</a>" not in zones:
                problems.append(f"标签未出现在文章页元信息中：{file_} → #{tag}")

        if not re.match(r"^\d{4}-\d{2}-\d{2}$", meta["date"]):
            problems.append(f"日期格式应为 YYYY-MM-DD：{file_} → {meta['date']}")
        else:
            # 文章页的日期是手写的，必须与 render.js 的 formatDate() 输出一致（英文格式）
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            year, month, day = meta["date"].split("-")
            expected = f"{months[int(month) - 1]} {int(day)}, {year}"
            shown = re.search(r'<span class="meta__date">(.*?)</span>', text)
            if not shown:
                problems.append(f"文章页缺少 .meta__date：{file_}")
            elif html.unescape(shown.group(1)).strip() != expected:
                problems.append(
                    f"文章页日期与索引不一致：{file_}\n"
                    f"    期望（按 formatDate）：{expected}\n"
                    f"    实际：{html.unescape(shown.group(1)).strip()}"
                )

        # 字数：索引里的 words 必须与实际正文一致（显示与统计都取自它）
        actual = count_words(text)
        if meta["words"] is None:
            problems.append(
                f"索引缺少 words 字段：{file_}\n"
                f"    建议值：words: {actual}"
            )
        elif meta["words"] != actual:
            problems.append(
                f"字数不一致：{file_}\n"
                f"    索引 index.js：{meta['words']}\n"
                f"    实际统计：{actual}"
            )
        if 'data-word-count' not in text:
            problems.append(f"文章页缺少字数占位 <span data-word-count>：{file_}")

    return entries


def check_orphans(pages: list[str], entries: dict[str, dict]) -> None:
    known = {os.path.normpath(e.replace("/", os.sep)).replace("\\", "/") for e in entries}
    for page in pages:
        path = os.path.relpath(page, ROOT).replace("\\", "/")
        basename = os.path.basename(path)
        if path.startswith("posts/") and path not in known and not basename.startswith("_"):
            problems.append(f"文章未登记进 assets/index.js：{path}")


def main() -> int:
    pages = walk_html()
    check_links(pages)
    check_fragment_ids(pages)
    entries = check_posts()
    check_orphans(pages, entries)

    print(f"检查页面：{len(pages)} 个")
    print(f"检查内部链接：{checked_links} 条")
    print(f"检查文章记录：{len(entries)} 条")

    if problems:
        print(f"\n发现 {len(problems)} 个问题：")
        for item in problems:
            print("  ✗ " + item)
        return 1

    print("\n全部通过：链接、锚点、文章元信息均一致。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
