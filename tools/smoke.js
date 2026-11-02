/* ==========================================================================
   站点脚本冒烟测试（离线，不需要浏览器）
   --------------------------------------------------------------------------
   用法：node tools/smoke.js <页面.html> [查询串]
     例：node tools/smoke.js index.html
         node tools/smoke.js index.html "" index
         node tools/smoke.js archive.html
         node tools/smoke.js topics.html "?c=认识论"
   做法：用 tools/dom-lite.js 模拟一份够用的 DOM，按真实页面的顺序执行
        assets/index.js 与 assets/render.js，然后断言渲染结果。
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { installGlobals } = require("./dom-lite");

const ROOT = path.resolve(__dirname, "..");
const page = process.argv[2] || "index.html";
const search = process.argv[3] || "";

const html = fs.readFileSync(path.join(ROOT, page), "utf8");
const doc = installGlobals(html);
global.location = { search: search, href: "file:///" + page };

function run(relative) {
  const code = fs.readFileSync(path.join(ROOT, relative), "utf8");
  vm.runInThisContext(code, { filename: relative });
}

run("assets/index.js");

if (page === "write.html") {
  run("assets/md.js");
  run("assets/editor.js");
}
run("assets/render.js");

const failures = [];

function check(label, condition, detail) {
  if (condition) return;
  failures.push(label + (detail ? "　→　" + detail : ""));
}

function text(node) { return node ? node.textContent.trim() : ""; }

/* ---- 页头与页脚 ---- */
check("页头未注入", doc.querySelector(".site-header__title") !== null);
check(
  "站名不正确",
  text(doc.querySelector(".site-header__title")) === SITE.title,
  text(doc.querySelector(".site-header__title"))
);
if (SITE.tagline) {
  check(
    "页头副标题不正确",
    text(doc.querySelector(".site-header__tagline")) === SITE.tagline,
    text(doc.querySelector(".site-header__tagline"))
  );
} else {
  check("副标题留空时不应渲染页头副标题", doc.querySelector(".site-header__tagline") === null);
}
const navLinks = doc.querySelectorAll(".site-nav a");
check("导航项数量不对", navLinks.length === 5, "实际 " + navLinks.length);
check("页脚未注入", doc.querySelector(".site-footer") !== null);


/* ---- 按页面断言 ---- */
if (page === "index.html") {
  // 首页：文章列表（英文界面）。左侧竖排题词与其开关已按需求移除
  check("首页不应再有左侧题词", doc.querySelector(".sidebar-motto, .lead-quote-v") === null);
  check("首页不应再有侧栏开关", doc.querySelector("[data-sidebar-toggle]") === null);
  check("首页不应再有旧版式容器", doc.querySelector(".home-main") === null);
  const items = doc.querySelectorAll("[data-recent-posts] .post-item");
  check("首页未渲染文章列表", items.length > 0, "实际 " + items.length);
  check(
    "首页文章数量与索引不符",
    items.length === Math.min(6, SITE.posts.length),
    "实际 " + items.length
  );
  const titles = items.map((item) => text(item.querySelector(".post-item__title")));
  check("首页第一篇不是最新文章", titles[0] === SITE.posts[0].title, titles[0]);
  check("首页总数未写入", text(doc.querySelector("[data-total-count]")) === String(SITE.posts.length));
  check("首页摘要缺失", items[0].querySelector(".post-item__summary") !== null);
  check("首页元信息图标缺失", items[0].querySelectorAll(".post-meta .icon").length > 0);
  const dates = items.map((item) => text(item.querySelector(".meta__date")));
  check("日期未按英文格式输出", /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(dates[0]), dates[0]);
  // 字数：列表条目显示的「N words」须与索引里的 words 一致
  const wordsShown = text(items[0].querySelector(".meta__words"));
  const wordsExpected = (SITE.posts[0].words || 0).toLocaleString("en-US") + " words";
  check("首页列表未显示字数", /words$/.test(wordsShown), wordsShown || "(空)");
  check("首页字数与索引不一致", wordsShown === wordsExpected, wordsShown + " vs " + wordsExpected);
}

if (page === "archive.html") {
  const groups = doc.querySelectorAll("[data-archive] .section-title");
  check("归档未按年分组", groups.length > 0, "实际 " + groups.length);
  const items = doc.querySelectorAll("[data-archive] .post-item");
  check("归档文章数量与索引不符", items.length === SITE.posts.length, "实际 " + items.length);
  check(
    "归档计数文案不对",
    text(doc.querySelector("[data-result-count]")).indexOf(
      SITE.posts.length + " of " + SITE.posts.length + " posts"
    ) === 0,
    text(doc.querySelector("[data-result-count]"))
  );
  const categories = doc.querySelectorAll("#category option").map((option) => option.value).filter(Boolean);
  check("归档主题下拉为空", categories.length > 0);
  const years = doc.querySelectorAll("#year option").map((option) => option.value).filter(Boolean);
  check("归档年份下拉为空", years.length > 0);
}

if (page === "topics.html") {
  const categoryItems = doc.querySelectorAll("[data-term-categories] li");
  const tagItems = doc.querySelectorAll("[data-term-tags] li");
  check("主题索引为空", categoryItems.length > 0);
  check("标签索引为空", tagItems.length > 0);
  if (search) {
    check("筛选结果区未显示", doc.querySelector("[data-term-result]").hidden === false);
    const items = doc.querySelectorAll("[data-term-posts] .post-item");
    check("筛选结果与索引不符", items.length > 0, "实际 " + items.length);
  } else {
    check("未筛选时结果区应隐藏", doc.querySelector("[data-term-result]").hidden === true);
  }
}

if (page === "write.html") {
  const preview = doc.querySelector("#preview");
  check("写作台预览为空", preview && preview.textContent.length > 0);
  check("写作台未渲染题词", preview && preview.querySelector(".epigraph") !== null);
  check("写作台未渲染表格", preview && preview.querySelector("table") !== null);
  check("写作台未渲染脚注", preview && preview.querySelector(".footnotes") !== null);
  check("字数统计未更新", text(doc.querySelector("#counter")).indexOf("字") !== -1, text(doc.querySelector("#counter")));

  doc.querySelector("#f-title").value = "康德的哥白尼式革命";
  doc.querySelector("#f-slug").value = "kant-copernican-turn";
  doc.querySelector("#f-date").value = "2026-03-01";
  doc.querySelector("#f-category").value = "认识论";
  doc.querySelector("#f-tags").value = "康德, 先验";
  doc.querySelector("#f-summary").value = "先验综合判断如何可能。";

  const result = window.InkEditor.buildHtml();
  check("生成的 HTML 缺少 DOCTYPE", result.html.indexOf("<!DOCTYPE html>") === 0);
  check("生成的 HTML 标题不对", result.html.indexOf("<title>康德的哥白尼式革命 · Rosa's Cafe</title>") !== -1);
  check("生成的 HTML 缺少正文容器", result.html.indexOf('<div class="article__body" id="article-body">') !== -1);
  check("生成的 HTML 未写入日期", result.html.indexOf("2026 年 3 月 1 日") !== -1);
  check("生成的 HTML 未写入主题", result.html.indexOf("topics.html?c=") !== -1);
  check("生成的 HTML 未写入标签", result.html.indexOf("#康德") !== -1);
  check("生成的文件名不对", result.slug === "kant-copernican-turn", result.slug);
  check("索引片段缺少 file 字段", result.entry.indexOf('file: "posts/kant-copernican-turn.html"') !== -1, result.entry);
  check("索引片段缺少 tags", result.entry.indexOf('tags: ["康德", "先验"]') !== -1, result.entry);
  check("生成结果的标签未闭合", (result.html.match(/<\/html>/) || []).length === 1);
}

if (page.indexOf("posts/") === 0) {
  // 字数：文章页元信息里的「N words」须与索引的 words 一致
  const holder = doc.querySelector("[data-word-count]");
  check("文章页缺少字数占位", holder !== null);
  if (holder) {
    const shown = text(holder);
    const current = SITE.posts.filter(function (item) {
      return item.file.indexOf(page.split("/").pop()) !== -1;
    })[0];
    const expected = current && current.words ? current.words.toLocaleString("en-US") + " words" : null;
    check("文章页未渲染字数", /words$/.test(shown), shown || "(空)");
    if (expected) check("文章页字数与索引不一致", shown === expected, shown + " vs " + expected);
  }

  // 目录：文章带 3 个以上小节标题时才生成（现为原原本本的正文，通常不会生成）
  const headings = doc.querySelectorAll("#article-body h2");
  const toc = doc.querySelector("[data-toc] .article-toc__inner");
  if (headings.length >= 3) {
    check("正文有 3 个以上小节标题，却未生成右侧目录", toc !== null);
    if (toc) check("目录条目数为 0", doc.querySelectorAll("[data-toc] a").length > 0);
  } else {
    check("小节标题不足 3 个时不应生成目录", toc === null, "实际生成了目录");
  }
}

/* ---- 输出 ---- */
console.log("页面：" + page + (search ? " " + search : ""));
if (failures.length) {
  console.log("发现 " + failures.length + " 个问题：");
  failures.forEach((item) => console.log("  ✗ " + item));
  process.exit(1);
}
console.log("  ✓ 渲染正常");
