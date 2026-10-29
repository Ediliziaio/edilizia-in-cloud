/**
 * La detrazione fiscale nel preventivo con computo (29/10/2026): quanto il
 * cliente recupera in dichiarazione e in quante rate. È un conto indicativo per
 * aiutare la vendita, non una consulenza: l'aliquota resta modificabile e il
 * PDF dice di verificarla. Le aliquote di partenza sono quelle per le spese
 * 2026 (50% abitazione principale, 36% altre unità).
 */
import { arrotondaDecimale, numeroEditor, type BozzaComputo } from "./editorNativo";

export const TIPI_DETRAZIONE: Record<Exclude<BozzaComputo["detrazione"]["tipo"], "nessuna">, { nome: string; percentuale: number | null; massimale: number | null }> = {
  "ristrutturazione-prima-casa": { nome: "Bonus ristrutturazione · abitazione principale", percentuale: 50, massimale: 96_000 },
  "ristrutturazione-altre": { nome: "Bonus ristrutturazione · altre abitazioni", percentuale: 36, massimale: 96_000 },
  "ecobonus-prima-casa": { nome: "Ecobonus · abitazione principale", percentuale: 50, massimale: null },
  "ecobonus-altre": { nome: "Ecobonus · altre abitazioni", percentuale: 36, massimale: null },
  "sismabonus-prima-casa": { nome: "Sismabonus · abitazione principale", percentuale: 50, massimale: 96_000 },
  "sismabonus-altre": { nome: "Sismabonus · altre abitazioni", percentuale: 36, massimale: 96_000 },
  personalizzata: { nome: "Detrazione", percentuale: null, massimale: null },
};

export type CalcoloDetrazione = { nome: string; percentuale: number; base: number; detraibile: number; rata: number; anni: number; netto: number; nota: string; errore: string; avvisi: string[] };

/** I tetti della detrazione dell'ecobonus per tipo di intervento (importo massimo detraibile). */
export const TETTI_ECOBONUS = [
  ["60000", "Serramenti, schermature solari, coibentazione, solare termico"],
  ["30000", "Generatori di calore: caldaie a condensazione, pompe di calore"],
  ["100000", "Riqualificazione energetica globale"],
] as const;

/** `spesa` = quanto paga il cliente (IVA compresa se c'è). `ivaInclusa` = la spesa comprende l'IVA. */
export function calcolaDetrazione(d: BozzaComputo["detrazione"], spesa: number, ivaInclusa = true): CalcoloDetrazione | null {
  if (d.tipo === "nessuna" || spesa <= 0) return null;
  const tipo = TIPI_DETRAZIONE[d.tipo];
  const scritta = d.percentuale.trim() ? numeroEditor(d.percentuale) : null;
  const percentuale = scritta ?? tipo.percentuale;
  const nome = tipo.nome;
  if (percentuale == null || percentuale <= 0 || percentuale > 110) return { nome, percentuale: 0, base: spesa, detraibile: 0, rata: 0, anni: d.anni, netto: spesa, nota: d.nota, errore: "Scrivi la percentuale della detrazione (per esempio 50).", avvisi: [] };
  const avvisi: string[] = [];
  // Il massimale di SPESA (bonus ristrutturazione e sismabonus: 96.000 € per unità immobiliare).
  const base = tipo.massimale ? Math.min(spesa, tipo.massimale) : spesa;
  if (tipo.massimale && spesa > tipo.massimale) avvisi.push(`Spesa oltre il massimale di ${tipo.massimale.toLocaleString("it-IT")} € per unità immobiliare: la detrazione si calcola su ${tipo.massimale.toLocaleString("it-IT")} €.`);
  // Il tetto della DETRAZIONE (ecobonus, per tipo di intervento), se scritto.
  const tetto = (d.tetto ?? "").trim() ? numeroEditor(d.tetto) : null;
  let detraibile = arrotondaDecimale(base * percentuale / 100);
  if (tetto != null && tetto > 0 && detraibile > tetto) { avvisi.push(`Detrazione limitata al tetto di ${tetto.toLocaleString("it-IT")} € per questo intervento.`); detraibile = tetto; }
  if (d.tipo.startsWith("ecobonus") && tetto == null) avvisi.push("Per l'ecobonus scegli il tipo di intervento: ognuno ha il suo tetto di detrazione.");
  if (!ivaInclusa) avvisi.push("La spesa detraibile comprende l'IVA: imposta l'IVA nel passo Economia, ora il calcolo è sull'imponibile.");
  return { nome, percentuale, base, detraibile, rata: arrotondaDecimale(detraibile / d.anni), anni: d.anni, netto: arrotondaDecimale(spesa - detraibile), nota: d.nota, errore: "", avvisi };
}

export const AVVERTENZA_DETRAZIONE = "Importi indicativi. La detrazione spetta a chi sostiene la spesa e ha imposta sufficiente, con pagamento tracciato (bonifico parlante) e i requisiti di legge; aliquote e massimali vanno verificati con il proprio consulente fiscale al momento della spesa.";
