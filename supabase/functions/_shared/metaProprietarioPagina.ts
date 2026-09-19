/**
 * A quale azienda va il lead di una pagina Facebook (19/09/2026).
 *
 * Il webhook cercava la pagina fra gli asset scelti e prendeva il PRIMO
 * risultato, in un ordine qualsiasi. Se la stessa pagina è scelta in due
 * aziende — tipicamente un collegamento vecchio e scaduto rimasto attaccato,
 * come «Flo» su Demo Azienda dall'08/06 — il lead poteva finire in una coda
 * che nessuno elabora più.
 *
 * Regola: vince il collegamento VIVO; a parità, il più recente. Modulo puro,
 * provato in src/test/logic/metaProprietarioPagina.test.ts.
 */

export interface AssetPagina {
  integration_id: string | null;
  company_id: string;
}

export interface StatoCollegamento {
  id: string;
  status: string | null;
  updated_at: string | null;
}

function istante(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function proprietarioPagina(
  assets: AssetPagina[],
  collegamenti: StatoCollegamento[],
): AssetPagina | null {
  if (!assets?.length) return null;
  if (assets.length === 1) return assets[0];
  const perId = new Map((collegamenti ?? []).map((c) => [c.id, c]));
  const vivo = (a: AssetPagina) => (a.integration_id && perId.get(a.integration_id)?.status === "connected" ? 1 : 0);
  const quando = (a: AssetPagina) => istante(a.integration_id ? perId.get(a.integration_id)?.updated_at : null);
  return [...assets].sort((a, b) => vivo(b) - vivo(a) || quando(b) - quando(a))[0];
}
