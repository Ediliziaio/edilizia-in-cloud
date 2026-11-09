/**
 * I registri IVA da stampare (09/11/2026).
 *
 * La pagina mostra vendite e acquisti e li esporta in CSV. Da stampare non
 * c'era niente: chi deve portare il registro del trimestre al commercialista
 * si trovava un file di numeri senza intestazione né totali.
 *
 * Gli importi arrivano in centesimi, come nel resto della fatturazione: qui si
 * dividono una volta sola, all'ultimo momento, per non perdere centesimi per
 * strada.
 */
import {
  htmlDocumentoContabile,
  type AziendaIntestazione,
} from "./documentoContabile";
import { periodoInLettere } from "./registroPrimaNota";

export interface RigaIva {
  date: string;
  periodDate: string;
  number: string;
  counterparty: string;
  side: "vendite" | "acquisti";
  /** In centesimi, come li tiene la fatturazione. */
  base: number | null;
  tax: number | null;
  rate: string | null;
  nature: string;
  /** Proiezione del reverse charge: non è una registrazione. */
  synthetic?: boolean;
}

export interface TotaliIva {
  imponibile: number;
  imposta: number;
  documenti: number;
}

export interface GruppoAliquota {
  /** «22%», «10%», oppure la natura quando l'aliquota non c'è («N6.7»). */
  chiave: string;
  imponibile: number;
  imposta: number;
  righe: number;
}

const inEuro = (centesimi: number | null): number =>
  centesimi === null ? 0 : Math.round(centesimi) / 100;

/** Somma imponibile e imposta, e conta i documenti distinti (non le righe). */
export function totaliIva(righe: readonly RigaIva[]): TotaliIva {
  let imponibile = 0;
  let imposta = 0;
  for (const r of righe) {
    imponibile += inEuro(r.base);
    imposta += inEuro(r.tax);
  }
  return {
    imponibile: Math.round(imponibile * 100) / 100,
    imposta: Math.round(imposta * 100) / 100,
    documenti: new Set(righe.map((r) => `${r.side}|${r.number}|${r.date}`)).size,
  };
}

/**
 * Il riepilogo per aliquota, che è la parte che il commercialista guarda per
 * prima. Dove l'aliquota manca comanda la natura: un'operazione esente non è
 * «0%», è N4, e tenerle insieme nasconderebbe il motivo.
 */
export function perAliquota(righe: readonly RigaIva[]): GruppoAliquota[] {
  const mappa = new Map<string, GruppoAliquota>();
  for (const r of righe) {
    const chiave = r.rate ? `${r.rate}%` : r.nature || "Senza aliquota";
    const g = mappa.get(chiave) ?? { chiave, imponibile: 0, imposta: 0, righe: 0 };
    g.imponibile = Math.round((g.imponibile + inEuro(r.base)) * 100) / 100;
    g.imposta = Math.round((g.imposta + inEuro(r.tax)) * 100) / 100;
    g.righe += 1;
    mappa.set(chiave, g);
  }
  // Prima le aliquote dalla più alta, poi le nature in ordine alfabetico.
  return [...mappa.values()].sort((a, b) => {
    const na = Number.parseFloat(a.chiave), nb = Number.parseFloat(b.chiave);
    const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
    if (aNum && bNum) return nb - na;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.chiave.localeCompare(b.chiave, "it");
  });
}

const euro = (n: number): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: "always",
  }).format(n);

const dataIT = (iso: string): string => {
  const [a, m, g] = (iso ?? "").slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

const TITOLI: Record<string, string> = {
  vendite: "Registro IVA vendite",
  acquisti: "Registro IVA acquisti",
  tutti: "Registro IVA — tutti i documenti",
};

/**
 * Nel registro vendite conta la data di emissione; negli acquisti la data da
 * cui l'IVA si detrae, che può essere di un mese diverso da quello della
 * fattura. Sono due colonne, e sul foglio si vedono tutt'e due.
 */
export function htmlRegistroIva(d: {
  azienda: AziendaIntestazione;
  righe: readonly RigaIva[];
  lato: "vendite" | "acquisti" | "tutti";
  dal: string;
  al: string;
}): string {
  const righe = [...d.righe].sort(
    (a, b) =>
      a.periodDate.localeCompare(b.periodDate) ||
      a.number.localeCompare(b.number, "it", { numeric: true }),
  );
  const t = totaliIva(righe);
  const gruppi = perAliquota(righe);
  const proiezioni = righe.filter((r) => r.synthetic).length;

  return htmlDocumentoContabile<RigaIva>({
    titolo: TITOLI[d.lato] ?? TITOLI.tutti,
    periodo: periodoInLettere(d.dal, d.al),
    sottotitolo:
      d.lato === "acquisti"
        ? "Ordinato per data di detrazione: è quella che decide in che periodo l'IVA si porta in detrazione, e può cadere in un mese diverso da quello della fattura."
        : d.lato === "vendite"
          ? "Ordinato per data di emissione. Le note di credito abbassano imponibile e imposta."
          : "Vendite e acquisti insieme, ordinati per data di periodo.",
    azienda: d.azienda,
    riepilogo: [
      { etichetta: "Documenti", valore: String(t.documenti) },
      { etichetta: "Imponibile", valore: euro(t.imponibile) },
      { etichetta: "Imposta", valore: euro(t.imposta) },
    ],
    colonne: [
      { intestazione: "Data doc.", valore: (r) => dataIT(r.date), compatta: true, larghezza: "9%" },
      { intestazione: d.lato === "acquisti" ? "Detrazione" : "Periodo", valore: (r) => dataIT(r.periodDate), compatta: true, larghezza: "9%" },
      { intestazione: "Numero", valore: (r) => r.number, compatta: true, larghezza: "11%" },
      { intestazione: d.lato === "acquisti" ? "Fornitore" : "Cliente", valore: (r) => r.counterparty, larghezza: "27%" },
      ...(d.lato === "tutti" ? [{ intestazione: "Registro", valore: (r: RigaIva) => (r.side === "vendite" ? "Vendite" : "Acquisti"), larghezza: "9%" }] : []),
      { intestazione: "Imponibile", valore: (r) => euro(inEuro(r.base)), allinea: "destra" as const, compatta: true, larghezza: "12%" },
      { intestazione: "Imposta", valore: (r) => euro(inEuro(r.tax)), allinea: "destra" as const, compatta: true, larghezza: "11%" },
      { intestazione: "Aliq./Nat.", valore: (r) => (r.rate ? `${r.rate}%` : r.nature), compatta: true, larghezza: "8%" },
    ],
    righe,
    totali: [
      ...gruppi.map((g) => ({
        etichetta: `${g.chiave} — imponibile ${euro(g.imponibile)}`,
        valore: euro(g.imposta),
      })),
      { etichetta: `Totale imponibile (${t.documenti} documenti)`, valore: euro(t.imponibile) },
      { etichetta: "Totale imposta", valore: euro(t.imposta), forte: true },
    ],
    vuoto: "Nessun documento in questo periodo.",
    ...(proiezioni
      ? {
          // Le proiezioni del reverse charge non sono registrazioni: si dicono.
          evidenzia: (r: RigaIva) => !!r.synthetic,
        }
      : {}),
  });
}

/** Le righe del foglio Excel: importi in euro, non in centesimi. */
export function righeExcelIva(righe: readonly RigaIva[]) {
  return righe.map((r) => ({
    data: dataIT(r.date),
    periodo: dataIT(r.periodDate),
    numero: r.number,
    controparte: r.counterparty,
    registro: r.side === "vendite" ? "Vendite" : "Acquisti",
    imponibile: inEuro(r.base),
    imposta: inEuro(r.tax),
    aliquota: r.rate ? `${r.rate}%` : "",
    natura: r.nature,
    nota: r.synthetic ? "Proiezione reverse charge, non registrazione" : "",
  }));
}
