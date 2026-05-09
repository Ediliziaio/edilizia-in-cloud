/**
 * Edilizia in Cloud — Public Chat Widget Embed Loader
 *
 * Vanilla JS, no dependencies, ~2KB minified.
 * Funziona ovunque (WordPress, Wix, Webflow, sito statico, qualsiasi cosa).
 *
 * Usage:
 *   <script src="https://app.ediliziaincloud.com/embed.js" data-token="UUID"></script>
 *
 * Optional data attributes:
 *   data-token       (REQUIRED)  UUID widget da public_chatbot_settings
 *   data-position    (optional)  "bottom-right" (default) | "bottom-left"
 *   data-app-url     (optional)  override base URL app (default: derive from script src)
 */
(function () {
  "use strict";

  // Trova lo script tag che ci ha caricato
  var scripts = document.getElementsByTagName("script");
  var thisScript = null;
  for (var i = scripts.length - 1; i >= 0; i--) {
    var s = scripts[i];
    if (s.src && s.src.indexOf("/embed.js") !== -1) {
      thisScript = s;
      break;
    }
  }

  if (!thisScript) {
    console.error("[EICChat] Cannot locate embed script tag");
    return;
  }

  var token = thisScript.getAttribute("data-token");
  if (!token) {
    console.error("[EICChat] Missing data-token attribute on script tag");
    return;
  }

  var position = thisScript.getAttribute("data-position") || "bottom-right";
  if (position !== "bottom-right" && position !== "bottom-left") {
    position = "bottom-right";
  }

  // Deriva URL base dall'src dello script (es. https://app.ediliziaincloud.com/embed.js)
  var appUrl =
    thisScript.getAttribute("data-app-url") ||
    thisScript.src.replace(/\/embed\.js.*$/, "");

  // Evita doppio mount se lo script è incluso più volte
  if (document.getElementById("eic-public-chat-iframe")) {
    return;
  }

  // Aspetta DOMContentLoaded se necessario
  function mount() {
    var iframe = document.createElement("iframe");
    iframe.id = "eic-public-chat-iframe";
    iframe.title = "Chat con Edilizia in Cloud";
    iframe.src =
      appUrl +
      "/widget?token=" +
      encodeURIComponent(token) +
      "&pos=" +
      encodeURIComponent(position);

    // Sandbox: necessario per fetch + storage + scripts
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups",
    );
    iframe.setAttribute("allow", "clipboard-write");

    // Style: posizionato sopra tutto, trasparente, dimensione fissa per il FAB chiuso
    // Quando l'utente apre il widget, lo dimensioniamo via postMessage (vedi sotto)
    var style = iframe.style;
    style.position = "fixed";
    style.bottom = "0";
    style[position === "bottom-left" ? "left" : "right"] = "0";
    style.width = "92px"; // FAB closed = 56px + 16px padding × 2
    style.height = "92px";
    style.border = "none";
    style.background = "transparent";
    style.zIndex = "2147483646"; // max z-index per stare sopra tutto
    style.colorScheme = "normal";

    document.body.appendChild(iframe);

    // Listener per resize quando il widget si apre/chiude
    function onMessage(ev) {
      if (!ev.data || ev.data.source !== "eic-public-chat") return;

      if (ev.data.event === "open") {
        // Allarga iframe per ospitare il pannello chat
        style.width = "min(96vw, 400px)";
        style.height = "min(calc(100vh - 32px), 640px)";
      } else if (ev.data.event === "close") {
        // Ridimensiona al solo FAB
        style.width = "92px";
        style.height = "92px";
      } else if (ev.data.event === "qualified") {
        // Lead capture event — può essere ascoltato dal sito host via window event
        try {
          window.dispatchEvent(
            new CustomEvent("eic:lead-qualified", {
              detail: { sessionId: ev.data.session_id },
            }),
          );
        } catch (e) {
          /* old browsers */
        }
      }
    }
    window.addEventListener("message", onMessage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
