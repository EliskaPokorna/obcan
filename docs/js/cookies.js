(function(){
    const STORAGE_KEY = "cookieConsent.v1";
    const CONSENT_TTL_DAYS = 180;
    const TEST_MODE_ALWAYS_SHOW = false; // ← produkce: false (na test dej true)

    const now = () => new Date().toISOString();
    const $ = s => document.querySelector(s);

    const banner = $("#cc-banner");
    const modalBackdrop = $("#cc-modal-backdrop");
    const modal = $("#cc-modal");
    const btnAccept = $("#cc-accept");
    const btnReject = $("#cc-reject");
    const btnCustomize = $("#cc-customize");
    const btnClose = $("#cc-close");
    const btnSave = $("#cc-save");
    const btnAccept2 = $("#cc-accept-2");
    const cbAnalytics = $("#cc-analytics");
    const cbMarketing = $("#cc-marketing");
    const FIRST_FOCUS = () => btnSave;

    function daysToMs(d){ return d*24*60*60*1000; }
    function getStored(){
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
      catch(e){ return null }
    }
    function isExpired(rec){
      if(!rec || !rec._ts) return true;
      return (Date.now() - new Date(rec._ts).getTime()) > daysToMs(CONSENT_TTL_DAYS);
    }
    function shouldShow(){
      if (TEST_MODE_ALWAYS_SHOW) return true;
      const rec = getStored();
      return !rec || isExpired(rec);
    }
    function saveConsent(consent){
      const payload = {
        _ts: now(),
        version: 1,
        consent: {
          necessary: true,
          analytics: !!consent.analytics,
          marketing: !!consent.marketing
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      applyConsent(payload.consent);
      if(window.dataLayer){ window.dataLayer.push({event:"cookie_consent_update", consent: payload.consent}); }
    }
    function applyConsent(consent){
      executePendingScripts(consent);
    }

    function openBanner(){ banner.classList.remove("cc-hidden"); }
    function closeBanner(){ banner.classList.add("cc-hidden"); }
    function openModal(){
      modalBackdrop.classList.remove("cc-hidden");
      modalBackdrop.setAttribute("aria-hidden","false");
      setTimeout(()=> (FIRST_FOCUS() && FIRST_FOCUS().focus()), 10);
      trap = enableFocusTrap(modalBackdrop);
    }
    function closeModal(){
      modalBackdrop.classList.add("cc-hidden");
      modalBackdrop.setAttribute("aria-hidden","true");
      if(trap) trap();
    }

    // focus trap
    let trap = null;
    function enableFocusTrap(scope){
      function onKey(e){
        if(e.key === "Escape"){ closeModal(); }
        if(e.key !== "Tab") return;
        const focusables = scope.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        const list = Array.from(focusables).filter(el=>!el.disabled && el.offsetParent !== null);
        if(list.length === 0) return;
        const first = list[0], last = list[list.length-1];
        if(e.shiftKey && document.activeElement === first){ last.focus(); e.preventDefault(); }
        else if(!e.shiftKey && document.activeElement === last){ first.focus(); e.preventDefault(); }
      }
      scope.addEventListener("keydown", onKey);
      return () => scope.removeEventListener("keydown", onKey);
    }

    // odložené skripty podle kategorie
    function executePendingScripts(consent){
      const nodes = document.querySelectorAll('script[type="text/plain"][data-cookie-category]');
      nodes.forEach(node=>{
        const cat = node.getAttribute("data-cookie-category");
        if(!cat || !consent[cat]) return;
        const s = document.createElement("script");
        ["src","async","defer","crossorigin","referrerpolicy"].forEach(a=>{
          if(node.hasAttribute(a)) s.setAttribute(a, node.getAttribute(a));
        });
        if(node.textContent && node.textContent.trim()){ s.text = node.textContent; }
        node.parentNode.replaceChild(s, node);
      });
    }

    // akce
    btnAccept.addEventListener("click", ()=>{ saveConsent({analytics:true, marketing:true}); closeBanner(); });
    btnAccept2.addEventListener("click", ()=>{ saveConsent({analytics:true, marketing:true}); closeModal(); closeBanner(); });
    btnReject.addEventListener("click", ()=>{ saveConsent({analytics:false, marketing:false}); closeBanner(); });
    btnCustomize.addEventListener("click", ()=>{
      const rec = getStored();
      cbAnalytics.checked = !!(rec && rec.consent && rec.consent.analytics);
      cbMarketing.checked = !!(rec && rec.consent && rec.consent.marketing);
      openModal();
    });
    btnSave.addEventListener("click", ()=>{
      saveConsent({analytics: cbAnalytics.checked, marketing: cbMarketing.checked});
      closeModal(); closeBanner();
    });
    btnClose.addEventListener("click", ()=> closeModal());

    // start
    if(shouldShow()){ openBanner(); } else {
      const rec = getStored();
      if(rec && rec.consent){ applyConsent(rec.consent); }
    }

    // veřejné API pro odkaz v patičce
    window.CookieConsent = {
      open: ()=> openModal(),
      reset: ()=> { localStorage.removeItem(STORAGE_KEY); openBanner(); }
    };
  })();
