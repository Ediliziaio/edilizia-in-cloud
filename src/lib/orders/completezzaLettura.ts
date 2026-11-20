import type { ContractExtract } from "./contractExtract";
const N = "(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{1,2})";
const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const normalizza = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Recupera costi espliciti fuori dalla tabella, soltanto se percentuale, base e importo quadrano. */
export function integraCostiEspliciti(e: ContractExtract, pagine: string[]): ContractExtract {
  const aggiunte: ContractExtract["voci"] = [], avvisi: string[] = [];
  for (const [pagina, testo] of pagine.entries()) {
    const re = new RegExp("TOTALE\\s+(OPERE\\s+[A-ZÀ-Ü ]{2,30}?)\\s*€\\s*(" + N
      + ")\\s+MANODOPERA\\s+([\\s\\S]{0,600}?)\\b(\\d{1,2}(?:[,.]\\d+)?)\\s*%\\s+del totale\\s+(opere [a-zà-ü ]{2,30}?)\\s+€\\s*(" + N + ")", "gi");
    for (const m of testo.matchAll(re)) {
      const base = numero(m[2]), pct = Number(m[4].replace(",", ".")), importo = numero(m[6]);
      if (normalizza(m[1]) !== normalizza(m[5]) || Math.abs(cent(base * pct / 100) - importo) > 0.02) continue;
      if ([...e.voci, ...aggiunte].some(v => /manodopera|operaio/i.test(v.descrizione) && Math.abs(v.quantita * v.prezzo_unitario_eur - importo) < 0.02)) continue;
      aggiunte.push({ codice: "MANODOPERA-P" + (pagina + 1), descrizione: "Manodopera " + normalizza(m[1]) + ": " + pct + "% di " + base.toFixed(2) + " €, importo esplicito nel PDF a pagina " + (pagina + 1),
        quantita: 1, quantita_da_confermare: true, unita: "a corpo", prezzo_unitario_eur: importo, natura: "lavorazione", capitolo: normalizza(m[1]) });
      avvisi.push("Recuperata manodopera fuori tabella a pagina " + (pagina + 1) + ": " + importo.toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €. Il valore 1 è un importo contabile a corpo; ore e risorse restano da definire.");
    }
  }
  return aggiunte.length ? { ...e, voci: [...e.voci, ...aggiunte], warnings: [...e.warnings, ...avvisi] } : e;
}

/** La validità del JSON non dimostra che siano state lette tutte le righe. */
export function avvisiCoperturaLettura(e: ContractExtract): string[] {
  const totale = e.importo_totale_eur ?? e.dati_appalto?.stima_eur;
  if (!(totale != null && totale > 0)) return [];
  if (!e.voci.length) return ["Lettura incompleta: il documento ha un importo ma nessuna voce. Completa la lettura prima di generare fasi e acquisti."];
  const somma = cent(e.voci.reduce((s, v) => s + (v.importo_eur ?? v.quantita * v.prezzo_unitario_eur), 0) * (1 - (e.sconto_globale_pct ?? 0) / 100)
    + e.altri_costi.reduce((s, c) => s + c.importo_eur, 0));
  if (Math.abs(somma - totale) <= 0.05) return [];
  if (somma === 0) return ["Il prezzo complessivo non è ripartito sulle voci: i prezzi zero indicano inclusioni nel forfait, non materiali gratuiti. Verifica che tutte le voci siano presenti."];
  return ["Completezza da verificare: le voci sommano " + somma.toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " € contro " + totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })
    + " € dichiarati. Differenza " + cent(totale - somma).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €: controlla righe mancanti, sconti e incoerenze nel PDF."];
}

export function completaRiscontriLettura(e: ContractExtract, pagine: string[]): ContractExtract {
  const completo = integraCostiEspliciti(e, pagine);
  return { ...completo, warnings: [...new Set([...completo.warnings, ...avvisiCoperturaLettura(completo)])] };
}
