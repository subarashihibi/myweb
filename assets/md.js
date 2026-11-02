/* ==========================================================================
   极简 Markdown 渲染器（仅服务于本站写作台）
   --------------------------------------------------------------------------
   支持：H1–H4、段落、引文与出处、题词（>!）、无序/有序列表与嵌套、表格、
        脚注、分隔花星、图片、行内强调与代码、外链标记 {:target=_blank}
   约定：以「——」开头的引文行排为出处；行首 >! 生成居中题词。
   ========================================================================== */
(function (global) {
  "use strict";

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugify(text) {
    var slug = String(text)
      .trim()
      .toLowerCase()
      .replace(/[\s\u3000]+/g, "-")
      .replace(/[^\w\u4e00-\u9fa5-]/g, "")
      .slice(0, 48);
    return slug || "section";
  }

  /* ---------- 行内 ---------- */
  function inline(text) {
    var codes = [];
    var value = String(text);

    // 先把行内代码抽出来，避免其中的符号被后续规则改写
    value = value.replace(/`([^`]+)`/g, function (_, code) {
      codes.push(code);
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });

    value = escapeHtml(value);

    // [文字](网址){:target=_blank}
    value = value.replace(/\[([^\]]+)\]\(([^)\s]+)\)(?:\{:target=_blank\})?/g, function (_, label, href) {
      href = href.replace(/&amp;/g, "&");
      var external = /^https?:\/\//i.test(href);
      return '<a href="' + href + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">" + label + "</a>";
    });
    value = value.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, src) {
      return '<img src="' + src.replace(/&amp;/g, "&") + '" alt="' + alt + '">';
    });

    value = value.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    value = value.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    value = value.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

    // 脚注引用
    value = value.replace(/\[\^([^\]]+)\]/g, function (_, id) {
      return '<a class="fn-ref" href="#fn-' + slugify(id) + '">[' + id + "]</a>";
    });

    value = value.replace(/\u0000C(\d+)\u0000/g, function (_, index) {
      return "<code>" + escapeHtml(codes[Number(index)]) + "</code>";
    });

    return value;
  }

  /* ---------- 块级 ---------- */
  function markdownToHtml(source) {
    var lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    var footnotes = [];
    var usedSlugs = {};
    var html = [];
    var i = 0;

    function isBlank(line) { return !line || !line.trim().length; }
    function isSep(line) { return /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.indexOf("-") !== -1; }

    function splitRow(line) {
      var row = line.trim();
      if (row.charAt(0) === "|") row = row.slice(1);
      if (row.charAt(row.length - 1) === "|") row = row.slice(0, -1);
      return row.split("|").map(function (cell) { return cell.trim(); });
    }

    function uniqueSlug(text) {
      var base = slugify(text);
      if (!usedSlugs[base]) { usedSlugs[base] = 1; return base; }
      usedSlugs[base] += 1;
      return base + "-" + usedSlugs[base];
    }

    while (i < lines.length) {
      var line = lines[i];

      /* 空行 */
      if (isBlank(line)) { i++; continue; }

      /* 脚注定义 */
      var fn = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
      if (fn) {
        var body = [fn[2]];
        i++;
        while (i < lines.length && !isBlank(lines[i]) && /^\s{2,}\S/.test(lines[i])) {
          body.push(lines[i].trim());
          i++;
        }
        footnotes.push({ id: fn[1], text: body.join(" ") });
        continue;
      }

      /* 分隔花星 */
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { html.push("<hr>"); i++; continue; }

      /* 标题 */
      var heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        var level = heading[1].length;
        var text = heading[2].trim();
        if (level === 1) {
          html.push("<h1>" + inline(text) + "</h1>");
        } else {
          var tag = "h" + level;
          html.push("<" + tag + ' id="' + uniqueSlug(text) + '">' + inline(text) + "</" + tag + ">");
        }
        i++;
        continue;
      }

      /* 表格 */
      if (line.indexOf("|") !== -1 && i + 1 < lines.length && isSep(lines[i + 1]) && lines[i + 1].indexOf("|") !== -1) {
        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && !isBlank(lines[i]) && lines[i].indexOf("|") !== -1) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        var table = ["<table><thead><tr>"];
        head.forEach(function (cell) { table.push("<th>" + inline(cell) + "</th>"); });
        table.push("</tr></thead><tbody>");
        rows.forEach(function (row) {
          table.push("<tr>");
          row.forEach(function (cell) { table.push("<td>" + inline(cell) + "</td>"); });
          table.push("</tr>");
        });
        table.push("</tbody></table>");
        html.push(table.join(""));
        continue;
      }

      /* 引文 / 题词 */
      var quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        var isEpigraph = /^!/.test(quote[1]);
        var buffer = [];
        while (i < lines.length) {
          var q = /^>\s?(.*)$/.exec(lines[i]);
          if (!q) break;
          var content = q[1].replace(/^!\s?/, "");
          buffer.push(content);
          i++;
        }
        var body_ = buffer.join("\n");
        var source_ = "";
        var sourceMatch = /\n\s*——\s*([^\n]+)$/.exec(body_);
        if (sourceMatch) {
          source_ = sourceMatch[1].trim();
          body_ = body_.slice(0, sourceMatch.index).trim();
        }
        var quoteHtml = "<blockquote" + (isEpigraph ? ' class="epigraph"' : "") + ">";
        body_.split(/\n{2,}/).forEach(function (chunk) {
          var text_ = chunk.trim();
          if (text_) quoteHtml += "<p>" + inline(text_).replace(/\n/g, "<br>") + "</p>";
        });
        if (source_) {
          quoteHtml += '<p class="' + (isEpigraph ? "epigraph__source" : "attrib") + '">—— ' + inline(source_) + "</p>";
        }
        quoteHtml += "</blockquote>";
        html.push(quoteHtml);
        continue;
      }

      /* 列表（两级以内，允许条目之间夹空行） */
      if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
        var ordered = /^\s*\d+\.\s+/.test(line);
        var items = [];
        var itemRe = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/;
        while (i < lines.length) {
          if (itemRe.test(lines[i])) {
            var itemMatch = itemRe.exec(lines[i]);
            var indent = itemMatch[1].replace(/\t/g, "  ").length;
            items.push({ depth: indent >= 2 ? 1 : 0, text: itemMatch[2].trim() });
            i++;
            continue;
          }
          // 允许「条目—空行—缩进续行」的写法
          if (isBlank(lines[i]) && i + 1 < lines.length && itemRe.test(lines[i + 1])) { i++; continue; }
          break;
        }
        var outer = ordered ? "ol" : "ul";
        var list = "<" + outer + ">";
        var openInner = false;   // 是否有内层列表处于打开状态
        var openItem = false;    // 是否有外层 <li> 尚未闭合
        items.forEach(function (item) {
          if (item.depth === 1) {
            if (!openInner) { list += "<ul>"; openInner = true; }
            list += "<li>" + inline(item.text) + "</li>";
            return;
          }
          if (openInner) { list += "</ul>"; openInner = false; }
          if (openItem) list += "</li>";
          list += "<li>" + inline(item.text);
          openItem = true;
        });
        if (openInner) list += "</ul>";
        if (openItem) list += "</li>";
        list += "</" + outer + ">";
        html.push(list);
        continue;
      }

      /* 段落 */
      var paragraph = [line];
      i++;
      while (i < lines.length && !isBlank(lines[i]) &&
             !/^(#{1,4}\s|>|\s*(?:[-*+]|\d+\.)\s|\s*(?:-{3,}|\*{3,}|_{3,})\s*$|\[\^[^\]]+\]:)/.test(lines[i])) {
        paragraph.push(lines[i]);
        i++;
      }
      html.push("<p>" + inline(paragraph.join("\n")) + "</p>");
    }

    if (footnotes.length) {
      var notes = ['<section class="footnotes"><h2 class="footnotes__title">注释</h2><ol>'];
      footnotes.forEach(function (note) {
        notes.push('<li id="fn-' + slugify(note.id) + '">' + inline(note.text) +
          ' <a class="footnote-back" href="#article-body">↩</a></li>');
      });
      notes.push("</ol></section>");
      html.push(notes.join(""));
    }

    return html.join("\n");
  }

  global.InkMarkdown = { toHtml: markdownToHtml, slugify: slugify, escapeHtml: escapeHtml };
})(window);
