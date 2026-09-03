/**
 * Edilizia in Cloud — widget di prenotazione appuntamenti (stile Calendly).
 *
 * Vanilla JS, nessuna dipendenza: funziona su WordPress, Wix, Webflow, siti
 * statici. Tre modi d'uso, nello stesso script:
 *
 *   1) RIQUADRO NELLA PAGINA (si adatta da solo in altezza)
 *      <div data-prenota-inline="consulenza-gestionale"></div>
 *      <script src="https://app.ediliziaincloud.com/prenota.js"></script>
 *
 *   2) FINESTRA AL CLIC (su qualsiasi bottone o link)
 *      <button data-prenota="consulenza-gestionale">Prenota una consulenza</button>
 *
 *   3) BOTTONE FISSO IN BASSO
 *      <script src="https://app.ediliziaincloud.com/prenota.js"
 *              data-badge="consulenza-gestionale"
 *              data-badge-text="Prenota una consulenza"></script>
 *
 * Dati gia' compilati (facoltativi), su qualunque elemento:
 *   data-name, data-email, data-phone
 *
 * A prenotazione conclusa il sito riceve l'evento `eic:appuntamento-prenotato`
 * (window), utile per Analytics o per il pixel:
 *   window.addEventListener("eic:appuntamento-prenotato", function (e) { ... });
 */
(function () {
  "use strict";

  var scripts = document.getElementsByTagName("script");
  var thisScript = null;
  for (var i = scripts.length - 1; i >= 0; i--) {
    if (scripts[i].src && scripts[i].src.indexOf("/prenota.js") !== -1) { thisScript = scripts[i]; break; }
  }
  var appUrl = (thisScript && thisScript.getAttribute("data-app-url")) ||
    (thisScript ? thisScript.src.replace(/\/prenota\.js.*$/, "") : "https://app.ediliziaincloud.com");

  function url(slug, el) {
    var q = [];
    var campi = ["name", "email", "phone", "first_name", "last_name"];
    for (var i = 0; i < campi.length; i++) {
      var v = el && el.getAttribute("data-" + campi[i].replace("_", "-"));
      if (v) q.push(campi[i] + "=" + encodeURIComponent(v));
    }
    q.push("embed=1");
    return appUrl + "/prenota/" + encodeURIComponent(slug) + "?" + q.join("&");
  }

  function iframe(src, titolo) {
    var f = document.createElement("iframe");
    f.src = src;
    f.title = titolo || "Prenota un appuntamento";
    f.setAttribute("loading", "lazy");
    f.setAttribute("allow", "clipboard-write");
    f.style.border = "0";
    f.style.width = "100%";
    f.style.background = "transparent";
    return f;
  }

  /* ── 1) riquadro nella pagina ──────────────────────────────────────────── */
  function montaInline() {
    var nodi = document.querySelectorAll("[data-prenota-inline]");
    for (var i = 0; i < nodi.length; i++) {
      (function (host) {
        if (host.getAttribute("data-eic-montato")) return;
        host.setAttribute("data-eic-montato", "1");
        var slug = host.getAttribute("data-prenota-inline");
        var f = iframe(url(slug, host));
        f.style.height = (host.getAttribute("data-height") || "760") + "px";
        f.style.borderRadius = "12px";
        f.setAttribute("data-eic-slug", slug);
        host.appendChild(f);
      })(nodi[i]);
    }
  }

  /* ── 2) finestra al clic ───────────────────────────────────────────────── */
  var overlay = null;
  function apri(slug, el) {
    chiudi();
    overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Prenota un appuntamento");
    var o = overlay.style;
    o.position = "fixed"; o.inset = "0"; o.zIndex = "2147483646";
    o.background = "rgba(15,23,42,.55)";
    o.display = "flex"; o.alignItems = "center"; o.justifyContent = "center";
    o.padding = "16px";

    var box = document.createElement("div");
    var b = box.style;
    b.position = "relative"; b.background = "#fff"; b.borderRadius = "14px";
    b.width = "min(980px, 100%)"; b.height = "min(760px, 92vh)";
    b.overflow = "hidden"; b.boxShadow = "0 24px 60px rgba(0,0,0,.28)";

    var chiudiBtn = document.createElement("button");
    chiudiBtn.type = "button";
    chiudiBtn.setAttribute("aria-label", "Chiudi");
    chiudiBtn.innerHTML = "&times;";
    var c = chiudiBtn.style;
    c.position = "absolute"; c.top = "8px"; c.right = "12px"; c.zIndex = "2";
    c.border = "0"; c.background = "transparent"; c.fontSize = "28px";
    c.lineHeight = "1"; c.cursor = "pointer"; c.color = "#475569";
    chiudiBtn.onclick = chiudi;

    var f = iframe(url(slug, el));
    f.style.height = "100%";

    box.appendChild(chiudiBtn);
    box.appendChild(f);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (ev) { if (ev.target === overlay) chiudi(); });
    document.addEventListener("keydown", suEsc);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
  }
  function chiudi() {
    if (!overlay) return;
    document.removeEventListener("keydown", suEsc);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.body.style.overflow = "";
  }
  function suEsc(ev) { if (ev.key === "Escape") chiudi(); }

  function collegaBottoni() {
    document.addEventListener("click", function (ev) {
      var el = ev.target;
      while (el && el !== document.body) {
        if (el.getAttribute && el.getAttribute("data-prenota")) {
          ev.preventDefault();
          apri(el.getAttribute("data-prenota"), el);
          return;
        }
        el = el.parentNode;
      }
    });
  }

  /* ── 3) bottone fisso in basso ─────────────────────────────────────────── */
  function montaBadge() {
    if (!thisScript) return;
    var slug = thisScript.getAttribute("data-badge");
    if (!slug || document.getElementById("eic-prenota-badge")) return;
    var testo = thisScript.getAttribute("data-badge-text") || "Prenota un appuntamento";
    var posizione = thisScript.getAttribute("data-badge-position") === "bottom-left" ? "left" : "right";
    var b = document.createElement("button");
    b.id = "eic-prenota-badge";
    b.type = "button";
    b.textContent = testo;
    var s = b.style;
    s.position = "fixed"; s.bottom = "20px"; s[posizione] = "20px";
    s.zIndex = "2147483645";
    s.padding = "12px 18px"; s.borderRadius = "999px"; s.border = "0";
    s.background = thisScript.getAttribute("data-badge-color") || "#0f172a";
    s.color = "#fff"; s.fontWeight = "600"; s.cursor = "pointer";
    s.fontFamily = "system-ui,-apple-system,Segoe UI,sans-serif";
    s.boxShadow = "0 10px 24px rgba(0,0,0,.22)";
    b.onclick = function () { apri(slug, thisScript); };
    document.body.appendChild(b);
  }

  /* ── messaggi dalla pagina di prenotazione ─────────────────────────────── */
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.source !== "eic-prenota") return;
    if (d.event === "altezza" && d.height) {
      // Il riquadro nella pagina cresce e si accorcia da solo.
      var f = document.querySelectorAll('iframe[data-eic-slug]');
      for (var i = 0; i < f.length; i++) {
        if (f[i].contentWindow === ev.source) f[i].style.height = Math.max(420, d.height) + "px";
      }
    } else if (d.event === "prenotato") {
      try {
        window.dispatchEvent(new CustomEvent("eic:appuntamento-prenotato", { detail: d.detail || {} }));
      } catch (e) { /* browser vecchi */ }
      // La finestra si chiude da sola dopo la conferma.
      if (overlay) setTimeout(chiudi, 2500);
    } else if (d.event === "chiudi") {
      chiudi();
    }
  });

  function avvia() { montaInline(); collegaBottoni(); montaBadge(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia);
  else avvia();
})();
