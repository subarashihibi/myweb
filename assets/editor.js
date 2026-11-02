/* ==========================================================================
   写作台逻辑
   --------------------------------------------------------------------------
   · 左侧 Markdown → 右侧实时预览（复用站内文章样式类）
   · 草稿、文章信息自动保存在 localStorage
   · 「生成 HTML」产出可直接替换 posts/xxx.html 的完整文件
   ========================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "ink-paper-draft";
  var OUT_HINT_DEFAULT = "点「生成 HTML」后，这里会出现完整文件内容。";

  function $(selector) { return document.querySelector(selector); }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function today() {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function todayCN() {
    var parts = today().split("-");
    return parts[0] + " 年 " + Number(parts[1]) + " 月 " + Number(parts[2]) + " 日";
  }

  function slugify(text) {
    var slug = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[\s\u3000]+/g, "-")
      .replace(/[^\w-]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    return slug || "my-essay";
  }

  var DEFAULT_DRAFT = [
    "# 标题",
    "",
    ">! 题词：一句引文。",
    ">! —— 出处",
    "",
    "开头段落，直接进入问题。关键术语第一次出现时附原文，如 *ousia*（实体）。",
    "",
    "## 小节标题一",
    "",
    "段落文字。",
    "",
    "> 一段较长的引文，可以跨行。",
    "> —— 作者《书名》页码",
    "",
    "### 更小的一节",
    "",
    "- 要点一",
    "- 要点二",
    "",
    "| 列一 | 列二 |",
    "| --- | --- |",
    "| 内容 | 内容 |",
    "",
    "脚注示例：苏格拉底称自己无知[^1]。",
    "",
    "---",
    "",
    "结尾段落。",
    "",
    "[^1]: 注释正文。"
  ].join("\n");

  /* ---------------- 草稿存取 ---------------- */
  function collect() {
    return {
      title: $("#f-title").value,
      date: $("#f-date").value,
      category: $("#f-category").value,
      tags: $("#f-tags").value,
      slug: $("#f-slug").value,
      summary: $("#f-summary").value,
      md: $("#md").value
    };
  }

  function applyDraft(draft) {
    if (!draft) return;
    $("#f-title").value = draft.title || "";
    $("#f-date").value = draft.date || "";
    $("#f-category").value = draft.category || "";
    $("#f-tags").value = draft.tags || "";
    $("#f-slug").value = draft.slug || "";
    $("#f-summary").value = draft.summary || "";
    $("#md").value = draft.md || "";
  }

  function saveDraft(silent) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(collect()));
      if (!silent) flash("已保存在本机浏览器");
    } catch (e) {
      if (!silent) flash("保存失败：" + e.message);
    }
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------------- 状态提示 ---------------- */
  var hintTimer = null;
  function flash(message) {
    var hint = $("#out-hint");
    if (!hint) return;
    hint.textContent = message;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.textContent = OUT_HINT_DEFAULT; }, 2600);
  }

  /* ---------------- 预览 ---------------- */
  function updatePreview() {
    var preview = $("#preview");
    var source = $("#md").value;
    preview.innerHTML = window.InkMarkdown.toHtml(source);

    var chars = source.replace(/\s/g, "").length;
    var minutes = Math.max(1, Math.round(chars / 350));
    $("#counter").textContent = "约 " + chars + " 字 · 阅读约 " + minutes + " 分钟";
  }

  /* ---------------- 生成完整 HTML ---------------- */
  function termsFromTitle() {
    // 标题栏为空时，用 Markdown 的第一行 H1 作标题
    var first = /^#\s+(.+)$/m.exec($("#md").value);
    return first ? first[1].trim() : "";
  }

  function buildHtml() {
    var data = collect();
    var title = data.title.trim() || termsFromTitle() || "未命名文章";
    var slug = slugify(data.slug || data.title || title);
    var date = data.date.trim() || today();
    var dateCN = (function () {
      var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      return matched ? matched[1] + " 年 " + Number(matched[2]) + " 月 " + Number(matched[3]) + " 日" : date;
    })();
    var category = data.category.trim() || "未分类";
    var tags = data.tags.split(/[,，、\s]+/).filter(function (tag) { return tag.length; });
    var summary = data.summary.trim();

    // 去掉预览时为了做目录生成的临时段落 id（h1 与 section 都不带 id，可安全清理）
    var body = $("#preview").innerHTML.replace(/\sid="section(?:-\d+)?"/g, "").trim();

    var lines = [];
    lines.push("<!DOCTYPE html>");
    lines.push('<html lang="zh-CN" data-theme="light">');
    lines.push("<head>");
    lines.push('<meta charset="utf-8">');
    lines.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    lines.push("<title>" + escapeHtml(title) + " · Rosa's Cafe</title>");
    lines.push('<meta name="description" content="' + escapeHtml(summary) + '">');
    lines.push('<meta name="author" content="站长">');
    lines.push('<link rel="stylesheet" href="../assets/site.css">');
    lines.push("<" + "script>");
    lines.push("  try {");
    lines.push('    var saved = localStorage.getItem("ink-paper-theme");');
    lines.push('    if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");');
    lines.push("  } catch (e) {}");
    lines.push("</" + "script>");
    lines.push("</head>");
    lines.push('<body data-page="post">');
    lines.push("");
    lines.push("<div data-site-header></div>");
    lines.push("");
    lines.push('<div class="article-shell">');
    lines.push('  <article class="article">');
    lines.push("");
    lines.push('    <header class="article__head">');
    lines.push('      <p class="meta article__meta">');
    lines.push('        <span class="meta__date">' + escapeHtml(dateCN) + "</span>");
    lines.push('        <span class="meta__sep">·</span>');
    lines.push('        <a class="chip" href="../topics.html?c=' + encodeURIComponent(category) + '">' + escapeHtml(category) + "</a>");
    tags.forEach(function (tag) {
      lines.push('        <a class="chip" href="../topics.html?t=' + encodeURIComponent(tag) + '">#' + escapeHtml(tag) + "</a>");
    });
    lines.push("      </p>");
    lines.push("");
    lines.push('      <h1 class="article__title">' + escapeHtml(title) + "</h1>");
    lines.push("");
    lines.push('      <p class="article__abstract">');
    lines.push("        " + (summary ? escapeHtml(summary) : "提要：这篇札记处理什么问题，沿着哪条线索推进。"));
    lines.push("      </p>");
    lines.push("");
    lines.push("      <hr>");
    lines.push("    </header>");
    lines.push("");
    lines.push('    <div class="article__body" id="article-body">');
    lines.push("");
    lines.push(body.split("\n").map(function (row) { return row ? "      " + row : ""; }).join("\n"));
    lines.push("");
    lines.push("    </div>");
    lines.push("");
    lines.push('    <footer class="article__foot">');
    lines.push('      <div class="article__tags">');
    tags.forEach(function (tag) {
      lines.push('        <a class="chip" href="../topics.html?t=' + encodeURIComponent(tag) + '">#' + escapeHtml(tag) + "</a>");
    });
    lines.push("      </div>");
    lines.push("");
    lines.push('      <nav class="article__end" aria-label="文章导航">');
    lines.push('        <a href="../archive.html">← 全部文字</a>');
    lines.push('        <span class="pager">');
    lines.push('          <a href="上一篇的文件名.html">← 上一篇：标题</a>');
    lines.push('          <a href="下一篇的文件名.html">下一篇：标题 →</a>');
    lines.push("        </span>");
    lines.push("      </nav>");
    lines.push("    </footer>");
    lines.push("");
    lines.push("  </article>");
    lines.push("");
    lines.push('  <aside class="article-toc" data-toc aria-label="本篇目录"></aside>');
    lines.push("</div>");
    lines.push("");
    lines.push("<div data-site-footer></div>");
    lines.push("");
    lines.push('<script src="../assets/index.js"><\/script>');
    lines.push('<script src="../assets/render.js"><\/script>');
    lines.push("</body>");
    lines.push("</html>");

    return {
      html: lines.join("\n"),
      slug: slug,
      entry: '    {\n' +
        '      file: "posts/' + slug + '.html",\n' +
        '      title: "' + title.replace(/"/g, '\\"') + '",\n' +
        '      date: "' + date + '",\n' +
        '      category: "' + category + '",\n' +
        '      tags: [' + tags.map(function (tag) { return '"' + tag + '"'; }).join(", ") + '],\n' +
        '      summary: "' + summary.replace(/"/g, '\\"') + '"\n' +
        '    },'
    };
  }

  /* ---------------- 复制 / 下载 ---------------- */
  function copyFrom(textarea, message) {
    textarea.removeAttribute("readonly");
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    textarea.setAttribute("readonly", "readonly");
    window.getSelection().removeAllRanges();
    flash(ok ? message : "复制失败，请手动全选复制");
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- 初始化 ---------------- */
  function boot() {
    var md = $("#md");
    if (!md || !window.InkMarkdown) return;

    var draft = loadDraft();
    if (draft) {
      applyDraft(draft);
    } else {
      md.value = DEFAULT_DRAFT;
      $("#f-date").value = today();
    }

    updatePreview();

    // 输入即渲染，稍作节流
    var timer = null;
    md.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        updatePreview();
        saveDraft(true);
      }, 180);
    });

    // 标题变化时，若文件名栏为空则自动生成建议
    var slugTouched = !!$("#f-slug").value;
    $("#f-slug").addEventListener("input", function () { slugTouched = true; });
    $("#f-title").addEventListener("input", function () {
      if (!slugTouched) $("#f-slug").value = slugify(this.value);
      saveDraft(true);
    });

    ["#f-date", "#f-category", "#f-tags", "#f-summary"].forEach(function (selector) {
      var node = $(selector);
      if (node) node.addEventListener("input", function () { saveDraft(true); });
    });

    $("#btn-generate").addEventListener("click", function () {
      var result = buildHtml();
      $("#out").value = result.html + "\n\n<!-- 复制下面这段到 assets/index.js 的 SITE.posts 最前面：\n" +
        result.entry + "\n-->\n";
      $("#out-hint").textContent = "文件名：" + result.slug + ".html　·　点「复制 HTML」即可取用";
      saveDraft(true);
    });

    $("#btn-copy").addEventListener("click", function () {
      if (!$("#out").value) $("#btn-generate").click();
      copyFrom($("#out"), "已复制到剪贴板");
    });

    $("#btn-download").addEventListener("click", function () {
      var name = slugify($("#f-slug").value || $("#f-title").value || "draft");
      download(name + ".md", md.value);
      flash("已下载 " + name + ".md");
    });

    $("#btn-save").addEventListener("click", function () { saveDraft(false); });

    $("#btn-reset").addEventListener("click", function () {
      if (!window.confirm("清空当前草稿？此操作不可撤销。")) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      $("#f-title").value = "";
      $("#f-category").value = "";
      $("#f-tags").value = "";
      $("#f-slug").value = "";
      $("#f-summary").value = "";
      $("#f-date").value = today();
      md.value = DEFAULT_DRAFT;
      $("#out").value = "";
      $("#out-hint").textContent = OUT_HINT_DEFAULT;
      updatePreview();
    });

    // 关闭页面前留一份
    window.addEventListener("beforeunload", function () { saveDraft(true); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* 供离线自测（tools/smoke.js）复用生成逻辑 */
  window.InkEditor = {
    buildHtml: buildHtml,
    slugify: slugify,
    collect: collect,
    updatePreview: updatePreview
  };
})();
