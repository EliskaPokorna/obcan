(function () {
  "use strict";
  /*** ====== CONFIG ====== ***/
  const STORAGE_KEY = "cookieConsent.v2";
  const POLICY_VERSION = 2;                 // Zvyš při změně zásad
  const CONSENT_TTL_DAYS = 180;             // doporučené 6 měsíců
  const TEST_MODE_ALWAYS_SHOW = false;      // produkce: false
  const RESPECT_DNT = true;                 // pokud je DNT=1, předvolíme odmítnutí ne-nezbytných
  const COOKIE_NAME = "cc_consent_v2";      // volitelné pro subdomény
  const COOKIE_DOMAIN = "";                  // např. ".example.com" (ponech prázdné pokud nechceš)
  const COOKIE_MAX_AGE_SEC = CONSENT_TTL_DAYS * 24 * 60 * 60;

  // Dostupné kategorie – "necessary" je vždy true a mimo volbu uživatele
  const DEFAULT_CATEGORIES = {
    necessary: true,
    preferences: false,
    analytics: false,
    marketing: false
  };

  // Mapování kategorií na Google Consent Mode v2
  function toGCM(consent) {
    // Základní výchozí: non-essential = denied
    const gcm = {
      ad_storage: consent.marketing ? "granted" : "denied",
      analytics_storage: consent.analytics ? "granted" : "denied",
      functionality_storage: consent.preferences ? "granted" : "denied",
      // V2 nově:
      ad_user_data: consent.marketing ? "granted" : "denied",
      ad_personalization: consent.marketing ? "granted" : "denied",
      // Bezpečnostní/nezbytné
      security_storage: "granted"
    };
    return gcm;
  }

  /*** ====== UTILS ====== ***/
  const nowIso = () => new Date().toISOString();
  const $ = (s) => document.querySelector(s);
  function daysToMs(d) { return d * 24 * 60 * 60 * 1000; }
  function parseJSON(s, fallback = null) { try { return JSON.parse(s); } catch { return fallback; } }

  // Simple base64 for cookie payload (avoids quotes/semicolons)
  function enc(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function dec(str) { try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch(e){ return null; } }

  function getStored() {
    const local = parseJSON(localStorage.getItem(STORAGE_KEY));
    if (local) return local;
    // fallback z cookie (napříč subdoménami)
    const c = getCookie(COOKIE_NAME);
    if (c) return dec(c);
    return null;
  }
  function setStored(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (COOKIE_DOMAIN) {
      setCookie(COOKIE_NAME, enc(payload), COOKIE_MAX_AGE_SEC, COOKIE_DOMAIN);
    }
  }
  function removeStored() {
    localStorage.removeItem(STORAGE_KEY);
    if (COOKIE_DOMAIN) {
      eraseCookie(COOKIE_NAME, COOKIE_DOMAIN);
    }
  }

  function isExpired(rec) {
    if (!rec || !rec._ts) return true;
    return (Date.now() - new Date(rec._ts).getTime()) > daysToMs(CONSENT_TTL_DAYS) || rec.version !== POLICY_VERSION;
  }
  function shouldShow() {
    if (TEST_MODE_ALWAYS_SHOW) return true;
    const rec = getStored();
    return !rec || isExpired(rec);
  }

  // Cookie helpers (only if chceš sdílet napříč subdoménami)
  function setCookie(name, value, maxAgeSec, domainOpt) {
    let cookie = `${name}=${value}; Path=/; SameSite=Lax`;
    if (maxAgeSec) cookie += `; Max-Age=${maxAgeSec}`;
    // HttpOnly nelze z JS; Secure je vhodné na HTTPS
    if (location.protocol === "https:") cookie += `; Secure`;
    if (domainOpt) cookie += `; Domain=${domainOpt}`;
    document.cookie = cookie;
  }
  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + "=([^;]*)"));
    return match ? match[2] : null;
  }
  function eraseCookie(name, domainOpt) {
    document.cookie = `${name}=; Path=/; Max-Age=0${domainOpt ? `; Domain=${domainOpt}` : ""}`;
  }

  /*** ====== DOM HOOKS (IDs musí být v HTML na všech podstránkách) ====== ***/
  const banner = $("#cc-banner");
  const modalBackdrop = $("#cc-modal-backdrop");
  const modal = $("#cc-modal");
  const btnAccept = $("#cc-accept");
  const btnReject = $("#cc-reject");
  const btnCustomize = $("#cc-customize");
  const btnClose = $("#cc-close");
  const btnSave = $("#cc-save");
  const btnAccept2 = $("#cc-accept-2");
  const cbPreferences = $("#cc-preferences");
  const cbAnalytics = $("#cc-analytics");
  const cbMarketing = $("#cc-marketing");

  const FIRST_FOCUS = () => btnSave || btnAccept2 || btnAccept;

  /*** ====== ACCESSIBILITY: focus trap ====== ***/
  let trapDispose = null;
  function enableFocusTrap(scope) {
    function onKey(e) {
      if (e.key === "Escape") { closeModal(); }
      if (e.key !== "Tab") return;
      const focusables = scope.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusables).filter(el => !el.disabled && el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
    scope.addEventListener("keydown", onKey);
    return () => scope.removeEventListener("keydown", onKey);
  }

  /*** ====== CONSENT CORE ====== ***/
  function saveConsent(partial) {
    const consent = {
      necessary: true,
      preferences: !!partial.preferences,
      analytics: !!partial.analytics,
      marketing: !!partial.marketing
    };
    const payload = {
      _ts: nowIso(),
      version: POLICY_VERSION,
      consent
    };
    setStored(payload);
    applyConsent(consent);
    // Broadcast do ostatních karet
    try { localStorage.setItem(STORAGE_KEY + ".ping", String(Date.now())); } catch {}
    // GTM/analytika event
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: "cookie_consent_update", consent });
    }
  }

  function applyConsent(consent) {
    // Google Consent Mode v2
    updateConsentMode(consent);
    // Spusť odložené skripty podle kategorií
    executePendingScripts(consent);
  }

  function updateConsentMode(consent) {
    const gcm = toGCM(consent);
    // gtag (Consent Mode)
    if (typeof window.gtag === "function") {
      // Init (bezprostředně)
      window.gtag('consent', 'default', gcm);
      // immediate update (pro jistotu)
      window.gtag('consent', 'update', gcm);
    }
    // dataLayer fallback (některé implementace čtou přes dataLayer)
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: 'gcm_update', gcm });
    }
  }

  // Spuštění odložených scriptů <script type="text/plain" data-cookie-category="analytics|marketing|preferences">
  function executePendingScripts(consent) {
    const nodes = document.querySelectorAll('script[type="text/plain"][data-cookie-category]');
    nodes.forEach(node => {
      const cat = node.getAttribute("data-cookie-category");
      if (!cat || !consent[cat]) return; // respektuje opt-in
      const s = document.createElement("script");
      // zkopíruj atributy, které dávají smysl
      ["src", "async", "defer", "crossorigin", "referrerpolicy", "type"].forEach(a => {
        if (node.hasAttribute(a)) s.setAttribute(a, node.getAttribute(a));
      });
      // výchozí type je "text/javascript"
      if (!s.type || s.type === "text/plain") s.type = "text/javascript";
      if (node.textContent && node.textContent.trim()) { s.text = node.textContent; }
      node.parentNode.replaceChild(s, node);
    });
  }

  /*** ====== UI helpers ====== ***/
  function openBanner() { if (banner) banner.classList.remove("cc-hidden"); }
  function closeBanner() { if (banner) banner.classList.add("cc-hidden"); }
  function openModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove("cc-hidden");
    modalBackdrop.setAttribute("aria-hidden", "false");
    setTimeout(() => (FIRST_FOCUS() && FIRST_FOCUS().focus()), 10);
    trapDispose = enableFocusTrap(modalBackdrop);
  }
  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.add("cc-hidden");
    modalBackdrop.setAttribute("aria-hidden", "true");
    if (trapDispose) trapDispose();
  }

  /*** ====== EVENT HANDLERS ====== ***/
  btnAccept && btnAccept.addEventListener("click", () => {
    saveConsent({ preferences: true, analytics: true, marketing: true });
    closeBanner();
  });
  btnAccept2 && btnAccept2.addEventListener("click", () => {
    saveConsent({ preferences: true, analytics: true, marketing: true });
    closeModal(); closeBanner();
  });
  btnReject && btnReject.addEventListener("click", () => {
    saveConsent({ preferences: false, analytics: false, marketing: false });
    closeBanner();
  });
  btnCustomize && btnCustomize.addEventListener("click", () => {
    const rec = getStored();
    cbPreferences && (cbPreferences.checked = !!(rec && rec.consent && rec.consent.preferences));
    cbAnalytics && (cbAnalytics.checked = !!(rec && rec.consent && rec.consent.analytics));
    cbMarketing && (cbMarketing.checked = !!(rec && rec.consent && rec.consent.marketing));
    openModal();
  });
  btnSave && btnSave.addEventListener("click", () => {
    saveConsent({
      preferences: cbPreferences ? cbPreferences.checked : false,
      analytics: cbAnalytics ? cbAnalytics.checked : false,
      marketing: cbMarketing ? cbMarketing.checked : false
    });
    closeModal(); closeBanner();
  });
  btnClose && btnClose.addEventListener("click", () => closeModal());

  // Sync mezi kartami/okny
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY || e.key === STORAGE_KEY + ".ping") {
      const rec = getStored();
      if (rec && rec.consent) {
        applyConsent(rec.consent);
        // pokud už souhlas existuje, banner schovej
        closeBanner();
      } else if (shouldShow()) {
        openBanner();
      }
    }
  });

  /*** ====== STARTUP ====== ***/
  (function init() {
    // DNT – předvolba (banner stejně ukážeme, jen předvyplníme odmítnutí)
    const dntOn = RESPECT_DNT && (window.doNotTrack === "1" || navigator.doNotTrack === "1");
    // Pokud je třeba banner, otevřeme; jinak aplikujeme uložené preference
    if (shouldShow()) {
      // Přednastav checkboxy podle DNT
      if (dntOn) {
        cbPreferences && (cbPreferences.checked = false);
        cbAnalytics && (cbAnalytics.checked = false);
        cbMarketing && (cbMarketing.checked = false);
      }
      openBanner();
      // non-essential nespouštíme, dokud není souhlas
    } else {
      const rec = getStored();
      if (rec && rec.consent) { applyConsent(rec.consent); }
    }
  })();

  /*** ====== PUBLIC API ====== ***/
  window.CookieConsent = {
    open: () => openModal(),
    reset: () => { removeStored(); openBanner(); },
    get: () => { const r = getStored(); return r ? r.consent : Object.assign({}, DEFAULT_CATEGORIES); },
    set: (c) => { saveConsent(c || {}); },
    version: POLICY_VERSION
  };
})();
