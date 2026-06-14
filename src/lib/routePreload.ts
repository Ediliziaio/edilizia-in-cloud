/**
 * Prefetch additivo dei chunk JS delle pagine più usate, al passaggio del mouse
 * (o focus) sui link di navigazione. È best-effort: se fallisce non rompe nulla,
 * la pagina si carica comunque normalmente al click. Serve a togliere il
 * "flash" di download del chunk al primo accesso a una sezione, su rete lenta.
 *
 * Gli specifier di import sono LETTERALI e identici a quelli in companyRoutes.tsx
 * così Vite condivide lo stesso chunk (il prefetch scalda esattamente quello che
 * servirà al click). Solo le destinazioni più frequenti: niente preload aggressivo
 * di tutto (saturerebbe la banda su mobile).
 */
type Loader = () => Promise<unknown>;

const PRELOADERS: Record<string, Loader> = {
  "/azienda": () => import("@/pages/azienda/CompanyDashboard"),
  "/azienda/clienti": () => import("@/pages/azienda/CustomersList"),
  "/azienda/email": () => import("@/pages/azienda/email/EmailClientPage"),
  "/azienda/prima-nota": () => import("@/pages/azienda/PrimaNota"),
  "/azienda/documenti": () => import("@/pages/azienda/fatturazione/DocumentiFiscaliList"),
  "/azienda/marketing": () => import("@/pages/azienda/marketing/MarketingDashboard"),
  "/azienda/marketing/contatti": () => import("@/pages/azienda/marketing/MarketingContacts"),
  "/azienda/marketing/opportunita": () => import("@/pages/azienda/marketing/MarketingOpportunities"),
  "/azienda/marketing/calendario": () => import("@/pages/azienda/marketing/MarketingCalendar"),
};

const done = new Set<string>();

function resolveKey(href: string): string | null {
  let path = href;
  try {
    path = new URL(href, "http://_").pathname;
  } catch {
    /* href è già un pathname */
  }
  path = path.replace(/\/+$/, "") || "/";
  if (PRELOADERS[path]) return path;
  // Tollerante a eventuali prefissi (white-label): cerca il segmento /azienda/...
  const idx = path.indexOf("/azienda");
  if (idx >= 0) {
    const tail = path.slice(idx);
    if (PRELOADERS[tail]) return tail;
  }
  return null;
}

/** Avvia (una sola volta) il prefetch del chunk per la rotta indicata. No-op se
 *  la rotta non è in elenco o è già stata precaricata. Non lancia mai. */
export function preloadRoute(href: string | null | undefined): void {
  if (!href) return;
  const key = resolveKey(href);
  if (!key || done.has(key)) return;
  done.add(key);
  Promise.resolve()
    .then(() => PRELOADERS[key]())
    .catch(() => {
      // rete assente / chunk non disponibile: riproveremo al prossimo hover
      done.delete(key);
    });
}
