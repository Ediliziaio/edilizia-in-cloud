import type { AllegatoXml } from './fatturaRicevutaHtml';

/**
 * Il nome con cui si salva: quello del mittente, senza cartelle e senza caratteri di
 * controllo. Se l'XML dichiara una compressione (ZIP, RAR) e il nome non la porta, si
 * aggiunge l'estensione: Aurora Venti chiamava «…_001.PDF» un file che dentro è uno zip, e
 * noi lo salvavamo così — nessun lettore di PDF lo apriva e sembrava un allegato rotto
 * (25/11/2026: 78 fatture di 5 aziende). I byte restano quelli del mittente: il nome dice
 * cos'è, ad aprire l'archivio ci pensa chi scarica.
 */
export function nomeAllegatoDaSalvare(a: Pick<AllegatoXml, 'nome' | 'compressione'>): string {
  const pulito = (a.nome.split(/[\\/]/).pop() || 'allegato').replace(/\p{Cc}/gu, '_');
  const compressione = a.compressione.trim().toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(compressione) || pulito.toLowerCase().endsWith(`.${compressione}`)) return pulito;
  return `${pulito}.${compressione}`;
}

/** Conserva i byte dichiarati nell'XML, anche per allegati compressi.
 * Il download non esegue né apre il contenuto fornito dal mittente. */
export function scaricaAllegatoXml(a: AllegatoXml): void {
  const dati = Uint8Array.from(atob(a.base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([dati], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeAllegatoDaSalvare(a);
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
