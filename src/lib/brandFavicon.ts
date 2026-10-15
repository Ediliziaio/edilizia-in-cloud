/** Ripristina l'icona precedente quando cambia azienda o si rimuove l'icona custom. */
export function applyBrandFavicon(url: string | null): () => void {
  if (!url) return () => {};
  const existing = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  const link = existing ?? document.createElement("link");
  const previousHref = link.getAttribute("href");
  if (!existing) {
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
  return () => {
    if (!existing) link.remove();
    else if (previousHref === null) link.removeAttribute("href");
    else link.setAttribute("href", previousHref);
  };
}
