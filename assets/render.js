/* ==========================================================================
   共享渲染逻辑
   --------------------------------------------------------------------------
   · 注入页头（站名 + 导航）与页脚，所有页面只需一个空壳
   · 明暗主题切换（记忆在 localStorage）
   · 文章页自动生成右侧目录
   · 首页 / 归档 / 主题页的文章列表渲染与筛选
   ========================================================================== */
(function () {
  "use strict";

  var THEME_KEY = "ink-paper-theme";
  var ROOT = document.documentElement;

  /* ---------------- 图标（内联 SVG，描边风格，不依赖任何图标字体） ---------------- */
  function icon(paths) {
    return '<svg class="icon" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" ' +
      'focusable="false">' + paths + "</svg>";
  }
  var ICON_HOME = icon('<path d="M3.6 10.6 12 3.8l8.4 6.8"/><path d="M5.8 9.9V19a1 1 0 0 0 1 1h3.1v-4.6h4.2V20h3.1a1 1 0 0 0 1-1V9.9"/>');
  var ICON_ARCHIVE = icon('<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5.2 8.5V19a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V8.5"/><path d="M10 12.6h4"/>');
  var ICON_LIST = icon('<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><path d="M4.6 6.5h.01M4.6 12h.01M4.6 17.5h.01"/>');
  var ICON_TAG = icon('<path d="M11.2 3.6H5.4a1.4 1.4 0 0 0-1.4 1.4v5.8a1.4 1.4 0 0 0 .4 1l6.6 6.6a1.4 1.4 0 0 0 2 0l5.8-5.8a1.4 1.4 0 0 0 0-2L12.2 4a1.4 1.4 0 0 0-1-.4z"/><path d="M8.2 8.2h.01"/>');
  var ICON_USER = icon('<circle cx="12" cy="8.4" r="3.6"/><path d="M5.2 20.2c.6-3.4 3.4-5.4 6.8-5.4s6.2 2 6.8 5.4"/>');
  var ICON_FEATHER = icon('<path d="M19.4 4.6c-2.4 0-6.3.7-9.1 3.5-1.9 1.9-2.7 4-3.2 6.1L4.6 19.4"/><path d="M10.6 13.4 19.4 4.6"/><path d="M13.2 13.4h4.4"/><path d="M10.2 16.6v-3.2"/>');
  var ICON_CALENDAR = icon('<rect x="4" y="5.6" width="16" height="14.4" rx="1.6"/><path d="M8 3.6v3.4M16 3.6v3.4M4 10.4h16"/>');
  var ICON_CLOCK = icon('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>');
  var ICON_BOOK = icon('<path d="M4.4 4.8h5.2a2.4 2.4 0 0 1 2.4 2.4v12a2 2 0 0 0-2-2H4.4z"/><path d="M19.6 4.8h-5.2a2.4 2.4 0 0 0-2.4 2.4v12a2 2 0 0 1 2-2h5.6z"/>');

  /* ---------------- 主题 ---------------- */
  function currentTheme() {
    return ROOT.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function applyTheme(theme) {
    ROOT.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 忽略隐私模式报错 */ }
    updateThemeButtons(theme);
  }
  function updateThemeButtons(theme) {
    var isDark = theme === "dark";
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      // 图标由 CSS 依据 html[data-theme] 切换（日间显月亮、夜间显太阳），
      // 这里只负责无障碍文案与按钮状态
      buttons[i].setAttribute("aria-label", isDark ? "切换到日间阅读" : "切换到夜间阅读");
      buttons[i].title = isDark ? "切换到日间阅读" : "切换到夜间阅读";
      buttons[i].setAttribute("aria-pressed", isDark ? "true" : "false");
      buttons[i].classList.toggle("is-dark", isDark);
    }
  }
  function bindTheme() {
    document.addEventListener("click", function (event) {
      var button = event.target.closest ? event.target.closest("[data-theme-toggle]") : null;
      if (!button) return;
      event.preventDefault();
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
    updateThemeButtons(currentTheme());
  }

  /* ---------------- 小工具 ---------------- */
  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /** 由 YYYY-MM-DD 生成「Aug 27, 2026」（界面为英文） */
  function formatDate(value) {
    if (!value) return "";
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!matched) return value;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var month = months[Number(matched[2]) - 1] || matched[2];
    return month + " " + Number(matched[3]) + ", " + matched[1];
  }
  function postYear(value) {
    var matched = /^(\d{4})/.exec(value || "");
    return matched ? matched[1] : "Undated";
  }

  /** 生成 class 的元素 */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** 元信息行：日期 · 分类 ·（标签）
      opts.icons = true 时用参考站那种「图标 + 竖线分隔」的样式 */
  function metaLine(post, options) {
    var opts = options || {};
    var line = el("p", opts.className || (opts.icons ? "meta post-meta" : "meta"));

    var date = el("span", "meta__date", formatDate(post.date));
    if (opts.icons) {
      var today = el("span", "post-meta-item");
      today.innerHTML = ICON_CALENDAR;
      today.appendChild(date);
      line.appendChild(today);
    } else {
      line.appendChild(date);
    }

    if (post.category) {
      line.appendChild(el("span", "meta__sep", opts.icons ? "|" : "·"));
      if (opts.linkTerms === false) {
        line.appendChild(el("span", "meta__category", post.category));
      } else if (opts.icons) {
        var catWrap = el("span", "post-meta-item");
        catWrap.innerHTML = ICON_TAG;
        var catLink = el("a", null, post.category);
        catLink.href = "topics.html?c=" + encodeURIComponent(post.category);
        catWrap.appendChild(catLink);
        line.appendChild(catWrap);
      } else {
        var cat = el("a", "chip", post.category);
        cat.href = "topics.html?c=" + encodeURIComponent(post.category);
        line.appendChild(cat);
      }
    }

    if (opts.icons && post.words) {
      line.appendChild(el("span", "meta__sep", "|"));
      var words = el("span", "post-meta-item");
      words.innerHTML = ICON_CLOCK + '<span class="meta__words">' + formatNumber(post.words) + " words</span>";
      line.appendChild(words);
    }

    if (opts.showTags && post.tags && post.tags.length) {
      post.tags.forEach(function (tag) {
        var chip = el("a", "chip", "#" + tag);
        chip.href = "topics.html?t=" + encodeURIComponent(tag);
        line.appendChild(chip);
      });
    }
    return line;
  }

  /** 数字加千分位 */
  function formatNumber(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /** 在文章页把索引里登记的字数渲染出来（元信息行内，位于分类之后） */
  function renderWordCount() {
    var meta = $(".article__meta");
    if (!meta) return;
    var file = (location.pathname || "").split("/").pop();
    var post = (SITE.posts || []).filter(function (item) {
      return item.file.split("/").pop() === file;
    })[0];
    var holder = $("[data-word-count]");
    if (!post || !post.words || !holder) return;
    holder.innerHTML = ICON_CLOCK + '<span class="meta__words">' + formatNumber(post.words) + " words</span>";
  }

  /** 把文章渲染成列表项（结构对齐参考站：居中标题 + 元信息 + 提要 + 篇末花饰） */
  function renderPostItem(post) {
    var item = el("article", "post-item");

    var head = el("header", "post-item__head");
    var title = el("h2", "post-item__title");
    var link = el("a", "post-item__title-link", post.title);
    link.href = post.file;
    title.appendChild(link);
    head.appendChild(title);
    head.appendChild(metaLine(post, { showTags: false, icons: true }));
    item.appendChild(head);

    if (post.summary) {
      var body = el("div", "post-item__body");
      body.appendChild(el("p", "post-item__summary", post.summary));
      item.appendChild(body);
    }

    var more = el("a", "post-item__more", "Read more →");
    more.href = post.file;
    item.appendChild(more);

    // 篇末花饰：参考站每篇之间有一个小分隔符
    item.appendChild(el("div", "post-eof", "❋"));
    return item;
  }

  /** 把文章数组渲染进某个容器（生成 <ul class="post-list"> 或空状态） */
  function renderPostList(container, posts, emptyText) {
    if (!container) return;
    container.textContent = "";
    if (!posts || !posts.length) {
      container.appendChild(el("p", "empty-state", emptyText || "Nothing here yet."));
      return;
    }
    var list = el("ul", "post-list");
    posts.forEach(function (post) {
      var li = document.createElement("li");
      li.appendChild(renderPostItem(post));
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  /** 按年分组 */
  function groupByYear(posts) {
    var years = [];
    var groups = {};
    posts.forEach(function (post) {
      var year = postYear(post.date);
      if (!groups[year]) { groups[year] = []; years.push(year); }
      groups[year].push(post);
    });
    years.sort(function (a, b) { return b.localeCompare(a); });
    return years.map(function (year) { return { year: year, posts: groups[year] }; });
  }

  /* ---------------- 页头 / 页脚 ---------------- */
  /* 导航：英文单字 + 小图标（与参考站一致，图标为内联 SVG，离线可用） */
  var NAV = [
    { href: "index.html", label: "Home", match: "home", icon: ICON_HOME },
    { href: "archive.html", label: "Archives", match: "archive", icon: ICON_ARCHIVE },
    { href: "topics.html", label: "Categories", match: "topics", icon: ICON_LIST },
    { href: "about.html", label: "Guestbook", match: "about", icon: ICON_USER },
    { href: "write.html", label: "Journal", match: "write", icon: ICON_FEATHER }
  ];

  function renderHeader() {
    var host = $("[data-site-header]");
    if (!host) return;

    var skip = el("a", "skip-link", "Skip to content");
    skip.href = "#main";

    var header = el("header", "site-header");
    var inner = el("div", "site-header__inner");

    var brand = el("a", "site-header__brand");
    brand.href = "index.html";
    var title = el("span", "site-header__title", SITE.title);
    brand.appendChild(title);
    // 副标题留空时整行不渲染，页头更简洁
    if (SITE.tagline) brand.appendChild(el("span", "site-header__tagline", SITE.tagline));
    inner.appendChild(brand);

    var util = el("div", "site-header__util");

    // 光照控制（夜间模式开关）：页头最右侧。图标为咖啡杯，
    // 日间显示满杯（咖啡液面高）、夜间显示空杯（液面降到底部），由 CSS 依据主题过渡
    var THEME_ICON_CUP =
      '<svg class="util__icon util__icon--cup" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">' +
      // 热气（日间显示，夜间淡出）
      '<path class="util__icon-steam" d="M9.4 3.2v2.2M13.4 2.4v3"/>' +
      // 杯身
      '<path d="M4.6 9.2h11.4v5.6a3.9 3.9 0 0 1-3.9 3.9H8.5a3.9 3.9 0 0 1-3.9-3.9z"/>' +
      // 杯耳
      '<path d="M16 10.4h1.3a2.4 2.4 0 0 1 0 4.8H16"/>' +
      // 咖啡液面：满杯时高度 4.7，空杯时 0（CSS 过渡）
      '<rect class="util__icon-fill" x="6.3" y="11.8" width="8" height="4.7" rx="1"/></svg>';
    var themeBtn = el("button", "util util--icon");
    themeBtn.type = "button";
    themeBtn.setAttribute("data-theme-toggle", "");
    themeBtn.innerHTML = THEME_ICON_CUP;
    util.appendChild(themeBtn);

    header.appendChild(inner);

    // 导航与站名同一行：英文单字 + 小图标
    var nav = el("nav", "site-nav");
    nav.setAttribute("aria-label", "Main navigation");
    var navInner = el("div", "site-nav__inner");
    NAV.forEach(function (item) {
      var link = el("a", null);
      link.href = item.href;
      link.setAttribute("data-nav", item.match);
      link.innerHTML = item.icon + '<span class="site-nav__label">' + item.label + "</span>";
      navInner.appendChild(link);
    });
    nav.appendChild(navInner);
    inner.appendChild(nav);
    // 光照控制放在导航之后 → 永远是最右侧
    inner.appendChild(util);

    host.appendChild(skip);
    host.appendChild(header);
  }

  function renderFooter() {
    var host = $("[data-site-footer]");
    if (!host) return;

    var footer = el("footer", "site-footer");
    var inner = el("div", "site-footer__inner");

    // 只保留版权行（浅灰小字）；原先的「关于 · 写作台 · 纯 HTML 手写…」已移除
    var left = el("p", null, "© " + SITE.copyrightFrom + "–" + new Date().getFullYear() + " " + SITE.title + " · " + SITE.author);
    left.style.margin = "0";
    inner.appendChild(left);

    footer.appendChild(inner);
    host.appendChild(footer);
  }

  function markCurrentNav() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    $$("[data-nav]").forEach(function (link) {
      if (link.getAttribute("data-nav") === page) link.setAttribute("aria-current", "page");
    });
  }

  /* ---------------- 文章目录 ---------------- */
  function renderTOC() {
    var body = $("#article-body");
    var host = $("[data-toc]");
    if (!body || !host) return;

    /** 只取正文里的标题，注释、相关阅读之类的小节标题不参与目录 */
    function headingsOf(node) {
      return $$("h2, h3", node).filter(function (item) {
        return !item.closest(".footnotes, .related, .article__foot");
      });
    }

    // 若标题未写 id，则依据标题文字生成一个，保证目录锚点可用
    var used = {};
    headingsOf(body).forEach(function (heading) {
      if (heading.id) { used[heading.id] = true; return; }
      var slug = (heading.textContent || "")
        .trim()
        .toLowerCase()
        .replace(/[\s\u3000]+/g, "-")
        .replace(/[^\w\u4e00-\u9fa5-]/g, "")
        .slice(0, 48);
      if (!slug) slug = "section";
      var candidate = slug;
      var n = 2;
      while (used[candidate]) { candidate = slug + "-" + n; n++; }
      heading.id = candidate;
      used[candidate] = true;
    });

    var headings = headingsOf(body).filter(function (node) { return !!node.id; });
    if (headings.length < 3) return;

    var title = el("p", "article-toc__title", "本篇目录");
    var list = el("ol");
    var links = [];

    headings.forEach(function (heading) {
      var li = el("li", heading.tagName === "H3" ? "toc-h3" : "toc-h2");
      var link = el("a", null, heading.textContent);
      link.href = "#" + heading.id;
      li.appendChild(link);
      list.appendChild(li);
      links.push({ link: link, heading: heading });
    });

    var inner = el("div", "article-toc__inner");
    inner.appendChild(title);
    inner.appendChild(list);
    host.appendChild(inner);

    var shell = $(".article-shell");
    if (shell) shell.classList.add("article-shell--with-toc");

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (item) {
            item.link.classList.toggle("is-current", item.heading === entry.target);
          });
        });
      }, { rootMargin: "-12% 0px -72% 0px", threshold: 0 });
      headings.forEach(function (heading) { observer.observe(heading); });
    }
  }

  /* ---------------- 首页 ----------------
     首页目前只放题词，不再自动列出文章（列表见 archive.html）。
     若以后想恢复「近期文字」，把 data-recent-posts 容器加回 index.html 即可。 */
  function initHome() {
    var host = $("[data-recent-posts]");
    if (host) {
      renderPostList(host, SITE.posts.slice(0, 6), "No posts yet.");
    }
    var counter = $("[data-total-count]");
    if (counter) counter.textContent = SITE.posts.length;

    var latest = SITE.posts[0];
    var stamp = $("[data-last-updated]");
    if (stamp && latest) stamp.textContent = formatDate(latest.date);
  }

  /* ---------------- 归档 ---------------- */
  function postHaystack(post) {
    return [post.title, post.summary, post.category, (post.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
  }

  function initArchive() {
    var host = $("[data-archive]");
    if (!host) return;

    var searchInput = $("#q");
    var yearSelect = $("#year");
    var categorySelect = $("#category");
    var countLabel = $("[data-result-count]");
    var resetButton = $("[data-reset]");

    var categories = [];
    SITE.posts.forEach(function (post) {
      if (post.category && categories.indexOf(post.category) === -1) categories.push(post.category);
    });
    categories.sort(function (a, b) { return a.localeCompare(b, "zh-Hans-CN"); });

    if (categorySelect) {
      categories.forEach(function (name) {
        var option = el("option", null, name);
        option.value = name;
        categorySelect.appendChild(option);
      });
    }
    if (yearSelect) {
      groupByYear(SITE.posts).forEach(function (group) {
        var option = el("option", null, group.year + " 年");
        option.value = group.year;
        yearSelect.appendChild(option);
      });
    }

    // 支持从别处带参数进入：archive.html?year=2026&category=认识论
    var params = new URLSearchParams(window.location.search);
    if (searchInput && params.get("q")) searchInput.value = params.get("q");
    if (yearSelect && params.get("year")) yearSelect.value = params.get("year");
    if (categorySelect && params.get("category")) categorySelect.value = params.get("category");

    function render() {
      var keyword = searchInput ? searchInput.value.trim().toLowerCase() : "";
      var year = yearSelect ? yearSelect.value : "";
      var category = categorySelect ? categorySelect.value : "";

      var filtered = SITE.posts.filter(function (post) {
        if (year && postYear(post.date) !== year) return false;
        if (category && post.category !== category) return false;
        if (keyword) {
          var hit = postHaystack(post).indexOf(keyword) !== -1;
          if (!hit) return false;
        }
        return true;
      });

      host.textContent = "";
      var groups = groupByYear(filtered);
      if (!groups.length) {
        host.appendChild(el("p", "empty-state", "No posts match these filters."));
      } else {
        groups.forEach(function (group) {
          var heading = el("h2", "section-title", group.year + " · " + group.posts.length + " posts");
          host.appendChild(heading);
          var box = el("div");
          renderPostList(box, group.posts);
          host.appendChild(box);
        });
      }
      if (countLabel) countLabel.textContent = filtered.length + " of " + SITE.posts.length + " posts";
    }

    [searchInput, yearSelect, categorySelect].forEach(function (control) {
      if (!control) return;
      control.addEventListener("input", render);
      control.addEventListener("change", render);
    });
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        if (searchInput) searchInput.value = "";
        if (yearSelect) yearSelect.value = "";
        if (categorySelect) categorySelect.value = "";
        render();
      });
    }
    render();
  }

  /* ---------------- 主题与标签索引 ---------------- */
  function termMap(key) {
    var map = {};
    SITE.posts.forEach(function (post) {
      var values = key === "category" ? [post.category] : (post.tags || []);
      values.forEach(function (value) {
        if (!value) return;
        map[value] = (map[value] || 0) + 1;
      });
    });
    return map;
  }

  function initTopics() {
    var categoryHost = $("[data-term-categories]");
    var tagHost = $("[data-term-tags]");
    if (!categoryHost && !tagHost) return;

    var params = new URLSearchParams(window.location.search);
    var activeCategory = params.get("c") || "";
    var activeTag = params.get("t") || "";

    function fill(host, map, param) {
      if (!host) return;
      var names = Object.keys(map).sort(function (a, b) { return a.localeCompare(b, "zh-Hans-CN"); });
      host.textContent = "";
      if (!names.length) {
        host.appendChild(el("li", null, "暂无"));
        return;
      }
      names.forEach(function (name) {
        var li = document.createElement("li");
        var link = el("a", null, name);
        link.href = "topics.html?" + param + "=" + encodeURIComponent(name);
        var isActive = (param === "c" && name === activeCategory) || (param === "t" && name === activeTag);
        if (isActive) link.classList.add("is-active");
        li.appendChild(link);
        li.appendChild(el("span", "term-list__count", map[name] + (map[name] > 1 ? " posts" : " post")));
        host.appendChild(li);
      });
    }

    fill(categoryHost, termMap("category"), "c");
    fill(tagHost, termMap("tag"), "t");

    var heading = $("[data-term-heading]");
    // 页面抬头只剩一行英文（.eyebrow），筛选时改这一行来指明当前条件
    var eyebrow = $(".page-head .eyebrow");
    var eyebrowDefault = eyebrow ? eyebrow.textContent : "";
    var activeLabel = activeCategory || activeTag;

    if (activeLabel) {
      if (heading) heading.textContent = activeLabel;
      if (eyebrow) eyebrow.textContent = activeCategory ? activeLabel : "#" + activeLabel;
      var posts = SITE.posts.filter(function (post) {
        if (activeCategory) return post.category === activeCategory;
        return (post.tags || []).indexOf(activeTag) !== -1;
      });
      renderPostList($("[data-term-posts]"), posts, "这个话题下还空着。");
      var box = $("[data-term-result]");
      if (box) box.hidden = false;
    } else if (eyebrow) {
      eyebrow.textContent = eyebrowDefault;
    }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    renderHeader();
    renderFooter();
    markCurrentNav();
    bindTheme();
    renderTOC();
    renderWordCount();
    initHome();
    initArchive();
    initTopics();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* 暴露给写作台等页面复用 */
  window.InkPaper = {
    formatDate: formatDate,
    renderPostItem: renderPostItem,
    renderPostList: renderPostList,
    el: el
  };
})();
