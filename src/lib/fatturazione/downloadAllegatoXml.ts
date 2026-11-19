import type { AllegatoXml } from './fatturaRicevutaHtml';

/** Conserva i byte dichiarati nell'XML, anche per allegati compressi.
 * Il download non esegue né apre il contenuto fornito dal mittente. */
export function scaricaAllegatoXml(a: AllegatoXml): void {
  const dati = Uint8Array.from(atob(a.base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([dati], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = (a.nome.split(/[\\/]/).pop() || 'allegato').replace(/\p{Cc}/gu, '_');
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
