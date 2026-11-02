/* ==========================================================================
   极小的 DOM 模拟层（仅用于本仓库的离线自测 tools/smoke.js）
   覆盖站点脚本用到的那部分 API：querySelector(All)、closest、createElement、
   appendChild、classList、textContent、innerHTML、localStorage、URLSearchParams 等。
   目标不是完整实现 DOM，而是让 assets/*.js 能在 node 里跑一遍并断言输出。
   ========================================================================== */
"use strict";

function matchesSelector(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  var sel = selector.trim();

  if (sel.indexOf(",") !== -1) {
    return sel.split(",").some(function (part) { return matchesSelector(node, part.trim()); });
  }

  // 形如 ".a .b" 的复合选择器：末端匹配 + 祖先匹配即可（自测场景足够）
  var parts = sel.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    if (!matchesSelector(node, parts[parts.length - 1])) return false;
    var rest = parts.slice(0, parts.length - 1).join(" ");
    var ancestor = node.parentNode;
    while (ancestor) {
      if (ancestor.nodeType === 1 && matchesSelector(ancestor, rest)) return true;
      ancestor = ancestor.parentNode;
    }
    return false;
  }

  if (sel.charAt(0) === "#") return node.id === sel.slice(1);

  var attrMatch = /^([a-zA-Z][\w-]*)?\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel);
  if (attrMatch) {
    if (attrMatch[1] && node.tagName.toLowerCase() !== attrMatch[1].toLowerCase()) return false;
    if (!node.hasAttribute(attrMatch[2])) return false;
    if (attrMatch[3] !== undefined && node.getAttribute(attrMatch[2]) !== attrMatch[3]) return false;
    return true;
  }

  var classAndTag = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)$/.exec(sel);
  if (classAndTag) {
    if (classAndTag[1] && node.tagName.toLowerCase() !== classAndTag[1].toLowerCase()) return false;
    var classes = (classAndTag[2] || "").split(".").filter(Boolean);
    return classes.every(function (name) { return node.classList.contains(name); });
  }

  return false;
}

class ClassList {
  constructor(node) { this.node = node; }
  get _list() { return (this.node.className || "").split(/\s+/).filter(Boolean); }
  _set(list) { this.node.className = list.join(" "); }
  contains(name) { return this._list.indexOf(name) !== -1; }
  add() {
    var list = this._list;
    for (var i = 0; i < arguments.length; i++) if (list.indexOf(arguments[i]) === -1) list.push(arguments[i]);
    this._set(list);
  }
  remove() {
    var list = this._list;
    for (var i = 0; i < arguments.length; i++) {
      var at = list.indexOf(arguments[i]);
      if (at !== -1) list.splice(at, 1);
    }
    this._set(list);
  }
  toggle(name, force) {
    var has = this.contains(name);
    var on = force === undefined ? !has : !!force;
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

class Element {
  constructor(tagName, doc) {
    this.nodeType = 1;
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = doc;
    this.childNodes = [];
    this.attributes = {};
    this.className = "";
    this.id = "";
    this.style = {};
    this._hidden = false;
    this.value = "";
    this._text = "";
    // 媒体元素（audio）所需的兜底属性，避免自测时报 undefined
    this.paused = true;
    this.ended = false;
    this.duration = NaN;
    this.currentTime = 0;
    this.volume = 1;
    this.loop = false;
    this.src = "";
    this.classList = new ClassList(this);
  }
  play() { this.paused = false; this.ended = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  get hidden() { return this._hidden || this.hasAttribute("hidden"); }
  set hidden(value) {
    this._hidden = !!value;
    if (value) this.setAttribute("hidden", "");
    else this.removeAttribute("hidden");
  }
  get children() { return this.childNodes.filter(function (n) { return n.nodeType === 1; }); }
  get firstChild() { return this.childNodes[0] || null; }
  get parentNode() { return this._parent || null; }
  set parentNode(node) { this._parent = node; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") this.className = String(value);
    if (name === "id") this.id = String(value);
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(node) {
    if (node && node._isFragment) {
      node.childNodes.slice().forEach((child) => this.appendChild(child));
      return node;
    }
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  removeChild(node) {
    var at = this.childNodes.indexOf(node);
    if (at !== -1) this.childNodes.splice(at, 1);
    node.parentNode = null;
    return node;
  }
  get textContent() {
    if (this.childNodes.length) {
      return this.childNodes.map(function (n) { return n.textContent; }).join("");
    }
    return this._text;
  }
  set textContent(value) {
    this.childNodes = [];
    this._text = value === undefined || value === null ? "" : String(value);
  }
  get innerHTML() {
    return this.childNodes.map(function (node) { return node.outerHTML; }).join("");
  }
  set innerHTML(html) {
    this.childNodes = [];
    this._text = "";
    var doc = this.ownerDocument;
    this.appendChild(doc.parseFragment(String(html)));
  }
  get outerHTML() {
    if (this.nodeType === 3) return this._text;
    var tag = this.tagName.toLowerCase();
    var attrs = Object.keys(this.attributes)
      .map((name) => " " + name + '="' + this.attributes[name] + '"')
      .join("");
    return "<" + tag + attrs + ">" + this.innerHTML + "</" + tag + ">";
  }
  closest(selector) {
    var node = this;
    while (node && node.nodeType === 1) {
      if (matchesSelector(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelector(selector) {
    var found = null;
    this._walk(function (node) {
      if (!found && node !== this && matchesSelector(node, selector)) found = node;
    });
    return found;
  }
  querySelectorAll(selector) {
    var out = [];
    this._walk(function (node) {
      if (node !== this && matchesSelector(node, selector)) out.push(node);
    });
    return out;
  }
  _walk(visit) {
    this.childNodes.forEach(function (child) {
      visit(child);
      if (child._walk) child._walk(visit);
    });
  }
  addEventListener(type, handler) {
    if (!this._listeners) this._listeners = {};
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }
  removeEventListener(type, handler) {
    if (!this._listeners || !this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(function (item) { return item !== handler; });
  }
  /** 自测用：真正派发一次事件（真实浏览器里由用户操作触发） */
  dispatch(type) {
    var handlers = (this._listeners && this._listeners[type]) || [];
    handlers.slice().forEach((handler) => handler.call(this, { type: type, target: this, preventDefault() {} }));
  }
  setSelectionRange() {}
  select() {}
  click() { this.dispatch("click"); }
  getSelection() { return { removeAllRanges: function () {} }; }
}

class Document extends Element {
  constructor() {
    super("#document", null);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.documentElement = new Element("html", this);
    this.body = new Element("body", this);
    this.readyState = "complete";
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }
  createElement(tag) { return new Element(tag, this); }
  createTextNode(text) { var node = new Element("#text", this); node.nodeType = 3; node._text = String(text); return node; }
  createDocumentFragment() { var frag = new Element("#fragment", this); frag._isFragment = true; return frag; }
  _parse() { this.body.innerHTML = this._sourceHtml || ""; }
  parseFragment(html) { var box = new Element("div", this); parseInto(box, html, this); return box; }
}

/* ---- 一个够用的 HTML 解析器：只处理标签、属性与文本 ---- */
function parseInto(parent, html, doc) {
  var token = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  var stack = [parent];
  var last = 0;
  var match;

  function pushText(text) {
    if (!text) return;
    if (!text.trim() && !/[^\s]/.test(text)) text = " ";  // 折叠纯空白
    if (text === " ") return;
    var node = doc.createTextNode(text);
    node.parentNode = stack[stack.length - 1];
    stack[stack.length - 1].childNodes.push(node);
  }

  while ((match = token.exec(html))) {
    pushText(html.slice(last, match.index));
    last = token.lastIndex;

    if (match[0].indexOf("<!--") === 0 || match[0].indexOf("<!") === 0) continue;

    if (match[1]) {                                  // 结束标签
      for (var i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === match[1].toLowerCase()) { stack.length = i; break; }
      }
      continue;
    }

    var tag = match[2];
    var attrs = match[3] || "";
    var selfClosing = match[4] === "/" || /^(br|hr|img|meta|link|input|source)$/i.test(tag);
    var node = doc.createElement(tag);

    var attrRe = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
    var attr;
    while ((attr = attrRe.exec(attrs))) {
      node.setAttribute(attr[1], attr[2] !== undefined ? attr[2] : attr[3] !== undefined ? attr[3] : attr[4] !== undefined ? attr[4] : "");
    }

    node.parentNode = stack[stack.length - 1];
    stack[stack.length - 1].childNodes.push(node);
    if (!selfClosing) stack.push(node);
  }
  pushText(html.slice(last));
}

/* ---- 把页面 HTML 变成可查询的 document ---- */
function createDocument(html) {
  var doc = new Document();
  var bodyMatch = /<body([^>]*)>([\s\S]*?)<\/body>/i.exec(html);
  var bodyAttrs = bodyMatch ? bodyMatch[1] : "";
  var bodyHtml = bodyMatch ? bodyMatch[2] : html;
  var attrRe = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  var attr;
  while ((attr = attrRe.exec(bodyAttrs))) {
    doc.body.setAttribute(attr[1], attr[2] === undefined ? "" : attr[2]);
  }
  doc.body.childNodes = [];
  parseInto(doc.body, bodyHtml, doc);
  return doc;
}

/* ---- 全局环境 ---- */
function installGlobals(html) {
  var doc = createDocument(html);
  var storage = {};

  global.window = global;
  global.document = doc;
  // 浏览器里 window 也是事件目标，这里补上最小实现
  if (typeof global.addEventListener !== "function") {
    global.addEventListener = function () {};
    global.removeEventListener = function () {};
  }
  global.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem: function (key, value) { storage[key] = String(value); },
    removeItem: function (key) { delete storage[key]; }
  };
  global.location = { search: "", href: "file:///index.html" };
  // node 自带只读的 navigator，这里按需覆盖
  try {
    Object.defineProperty(global, "navigator", {
      value: { userAgent: "node" },
      configurable: true,
      writable: true
    });
  } catch (e) { /* 已有 navigator 时忽略 */ }
  global.URLSearchParams = URLSearchParams;
  global.URL = URL;
  global.Blob = global.Blob || function () {};
  global.console = console;
  return doc;
}

module.exports = { createDocument, installGlobals, matchesSelector };
