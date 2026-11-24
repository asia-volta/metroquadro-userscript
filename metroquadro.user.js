// ==UserScript==
// @name         MetroQuadro
// @namespace    https://github.com/asia-volta/metroquadro-userscript
// @version      0.2.0
// @description  Ordina gli annunci caricati su Idealista e Immobiliare.it per prezzo al metro quadro.
// @homepageURL  https://github.com/asia-volta/metroquadro-userscript
// @supportURL   https://github.com/asia-volta/metroquadro-userscript/issues
// @match        https://www.idealista.it/*
// @match        https://www.immobiliare.it/*
// @run-at       document-idle
// @noframes
// @sandbox      DOM
// @inject-into  content
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/asia-volta/metroquadro-userscript/main/metroquadro.meta.js
// @downloadURL  https://raw.githubusercontent.com/asia-volta/metroquadro-userscript/main/metroquadro.user.js
// ==/UserScript==

(() => {
"use strict";
const globalThis = {};
if (document.getElementById("metroquadro-toolbar")) return;
GM_addStyle("[data-mq-badge] {\n  display: inline-flex !important;\n  align-items: center !important;\n  margin: 8px 10px 8px 0 !important;\n  padding: 6px 10px !important;\n  border: 1px solid #bedbd0 !important;\n  border-radius: 7px !important;\n  background: #edf7f2 !important;\n  color: #14533f !important;\n  font: 600 13px/1.3 system-ui, sans-serif !important;\n  letter-spacing: 0 !important;\n  white-space: nowrap !important;\n}\n[data-mq-badge=\"unknown\"] { color: #626663 !important; background: #f3f4f2 !important; border-color: #dedfdc !important; }\n");
/* Pure parsing and comparison; shared by content scripts and Node tests. */
(() => {
  "use strict";
  const NUMBER = String.raw`\d+(?:[.\s\u00a0\u202f]\d{3})*(?:,\d+)?`;
  const normalize = (value) => String(value ?? "").replace(/[\u00a0\u202f]/g, " ").trim();

  function number(value) {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
    const s = normalize(value);
    if (!/^(?:\d+|\d{1,3}(?:[. ]\d{3})+)(?:,\d+)?$/.test(s)) return null;
    const n = Number(s.replace(/[. ]/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function price(value) {
    const text = normalize(value).replace(/[-−+]\s*\d+(?:[.,]\d+)?\s*%/g, "");
    if (/\b(?:da|a partire|su richiesta|riservat|trattativa)\b/i.test(text)) return null;
    if (/\d\s*[-–]\s*\d|[-−]\s*(?:€\s*\d|\d[\d., ]*\s*€)|€\s*[-−]/.test(text)) return null;
    const matches = [...text.matchAll(new RegExp(String.raw`(?:€\s*(${NUMBER})(?![\d.,])|(?<![\d.,])(${NUMBER})\s*€)`, "g"))];
    // Never silently select one of several current prices (or a price range).
    const amounts = matches.filter((m) => !/^\s*\/\s*(?:m\s*[²2]|mq\b|metri\b)/i.test(text.slice(m.index + m[0].length)))
      .map((m) => number(m[1] ?? m[2]));
    return amounts.length === 1 ? amounts[0] : null;
  }

  function area(value) {
    const text = normalize(value);
    if (/\d\s*[-–]\s*\d|\b(?:da|a partire)\s+\d/i.test(text)) return null;
    const matches = [...text.matchAll(new RegExp(String.raw`(?<![\d.,/−-])(${NUMBER})\s*(?:m\s*[²2]|mq|metri quadrati)(?!\w)`, "gi"))];
    return matches.length === 1 ? number(matches[0][1]) : null;
  }

  function compare(a, b, direction = "asc") {
    const aValid = Number.isFinite(a.unit) && a.unit > 0;
    const bValid = Number.isFinite(b.unit) && b.unit > 0;
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (!aValid) return a.original - b.original;
    return (a.unit - b.unit) * (direction === "desc" ? -1 : 1) || a.original - b.original;
  }

  function idealistaURL(href, direction) {
    const url = new URL(href);
    if (url.hostname !== "www.idealista.it" || !["asc", "desc"].includes(direction)) return null;
    url.pathname = url.pathname.replace(/\/pagina-\d+\/?$/, "/");
    url.searchParams.delete("pagina");
    url.searchParams.set("ordine", `prezzoMedio-${direction}`);
    return url.href;
  }

  globalThis.MetroQuadro = Object.freeze({ number, price, area, compare, idealistaURL });
})();

(() => {
  "use strict";
  const { number, price, area } = globalThis.MetroQuadro;
  const excluded = '[data-mq-owned], del, s, .item-price-down, .in-listingCardPrice__oldPrice, [class*="oldPrice"], [class*="priceOld"]';

  function cleanText(element) {
    if (!element) return "";
    const copy = element.cloneNode(true);
    copy.querySelectorAll(excluded).forEach((node) => node.remove());
    return copy.textContent.replace(/[\u00a0\u202f]/g, " ").trim();
  }

  function first(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  const configs = {
    "www.idealista.it": {
      name: "Idealista",
      cards: ".items-container article.item, #main-content article.item, main article.item",
      price: [".item-price", '[data-test="price"]'],
      surface: [".item-detail", '[data-test="surface"]'],
      anchor: [".item-info-container", ".item-info"],
      link: 'a[href*="/immobile/"]',
      id: /\/immobile\/(\d+)/
    },
    "www.immobiliare.it": {
      name: "Immobiliare.it",
      cards: ".in-searchLayoutList > li, .in-searchLayoutList > div, .in-realEstateResults > li, li.in-listingCard, li.nd-list__item:has(.in-listingCard), main .in-listingCard",
      price: [".in-listingCardPrice", ".in-listingCardPrice__value", ".in-realEstateListCard__price", '[data-test="price"]'],
      surface: ['[data-test="surface"]', '[aria-label*="superficie" i]', '.in-listingCardFeatureList__item', '.in-feat__item', '.in-feat li', '.in-realEstateListCard__features li', '[class*="FeatureList"] li'],
      anchor: [".in-listingCardContent", ".in-listingCard__content", ".in-realEstateListCard__content"],
      link: 'a[href*="/annunci/"], a[href*="/nuove-costruzioni/"]',
      id: /\/annunci\/(\d+)/
    }
  };

  // Only use JSON attached by the page, and join by listing ID. No network requests.
  function structuredListings(doc) {
    const result = new Map();
    const script = doc.getElementById("__NEXT_DATA__");
    if (!script || script.textContent.length > 8_000_000) return result;
    let json;
    try { json = JSON.parse(script.textContent); } catch { return result; }
    const queue = [json];
    for (let i = 0; i < queue.length && i < 60_000; i++) {
      const value = queue[i];
      if (!value || typeof value !== "object") continue;
      if (value.realEstate && typeof value.realEstate === "object") {
        const listing = value.realEstate;
        const properties = listing.properties;
        // Multi-unit developments have no single comparable price/surface pair.
        if (listing.id && Array.isArray(properties) && properties.length === 1 && !listing.isProject) {
          const rawSurface = properties[0].surface;
          result.set(String(listing.id), {
            price: typeof listing.price?.value === "number" ? number(listing.price.value) : null,
            area: typeof rawSurface === "number" ? number(rawSurface) : (area(rawSurface) ?? number(rawSurface))
          });
        }
      }
      for (const child of Object.values(value)) if (child && typeof child === "object") queue.push(child);
    }
    return result;
  }

  function extract(card, config, structured) {
    const link = card.querySelector(config.link);
    const id = link?.getAttribute("href")?.match(config.id)?.[1];
    const fallback = id ? structured.get(id) : null;
    const priceNode = first(card, config.price);
    const rawPrice = cleanText(priceNode);
    // A visible "su richiesta"/range is authoritative, never replaced with stale JSON.
    const amount = rawPrice ? price(rawPrice) : fallback?.price ?? null;
    let surface = null;
    for (const selector of config.surface) {
      const nodes = [...card.querySelectorAll(selector)].filter((n) => !n.closest('[data-mq-owned]'));
      const candidates = nodes.map((n) => area(cleanText(n))).filter((n) => n !== null);
      if (candidates.length) { surface = candidates[0]; break; }
    }
    surface ??= fallback?.area ?? null;
    const multiUnit = !!card.querySelector('a[href*="/nuove-costruzioni/"], .item-multidetail');
    const unit = !multiUnit && amount > 0 && surface > 0 ? amount / surface : null;
    return { price: amount, area: surface, unit, anchor: first(card, config.anchor) ?? card };
  }

  function scan(doc, hostname) {
    const config = configs[hostname];
    if (!config) return { config: null, groups: [] };
    // Detail pages may have recommendation cards: do not reorder those.
    if (/^\/(?:immobile|annunci)\/\d+/.test(doc.location.pathname)) return { config, groups: [] };
    const structured = hostname === "www.immobiliare.it" ? structuredListings(doc) : new Map();
    const candidates = [...doc.querySelectorAll(config.cards)].filter((card) => card.querySelector(config.link));
    const cards = candidates.filter((card) => !candidates.some((other) => other !== card && other.contains(card)));
    const groups = new Map();
    for (const card of cards) {
      if (card.closest('aside, [data-mq-owned]')) continue;
      const parent = card.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push({ card, ...extract(card, config, structured) });
    }
    return { config, groups: [...groups].map(([parent, items]) => ({ parent, items })) };
  }

  globalThis.MetroQuadroAdapters = Object.freeze({ scan, cleanText, structuredListings });
})();

// GM storage belongs to the userscript manager, never to the property website.
globalThis.MetroQuadroStorage = Object.freeze({
  async get(key) { return GM_getValue(key, null); },
  async set(key, value) { return GM_setValue(key, value); }
});

(() => {
  "use strict";
  if (globalThis.__metroQuadroStarted) return;
  globalThis.__metroQuadroStarted = true;
  const { compare, idealistaURL } = globalThis.MetroQuadro;
  const { scan } = globalThis.MetroQuadroAdapters;
  const storage = globalThis.MetroQuadroStorage;
  const preferenceKey = `order:${location.hostname}`;
  const validModes = ["original", "asc", "desc"];
  let mode = "original";
  let original = new WeakMap();
  let sortedParents = new WeakSet();
  let nextIndex = 0;
  let href = location.href;
  let timer;
  let host;
  let root;
  let initialized = false;
  const fmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
  const decimal = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2, useGrouping: "always" });

  function mount() {
    host = document.createElement("div");
    host.id = "metroquadro-toolbar";
    host.setAttribute("data-mq-owned", "toolbar");
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host{all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:system-ui,sans-serif;color:#183a2f;color-scheme:light}
        :host([hidden]){display:none!important}
        *{box-sizing:border-box}section{width:340px;border:1px solid #c8d5ce;border-radius:16px;background:#fffef9;box-shadow:0 10px 40px #16372c26;padding:17px}
        header{display:flex;align-items:center;gap:10px;margin-bottom:13px}.mark{background:#18533e;color:#fff;border-radius:9px;padding:9px 7px;font-size:15px;font-weight:700}
        h2{margin:0;font-size:16px;line-height:1.4}header p{margin:0;color:#66756c;font-size:11px}button,select{font:inherit}button{cursor:pointer}
        .collapse{margin-left:auto;border:0;background:transparent;color:#596a60;font-size:20px;padding:4px 8px;border-radius:5px}
        label{display:block;font-size:12px;font-weight:600;margin-bottom:6px}select{width:100%;padding:10px;border:1px solid #a9bfb2;border-radius:8px;background:white;color:#173f30;font-size:14px}
        select:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #82bda3;outline-offset:3px}
        .status{font-size:12px;margin:12px 0 5px;line-height:1.5}.scope{font-size:11px;color:#68756e;line-height:1.5;margin:0}
        .native{border-top:1px solid #e0e5dc;margin-top:12px;padding-top:10px;font-size:11px;line-height:1.5}.links{display:flex;gap:12px;margin-top:4px}a{color:#205b43;font-weight:600}
        .refresh{padding:0;background:none;border:0;font-size:11px;color:#205b43;text-decoration:underline;margin-top:10px}
        section[data-collapsed] {width:auto;padding:10px 14px}section[data-collapsed] header{margin:0}section[data-collapsed] .body{display:none}
        @media(max-width:520px){:host{bottom:10px;right:10px;left:10px}section{width:100%}section[data-collapsed]{width:max-content;margin-left:auto}}
      </style>
      <section aria-label="MetroQuadro: ordinamento annunci">
        <header><span class="mark" aria-hidden="true">m²↓</span><div><h2>MetroQuadro</h2><p>Il prezzo, alla stessa scala.</p></div><button class="collapse" type="button" aria-label="Riduci pannello" aria-expanded="true">−</button></header>
        <div class="body">
          <label for="order">Ordina gli annunci caricati</label>
          <select id="order"><option value="original">Ordine del sito</option><option value="asc">€/m² · dal più basso</option><option value="desc">€/m² · dal più alto</option></select>
          <p class="status" role="status" aria-live="polite"></p>
          <p class="scope">Solo questa pagina. I nuovi annunci caricati vengono riordinati. Prezzo o superficie mancanti: in fondo.</p>
          <div class="native" hidden>Su Idealista puoi ordinare anche tutta la ricerca:<div class="links"><a data-native="asc">€/m² crescenti ↗</a><a data-native="desc">€/m² decrescenti ↗</a></div></div>
          <button class="refresh" type="button">Ricalcola</button>
        </div>
      </section>`;
    root.getElementById("order").value = mode;
    root.getElementById("order").addEventListener("change", async (event) => {
      mode = event.target.value;
      refresh();
      try { await storage.set(preferenceKey, mode); } catch { /* UI still works without persistence. */ }
    });
    root.querySelector(".collapse").addEventListener("click", () => {
      const collapsed = root.querySelector("section").toggleAttribute("data-collapsed");
      const button = root.querySelector(".collapse");
      button.textContent = collapsed ? "+" : "−";
      button.setAttribute("aria-label", collapsed ? "Espandi pannello" : "Riduci pannello");
      button.setAttribute("aria-expanded", String(!collapsed));
    });
    root.querySelector(".refresh").addEventListener("click", refresh);
    // A native global sort must not subsequently be overridden by a saved local mode.
    root.querySelectorAll("[data-native]").forEach((link) => link.addEventListener("click", async (event) => {
      event.preventDefault();
      mode = "original";
      try { await storage.set(preferenceKey, mode); } catch { /* Ignore storage failure. */ }
      location.assign(link.href);
    }));
    document.body.append(host);
  }

  function reorder(parent, items) {
    const current = [...parent.children].filter((node) => items.some((item) => item.card === node));
    const sorted = [...items].sort(mode === "original" ? (a, b) => a.original - b.original : (a, b) => compare(a, b, mode));
    if (sorted.every((item, i) => item.card === current[i])) return;
    // Move existing elements only. Slots preserve non-listing banners and event handlers.
    const slots = current.map((node) => {
      const slot = document.createComment("metroquadro-slot");
      parent.insertBefore(slot, node);
      return slot;
    });
    sorted.forEach((item, i) => slots[i].replaceWith(item.card));
  }

  function refresh() {
    if (!initialized || !document.body) return;
    observer.disconnect();
    try {
      if (location.href !== href) {
        href = location.href;
        original = new WeakMap();
        sortedParents = new WeakSet();
        nextIndex = 0;
      }
      const { config, groups } = scan(document, location.hostname);
      const items = groups.flatMap((group) => group.items);
      if (!items.length) {
        if (host) {
          root.querySelector(".status").textContent = "Nessun annuncio riconosciuto in questa vista.";
          host.hidden = true;
        }
        return;
      }
      if (!host?.isConnected) mount();
      host.hidden = false;
      // Track the site's latest order until we actually start moving its cards.
      for (const { parent, items: groupItems } of groups) {
        if (!sortedParents.has(parent)) {
          for (const item of groupItems) original.set(item.card, nextIndex++);
        }
      }
      for (const item of items) {
        if (!original.has(item.card)) original.set(item.card, nextIndex++);
        item.original = original.get(item.card);
        let badge = item.card.querySelector('[data-mq-badge]');
        if (!badge) {
          badge = document.createElement("span");
          badge.setAttribute("data-mq-owned", "badge");
          item.anchor.prepend(badge);
        }
        const known = item.unit !== null;
        badge.setAttribute("data-mq-badge", known ? "known" : "unknown");
        const label = known ? `${fmt.format(item.unit)} €/m²` : "€/m² n.d.";
        if (badge.textContent !== label) badge.textContent = label;
        badge.title = known ? `${decimal.format(item.price)} € ÷ ${decimal.format(item.area)} m². Superficie dichiarata nell’annuncio.` : "Prezzo o superficie assenti/ambigui, oppure annuncio con più unità.";
      }
      for (const { parent, items: groupItems } of groups) {
        if (mode !== "original" || sortedParents.has(parent)) reorder(parent, groupItems);
        if (mode === "original") sortedParents.delete(parent);
        else sortedParents.add(parent);
      }
      const count = items.filter((item) => item.unit !== null).length;
      root.getElementById("order").value = mode;
      root.querySelector(".status").textContent = `${count} su ${items.length} annunci confrontabili · ${config.name}${groups.length > 1 ? " · per sezione" : ""}`;
      const native = root.querySelector(".native");
      native.hidden = config.name !== "Idealista";
      if (!native.hidden) root.querySelectorAll("[data-native]").forEach((link) => {
        link.href = idealistaURL(location.href, link.dataset.native);
      });
    } finally {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "class", "data-id"] });
    }
  }

  function schedule() {
    // A fixed trailing window avoids starvation on pages with frequent ad mutations.
    if (timer) return;
    timer = setTimeout(() => { timer = null; refresh(); }, 250);
  }
  const observer = new MutationObserver(schedule);
  addEventListener("popstate", schedule);
  addEventListener("pageshow", schedule);
  // pushState does not emit an event in isolated content scripts.
  setInterval(() => { if (location.href !== href) schedule(); }, 1000);
  (async () => {
    try {
      const savedMode = await storage.get(preferenceKey);
      if (validModes.includes(savedMode)) mode = savedMode;
    } catch { /* A storage failure must never prevent the sorter from loading. */ }
    initialized = true;
    refresh();
  })();
})();

})();
