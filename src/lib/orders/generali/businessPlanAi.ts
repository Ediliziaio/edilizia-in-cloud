import { isCategoriaPiano, indovinaCategoria, CATEGORIE_PIANO } from "./pianoCategorie";
import { leggiNumeroItaliano } from "./pianoExcel";
import type { FoglioBusinessPlan, RigaBusinessPlan } from "./businessPlanImport";

const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const testo = (v: unknown) => typeof v === "string" ? v.trim() : "";
const numero = (v: unknown) => typeof v === "number" ? Number.isFinite(v) ? v : null : typeof v === "string" && v.trim() ? leggiNumeroItaliano(v) : null;
export const meseImportato = (v: unknown): string | null => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;

/** Output AI trattato come dati non fidati; riepiloghi e importi assenti non diventano costi. */
export function scenariBusinessPlanAi(raw: unknown): FoglioBusinessPlan[] {
  const d = obj(raw);
  if (d.valuta && d.valuta !== "EUR") throw new Error("Il piano non è in euro: converti gli importi nel documento prima di importare.");
  if (!Array.isArray(d.scenari) || !d.scenari.length) throw new Error("Nessuno scenario economico leggibile. Usa un PDF con il dettaglio di costi e ricavi.");
  if (d.scenari.length > 20) throw new Error("Il documento contiene più di 20 scenari: carica un piano più piccolo.");
  return d.scenari.map((s, indice): FoglioBusinessPlan => {
    const scenario = obj(s);
    if (!Array.isArray(scenario.righe) || !scenario.righe.length) throw new Error(`Scenario ${indice + 1} senza voci leggibili.`);
    if (scenario.righe.length > 300) throw new Error("Uno scenario supera 300 voci: separa il documento prima di importare.");
    const dettagli = scenario.righe.filter(v => !/^(?:totale (?:costi|ricavi|incassi|operazione|generale|netto|ivato)|subtotale|margine|utile|saldo)(?:\b|\s)/i.test(testo(obj(v).descrizione)));
    if (!dettagli.length) throw new Error("Il PDF contiene soltanto riepiloghi: serve il dettaglio del budget.");
    const righe: RigaBusinessPlan[] = dettagli.map((v, i) => {
      const r = obj(v), descrizione = testo(r.descrizione).slice(0, 300);
      if (!descrizione || (r.tipo !== "costo" && r.tipo !== "ricavo")) throw new Error(`Riga ${i + 1}: descrizione o tipo costo/ricavo non leggibile. Rivedi il documento.`);
      const importo = numero(r.importo_eur), categoria = r.categoria;
      return { riga: i + 1, descrizione, tipo: r.tipo,
        categoria: r.tipo === "costo" && /notai|imposte.*acquist/i.test(descrizione) ? "terreno" : isCategoriaPiano(categoria) && CATEGORIE_PIANO[categoria].tipo === r.tipo ? categoria : indovinaCategoria(descrizione, r.tipo).categoria,
        importo: importo === null ? null : Math.round(importo * 100) / 100,
        problema: importo === null ? "Importo da stimare" : importo < 0 ? "Importo negativo da verificare" : null,
        mese: meseImportato(r.mese), durataMesi: Math.max(1, Math.min(120, Math.round(numero(r.durata_mesi) ?? 1))),
      };
    });
    const avvisi = ["Lettura AI: confronta ogni voce con il PDF prima di confermare. Totali, consuntivi e saldi non sono nuove voci di budget.",
      ...(dettagli.length < scenario.righe.length ? ["Riepiloghi, saldi e margini esclusi dal dettaglio per evitare duplicazioni."] : []),
      ...(righe.some(r => r.importo === null) ? ["Budget parziale: gli importi mancanti restano da stimare."] : []),
      ...(righe.some(r => !r.mese) ? ["Scadenze mancanti: completa i mesi prima di approvare o usare il flusso di cassa."] : []),
      ...(Array.isArray(d.warnings) ? d.warnings.filter((w): w is string => typeof w === "string").slice(0, 20) : []),
    ];
    return { nome: testo(scenario.nome).slice(0, 100) || `Scenario ${indice + 1}`, righe: [], ai: { righe, avvisi, titolo: testo(d.titolo).slice(0, 300), simulazione: obj(scenario.simulazione) } };
  });
}
