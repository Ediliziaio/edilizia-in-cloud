import { gruppoMetodo, etichettaMetodo } from "@/lib/finance/metodoScadenza";
import { nonSiPaga } from "./noteDiCredito";
import { corrispondeRicercaRicevute, terminiRicercaRicevute } from "./ricercaRicevute";

type FatturaDellaRata = {
  id: string;
  numero_fattura: string | null;
  cedente_ragione_sociale: string | null;
};
export type RataFornitore = {
  id: string;
  numero: number;
  scadenza: string | null;
  importo: number | null;
  residuo: number | null;
  metodo: string | null;
  stato: string;
  pagata_il: string | null;
  updated_at?: string;
  fatture_ricevute: FatturaDellaRata | null;
  fornitore: string | null;
};
type FatturaNonContabilizzata = FatturaDellaRata & {
  tipo_documento: string | null;
  piano_pagamento: unknown;
  pagata_il: string | null;
};

function dataRata(valore: unknown): string | null {
  if (typeof valore !== "string") return null;
  const data = valore.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data === "9999-12-31") return null;
  const letta = new Date(data);
  return Number.isFinite(letta.getTime()) && letta.toISOString().slice(0, 10) === data ? data : null;
}

export function ribaDaContabilizzare(fattura: FatturaNonContabilizzata): RataFornitore[] {
  if (nonSiPaga(fattura.tipo_documento) || !Array.isArray(fattura.piano_pagamento)) return [];
  return fattura.piano_pagamento.flatMap((rata, i) => {
    if (rata?.modalita !== "MP12") return [];
    const valore = typeof rata.importo === "number" || (typeof rata.importo === "string" && rata.importo.trim())
      ? Number(rata.importo) : NaN;
    const importo = Number.isFinite(valore) && valore >= 0 ? valore : null;
    const scadenza = dataRata(rata.scadenza);
    const pagataIl = dataRata(rata.pagata_il) ?? dataRata(fattura.pagata_il);
    const stato = pagataIl ? "pagata" : "da_contabilizzare";
    return [{
      id: `xml:${fattura.id}:${i + 1}`, numero: i + 1,
      scadenza, importo, residuo: pagataIl ? 0 : importo,
      metodo: "riba", stato, pagata_il: pagataIl, fatture_ricevute: fattura,
      fornitore: fattura.cedente_ragione_sociale,
    }];
  });
}

export function statoConsentePagamentoRata(stato: string): boolean {
  return ["da_pagare", "avvisata", "insoluta"].includes(stato);
}

export function rataDaPagare(rata: RataFornitore): boolean {
  return rata.residuo !== 0 && (rata.stato === "da_contabilizzare" || statoConsentePagamentoRata(rata.stato));
}

export function statoRataFornitore(rata: RataFornitore): string {
  if (["pagata", "stornata", "richiamata", "da_bloccare"].includes(rata.stato)) return rata.stato.replaceAll("_", " ");
  if (rata.residuo === 0 && rata.importo && rata.importo > 0) return "saldato da prima nota";
  if (rata.residuo != null && rata.importo != null && rata.residuo < rata.importo) return "pagamento parziale";
  return rata.stato.replaceAll("_", " ");
}

export function filtraRateFornitori(rate: readonly RataFornitore[], { anno, da, a, soloAperte, soloRiba, cerca, soloSenzaData }: {
  anno: string; da: string; a: string; soloAperte: boolean; soloRiba: boolean; cerca: string; soloSenzaData?: boolean;
}): RataFornitore[] {
  const termini = terminiRicercaRicevute(cerca);
  return rate.filter(r => {
    if (soloSenzaData ? !!r.scadenza : (da || a) && (!r.scadenza || (da && r.scadenza < da) || (a && r.scadenza > a))) return false;
    const f = r.fatture_ricevute;
    return (soloSenzaData || da || a || anno === "all" || r.scadenza?.startsWith(anno + "-")) &&
      r.stato !== "stornata" && (!soloAperte || rataDaPagare(r)) &&
      (!soloRiba || gruppoMetodo(r.metodo) === "riba") &&
      corrispondeRicercaRicevute(termini, [f?.numero_fattura, r.fornitore, etichettaMetodo(r.metodo)]);
  });
}

const importoCsv = new Intl.NumberFormat("it-IT", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const colonneRateFornitori = [
  { key: "data", label: "Scadenza rata" },
  { key: "fornitore", label: "Fornitore" },
  { key: "fattura", label: "Numero fattura" },
  { key: "numero", label: "Numero rata" },
  { key: "metodo", label: "Modalità" },
  { key: "importo", label: "Importo rata (€)" },
  { key: "aperto", label: "Da pagare (€)" },
  { key: "stato", label: "Stato" },
  { key: "pagata", label: "Pagata il" },
];
export function righeRateFornitori(rate: readonly RataFornitore[]) {
  return rate.map(r => ({
    data: r.scadenza ?? "", fornitore: r.fornitore ?? "",
    fattura: r.fatture_ricevute?.numero_fattura ?? "", numero: String(r.numero),
    metodo: gruppoMetodo(r.metodo) === "riba" ? "Ri.Ba." : etichettaMetodo(r.metodo) ?? "",
    importo: r.importo != null ? importoCsv.format(r.importo) : "",
    aperto: !rataDaPagare(r) ? "0,00" : r.residuo != null ? importoCsv.format(r.residuo) : "",
    stato: statoRataFornitore(r), pagata: r.pagata_il ?? "",
  }));
}
