/**
 * I file del «preventivo da foto» stanno in `documenti-smart` sotto `captures/<azienda>/…`.
 *
 * La funzione li legge con la chiave di servizio, che non conosce regole di accesso: fino al 23/11/2026
 * scaricava qualunque percorso arrivasse nel corpo della richiesta, anche quello di un'altra azienda.
 * Un percorso vale solo se sta nella cartella dell'azienda già verificata, senza risalite.
 */
export function percorsoCatturaDellAzienda(percorso: unknown, companyId: string): boolean {
  if (typeof percorso !== "string" || !/^[0-9a-f-]{36}$/i.test(companyId)) return false;
  if (percorso.length > 600 || percorso.includes("..") || percorso.includes("\\") || percorso.includes("//") || /[\u0000-\u001f]/.test(percorso)) return false;
  return percorso.startsWith(`captures/${companyId}/`) && percorso.length > `captures/${companyId}/`.length;
}

export const MAX_FOTO_CATTURA = 10;
