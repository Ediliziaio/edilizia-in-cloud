import type { MaggiorazioneTipo } from "@/types/articleFamily";

/** Regole comuni delle varianti, indipendenti da griglie, UI e database. Importi unitari. */
export interface AssePrezzo {
  codice: string;
  nome?: string;
  obbligatorio?: boolean;
  sort_order?: number;
  values: Array<{
    id: string;
    valore?: string;
    attivo?: boolean | null;
    maggiorazione_tipo: MaggiorazioneTipo;
    maggiorazione_valore?: number | null;
    maggiorazione_acquisto?: number | null;
    prezzo_vendita?: number | null;
    prezzo_acquisto?: number | null;
  }>;
}

export interface OpzioneApplicata {
  axis_codice: string;
  value_valore: string;
  tipo: string;
  valore: number;
  delta_vendita: number;
  delta_acquisto: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function applicaPrezzoOpzioni(args: {
  vendita: number;
  acquisto: number;
  costoCompleto?: boolean;
  axes: AssePrezzo[];
  selections: Record<string, string>;
  modalitaPrezzoBase?: string | null;
  mq: number | null;
  ml: number | null;
}) {
  let vendita = args.vendita;
  let acquisto = args.acquisto;
  let costoCompleto = args.costoCompleto ?? acquisto > 0;
  const warnings: string[] = [];
  const applicate: OpzioneApplicata[] = [];
  const selezionate = [...args.axes]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap(axis => {
      const id = args.selections[axis.codice];
      if (!id) {
        if (axis.obbligatorio) warnings.push(`Asse "${axis.nome ?? axis.codice}" obbligatorio non selezionato`);
        return [];
      }
      const value = axis.values.find(v => v.id === id && v.attivo !== false);
      if (!value) {
        warnings.push(`Valore non trovato o inattivo per asse ${axis.nome ?? axis.codice}`);
        return [];
      }
      return [{ axis, value }];
    });
  const propri = new Set<string>();
  const registra = (axis: AssePrezzo, value: AssePrezzo["values"][number], tipo: string, valore: number, primaV: number, primaA: number) => {
    applicate.push({ axis_codice: axis.codice, value_valore: value.valore ?? value.id,
      tipo, valore, delta_vendita: round2(vendita - primaV), delta_acquisto: round2(acquisto - primaA) });
  };

  // Il prezzo sostitutivo prevale sul supplemento, mai sul prezzo L×H della griglia.
  if (args.modalitaPrezzoBase !== "griglia") {
    for (const { axis, value } of selezionate) {
      if (!(Number(value.prezzo_vendita) > 0)) continue;
      const primaV = vendita, primaA = acquisto;
      const fattore = args.modalitaPrezzoBase === "mq" && args.mq != null ? args.mq : 1;
      vendita = Number(value.prezzo_vendita) * fattore;
      costoCompleto = Number(value.prezzo_acquisto) > 0;
      // Mantiene la semantica legacy del numero, ma non certifica il margine
      // della variante quando manca il suo costo specifico.
      if (costoCompleto) acquisto = Number(value.prezzo_acquisto) * fattore;
      propri.add(axis.codice);
      registra(axis, value, "prezzo_assoluto", Number(value.prezzo_vendita), primaV, primaA);
    }
  }
  for (const { axis, value } of selezionate) {
    if (propri.has(axis.codice) || value.maggiorazione_tipo !== "percentuale") continue;
    const primaV = vendita, primaA = acquisto;
    vendita *= 1 + Number(value.maggiorazione_valore ?? 0) / 100;
    acquisto *= 1 + Number(value.maggiorazione_acquisto ?? 0) / 100;
    registra(axis, value, value.maggiorazione_tipo, Number(value.maggiorazione_valore ?? 0), primaV, primaA);
  }
  for (const { axis, value } of selezionate) {
    if (propri.has(axis.codice) || value.maggiorazione_tipo === "none" || value.maggiorazione_tipo === "percentuale") continue;
    let fattore = 0;
    switch (value.maggiorazione_tipo) {
      case "fisso_pz": fattore = 1; break;
      case "fisso_mq":
        if (args.mq != null) fattore = args.mq;
        else warnings.push(`Maggiorazione mq su asse ${axis.nome ?? axis.codice} ma mq non calcolabile`);
        break;
      case "fisso_ml":
        if (args.ml != null) fattore = args.ml;
        else warnings.push(`Maggiorazione ml su asse ${axis.nome ?? axis.codice} ma ml non calcolabile`);
        break;
      case "fisso_mc":
        warnings.push(`Maggiorazione mc non ancora supportata (asse ${axis.nome ?? axis.codice})`);
        break;
    }
    const primaV = vendita, primaA = acquisto;
    vendita += Number(value.maggiorazione_valore ?? 0) * fattore;
    acquisto += Number(value.maggiorazione_acquisto ?? 0) * fattore;
    registra(axis, value, value.maggiorazione_tipo, Number(value.maggiorazione_valore ?? 0), primaV, primaA);
  }
  if (vendita < 0 || acquisto < 0) {
    warnings.push("Le riduzioni delle varianti portano il prezzo sotto zero: conta 0 €, controlla le maggiorazioni");
    vendita = Math.max(0, vendita);
    acquisto = Math.max(0, acquisto);
  }
  return { vendita, acquisto, costoCompleto, applicate, warnings };
}
