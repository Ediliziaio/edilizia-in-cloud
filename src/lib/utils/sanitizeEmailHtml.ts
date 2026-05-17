/**
 * sanitizeEmailHtml — S1-04
 *
 * Sanitizza il body HTML di email visualizzate nella UI (CustomerDiaryPanel
 * e simili). Usa DOMPurify con whitelist conservativa, poi applica
 * post-processing locale per:
 *   - forzare target="_blank" + rel="noopener noreferrer nofollow" su <a>
 *   - rimuovere <img src="data:..."> molto pesanti (anti-tracking + memoria)
 *
 * Il post-processing e' fatto in DOM una volta su una stringa parsata,
 * NON via DOMPurify.addHook (che e' globale e impatterebbe ogni altro
 * sanitize in app).
 */
import DOMPurify from "dompurify";

const EMAIL_SANITIZE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "em", "u", "s", "code", "pre",
    "a", "img",
    "ul", "ol", "li",
    "blockquote", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td",
    "div", "span",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel",
    "src", "alt", "title", "width", "height",
    "class", "style",
  ],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta", "base"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

const MAX_DATA_URI_LENGTH = 100_000;

export function sanitizeEmailHtml(raw: string | null | undefined): string {
  if (!raw) return "";

  const clean = DOMPurify.sanitize(raw, EMAIL_SANITIZE_CONFIG);

  // Post-process via DOM locale (no hook globale)
  if (typeof window === "undefined" || !window.document) {
    return clean;
  }

  const container = window.document.createElement("div");
  container.innerHTML = clean;

  // Links → external safe
  for (const a of container.querySelectorAll("a")) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer nofollow");
  }

  // Img data: troppo pesanti → rimuovi src (placeholder vuoto)
  for (const img of container.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("data:") && src.length > MAX_DATA_URI_LENGTH) {
      img.removeAttribute("src");
      img.setAttribute("alt", img.getAttribute("alt") || "[immagine rimossa]");
    }
  }

  return container.innerHTML;
}
