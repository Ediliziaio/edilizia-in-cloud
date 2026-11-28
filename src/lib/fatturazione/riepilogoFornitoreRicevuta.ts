import { eAutofattura, eNotaDiCredito } from "./noteDiCredito";

type DocumentoFornitore = {
  id: string;
  tipo_documento: string | null;
  stato: string | null;
  totale_documento: number | null;
  pagatoFattura?: number | null;
  residuoFattura: number | null;
};

export type ImportoFornitore = { totale: number | null; daVerificare: number };
type Accumulatore = { centesimi: number; noti: number; daVerificare: number };

/**
 * Importi su tutti i documenti disponibili del fornitore. Le note diminuiscono
 * il fatturato; i saldi arrivano dal calcolo esistente e non vengono ridotti
 * nuovamente, perché possono già includere gli storni e gli anticipi.
 */
export function riepilogoFornitore(fatture: readonly DocumentoFornitore[]) {
  const fatturato: Accumulatore = { centesimi: 0, noti: 0, daVerificare: 0 };
  const pagato: Accumulatore = { centesimi: 0, noti: 0, daVerificare: 0 };
  const residuo: Accumulatore = { centesimi: 0, noti: 0, daVerificare: 0 };
  const ids = new Set<string>();
  let documenti = 0, fatturePagabili = 0;
  const aggiungi = (acc: Accumulatore, valore: number | null | undefined, nota = false) => {
    const centesimi = valore == null ? NaN : Math.round(Number(valore) * 100);
    if (!Number.isSafeInteger(centesimi)) { acc.daVerificare++; return; }
    acc.centesimi += nota ? -Math.abs(centesimi) : centesimi;
    acc.noti++;
  };
  for (const f of fatture) {
    if (ids.has(f.id) || ["annullata", "scartata", "rifiutata", "eliminata"].includes(f.stato ?? "") || eAutofattura(f.tipo_documento)) continue;
    ids.add(f.id);
    documenti++;
    const nota = eNotaDiCredito(f.tipo_documento);
    aggiungi(fatturato, f.totale_documento, nota);
    if (nota) continue;
    fatturePagabili++;
    aggiungi(pagato, f.pagatoFattura);
    aggiungi(residuo, f.residuoFattura);
  }
  const risultato = (acc: Accumulatore): ImportoFornitore => ({
    totale: acc.noti === 0 && acc.daVerificare > 0 ? null : acc.centesimi / 100,
    daVerificare: acc.daVerificare,
  });
  return { documenti, fatturePagabili, fatturato: risultato(fatturato), pagato: risultato(pagato), residuo: risultato(residuo) };
}
