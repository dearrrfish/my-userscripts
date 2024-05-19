// ==UserScript==
// @name             Miniflux Personal Scripts
// @namespace        https://userscript.yjin.dev
// @match            https://miniflux.yjin.dev
// @version          1.0
// ==/UserScript==

const Pages = {
  Unread: 1,
  Feeds: 2,
  Categories: 3,
  Category: 4,
  Entries: 5,
  Entry: 6,
  Unknown: 0,
};

let PAGE = Pages.Unknown;
const path = window.location.pathname;
if (path.includes("/unread")) {
  PAGE = Pages.Unread;
} else if (path.includes("/feeds")) {
  PAGE = Pages.Feeds;
} else if (path.includes("/categories")) {
  PAGE = Pages.Categories;
} else if (path.endsWith("/entries")) {
  PAGE = path.startsWith("/category") ? Pages.Category : Pages.Entries;
} else if (/(category|feed)\/\d+\/entry\/\d+/.test(path)) {
  PAGE = Pages.Entry;
}

const ENTRY_ANCHOR_MARKS = [
  ["【", "】"],
  ["", "、"],
];

const ENTRY_ANCHOR_REGEX = new RegExp(
  `\\s*(${ENTRY_ANCHOR_MARKS.map(([pre, suf]) => "(" + pre + "\\s*\\d+\\s*" + suf + ")").join("|")})`,
  "g",
);

const entryAnchors = {
  ready: false,
  index: -1,
  list: [],
};

const getSorter = () => {
  const cateSelector = PAGE === Pages.Categories ? ".item-title" : ".category";
  return (a, b) =>
    [a, b].reduce((r, v, i) => {
      const op = i === 0 ? 1 : -1;
      const c = v.querySelector(cateSelector).innerText;
      r += op * (c.includes("📺") ? 1 : 0);
      r += op * (v.className.includes("-has-unread") ? 0 : 2);
      return r;
    }, 0);
};

const curItem = () => document.querySelector(".item.current-item");
// const firstItem = () => document.querySelector('.item:first-child');

const setArticleState = (a, newState = "") => {
  if (newState === "") {
    newState = a.className.includes("-status-unread") ? "read" : "unread";
  }
  const btn = a.querySelector("ul.item-meta-icons > li:first-child a");
  if (btn) {
    const curState = btn.getAttribute("data-value");
    if (newState !== curState) {
      btn.click();
    }
  }
};

const batchSetArticleStates = (as, newState) => {
  for (const a of Array.from(as)) {
    setArticleState(a, newState);
  }
};

const markEntriesOnPage = (selection, newState) => {
  switch (selection) {
    case "all":
      batchSetArticleStates(document.querySelectorAll("article"));
      break;
    case "above":
    case "below":
      const cur = curItem();
      if (!cur) {
        break;
      }
      const sibl = Array.from(cur.parentNode.children);
      const i = sibl.indexOf(cur);
      if (selection === "above") {
        batchSetArticleStates(sibl.slice(0, i), newState);
      } else {
        batchSetArticleStates(sibl.slice(i + 1), newState);
      }
      break;
    default:
      break;
  }
};

const goToFeedList = () => {
  let links;
  let url;
  switch (PAGE) {
    case Pages.Category:
      links = document.querySelectorAll(".page-header a");
      break;
    case Pages.Categories:
      links = document.querySelectorAll(".current-item .item-meta-icons a");
      break;
    case Pages.Unread:
      links = document.querySelectorAll(".current-item .category a");
      break;
    case Pages.Entries:
    case Pages.Entry:
      const lnk = document.querySelector(".category a");
      if (lnk) {
        url = lnk.getAttribute("href").replace("/entries", "/feeds");
      }
      break;
    default:
      break;
  }
  if (links) {
    const link = Array.from(links).find((a) =>
      a.getAttribute("href").endsWith("/feeds"),
    );
    if (link) {
      link.click();
    }
  } else if (url) {
    window.location.pathname = url;
  }
};

const scrollToEntryAnchor = (prev = false) => {
  if (!entryAnchors.ready) {
    entryAnchors.list = document
      .querySelector(".entry-content")
      .innerText.match(ENTRY_ANCHOR_REGEX);
    console.log("Found entry anchors: ", entryAnchors.list);
    entryAnchors.ready = true;
  }
  const { list, index } = entryAnchors;
  if (!list || !list.length) {
    return;
  }
  let cur = index;
  if (prev) {
    cur -= 1;
  } else {
    cur += 1;
  }
  if (cur < 0 || cur > list.length) {
    return;
  }

  const a = list[cur].trim();
  const rect = document
    .evaluate(`//*[text()[contains(., '${a}')]][last()]`, document.body)
    .iterateNext()
    .getBoundingClientRect();
  if (rect.top > window.innerHeight) {
    window.scrollBy(0, window.innerHeight / 2);
  } else {
    window.scrollBy(0, rect.top);
    entryAnchors.index = cur;
  }
};

// Feat. Sort feeds/categories by content type
if (PAGE === Pages.Categories || PAGE === Pages.Feeds) {
  const items = Array.from(document.querySelectorAll("article"));
  // console.log(items);
  items.sort(getSorter());
  for (let i = 0; i < items.length; i++) {
    items[i].parentNode.appendChild(items[i]);
  }
}

// Feat. addiontal hotkeys
const onKeyDown = (e) => {
  if (e.isComposing || e.keyCode === 229) {
    return;
  }
  // console.log('keydown evt=', e);
  if (e.shiftKey && e.key === "L") {
    goToFeedList();
  } else if (PAGE === Pages.Entries) {
    if (e.shiftKey && e.key === "U") {
      // console.log('mark all unread');
      markEntriesOnPage("all", "unread");
    } else if (e.shiftKey && e.key === "M") {
      // console.log('toggle all read/unread');
      markEntriesOnPage("all" /*, newState = 'toggle' */);
    } else if (e.shiftKey && e.key === "Q") {
      // console.log('mark all above read');
      markEntriesOnPage("above", "read");
    } else if (e.shiftKey && e.key === "O") {
      // console.log('mark all above read');
      markEntriesOnPage("above", "read");
      const cur = curItem();
      if (cur) {
        const a = cur.querySelector(".item-title > a");
        a && a.click();
      }
    }
  } else if (PAGE === Pages.Entry) {
    if (e.key === "=" || e.key === ".") {
      scrollToEntryAnchor();
    } else if (e.key === "-" || e.key === ",") {
      scrollToEntryAnchor(true);
    }
  }
};

document.addEventListener("keydown", onKeyDown);

// vim: ft=javascript ts=2 sw=2 smarttab expandtab autoindent
