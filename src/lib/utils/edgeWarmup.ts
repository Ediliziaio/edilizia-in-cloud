/**
 * Compatibilità con i chiamanti del vecchio warmup post-login.
 * I GET anonimi generavano 401 e svegliavano anche worker cron-only.
 * Ora anticipiamo solo DNS/TLS verso l'API: nessuna invocazione Edge,
 * nessuna credenziale e nessuna modifica ad autenticazione o sincronizzazioni.
 */
let warmupAttempted = false;

export function warmupCriticalEdgeFunctions(): void {
  if (warmupAttempted || typeof window === 'undefined' || typeof document === 'undefined') return;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
  const configured = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!configured) return;
  let origin: string;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:') return;
    origin = url.origin;
  } catch { return; }
  warmupAttempted = true;
  if (document.querySelector('link[data-eic-api-preconnect]')) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous';
  link.dataset.eicApiPreconnect = 'true';
  document.head.appendChild(link);
}

export function resetWarmupState(): void {
  warmupAttempted = false;
}
