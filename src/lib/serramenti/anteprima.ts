/**
 * L'anteprima live del preventivo serramenti: dai dati del modulo (campi del
 * preventivo + posizioni) al contratto `AnteprimaPreventivo` che il pannello a
 * destra disegna.
 *
 * Funzione PURA. I conti sono quelli di sempre: `calcolaTotale` (lo usano lo step
 * Economia, l'elenco e il PDF) e `calcolaMargine` per la vista impresa. Qui non si
 * calcola niente di nuovo: si dispone.
 */
import { calcolaTotale, IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import { calcolaMargine, type RigaCostoListino } from "@/lib/serramenti/margine";
import { leggiEsigenze } from "@/lib/preventivatore/esigenze";
import { lavoriDiversiDalCliente } from "@/lib/preventivatore/indirizzoLavori";
import {
  type AnteprimaPreventivo,
  type GruppoAnteprima,
  type RigaAnteprima,
  type VoceTotale,
  dataEstesa,
  formattaEuro,
} from "@/lib/preventivatore/anteprima";
import type {
  SrAccessorioRow, SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrServizioRow, SrTipoIntervento,
} from "@/types/serramenti";

/** Quante esigenze del cliente stampa il PDF dei serramenti (SerramentoPDF: `esigenze.slice(0, 3)`). */
export const ESIGENZE_NEL_PDF_SERRAMENTI = 3;

const compatta = (...parti: Array<string | null | undefined>) =>
  parti.map((p) => p?.trim()).filter(Boolean).join(" ");
const compattaIndirizzo = (...parti: Array<string | null | undefined>) =>
  parti.map((p) => p?.trim()).filter(Boolean).join(", ");

const TITOLO_INTERVENTO: Record<SrTipoIntervento, string> = {
  sostituzione: "Sostituzione serramenti",
  nuova_costruzione: "Serramenti per nuova costruzione",
  ristrutturazione: "Serramenti per ristrutturazione",
  manutenzione: "Manutenzione serramenti",
};

/** «accessorio_tapparella» o «tapparella» → «Tapparella». */
function leggibile(testo: string | null | undefined): string {
  const t = (testo ?? "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** «1200 × 1400 mm» → «120 × 140 cm»: come si dicono le misure di un infisso. */
function misureInCm(larghezzaMm: number | null | undefined, altezzaMm: number | null | undefined, profonditaMm?: number | null): string | null {
  const parti = [larghezzaMm, altezzaMm, profonditaMm].filter((v): v is number => typeof v === "number" && v > 0);
  if (parti.length < 2) return null;
  return `${parti.map((v) => Math.round(v / 10)).join(" × ")} cm`;
}

function coloriDellaRiga(s: Pick<SrSerramentoRow, "colore_interno" | "colore_esterno">): string | null {
  const dentro = s.colore_interno?.trim();
  const fuori = s.colore_esterno?.trim();
  if (dentro && fuori) return dentro.toLowerCase() === fuori.toLowerCase() ? dentro : `${dentro} / ${fuori}`;
  return dentro || fuori || null;
}

function totaleDellaRiga(totale: number | null | undefined, unitario: number | null | undefined, quantita: number | null | undefined): number | null {
  if (totale != null && Number.isFinite(Number(totale))) return Number(totale);
  if (unitario != null && Number.isFinite(Number(unitario))) return Number(unitario) * (quantita ?? 1);
  return null;
}

function rigaSerramento(s: SrSerramentoRow, costo: number | null | undefined): RigaAnteprima {
  const dettaglio = [
    s.ambiente?.trim(),
    misureInCm(s.larghezza_mm, s.altezza_mm),
    s.serie?.trim(),
    s.apertura?.trim(),
    coloriDellaRiga(s),
  ].filter(Boolean).join(" · ");
  return {
    id: s.id,
    titolo: s.tipologia_label?.trim() || leggibile(s.tipologia) || "Serramento",
    dettaglio: dettaglio || null,
    quantita: s.quantita ?? 1,
    unita: "pz",
    prezzoUnitario: s.prezzo_unitario ?? null,
    totale: totaleDellaRiga(s.prezzo_totale, s.prezzo_unitario, s.quantita),
    costo: costo ?? null,
  };
}

function rigaAccessorio(a: SrAccessorioRow, padri: Map<string, SrSerramentoRow>, costo: number | null | undefined): RigaAnteprima {
  const padre = a.serramento_id ? padri.get(a.serramento_id) : undefined;
  const dettaglio = [
    padre ? `per ${padre.tipologia_label?.trim() || leggibile(padre.tipologia)}${padre.ambiente?.trim() ? ` · ${padre.ambiente.trim()}` : ""}` : null,
    misureInCm(a.larghezza_mm, a.altezza_mm, a.profondita_mm),
  ].filter(Boolean).join(" · ");
  return {
    id: a.id,
    titolo: a.descrizione?.trim() || leggibile(a.tipo) || "Accessorio",
    dettaglio: dettaglio || null,
    quantita: a.quantita ?? 1,
    unita: "pz",
    prezzoUnitario: a.prezzo_unitario ?? null,
    totale: totaleDellaRiga(a.prezzo_totale, a.prezzo_unitario, a.quantita),
    costo: costo ?? null,
  };
}

function rigaServizio(m: SrServizioRow, costo: number | null | undefined): RigaAnteprima {
  return {
    id: m.id,
    titolo: m.descrizione?.trim() || "Servizio",
    dettaglio: null,
    quantita: m.quantita ?? 1,
    unita: m.unita?.trim() || null,
    prezzoUnitario: m.prezzo_unitario_vendita ?? null,
    totale: totaleDellaRiga(m.prezzo_totale_vendita, m.prezzo_unitario_vendita, m.quantita),
    costo: costo ?? null,
  };
}

const perPosizione = <T extends { position?: number | null }>(righe: T[]): T[] =>
  [...righe].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

export interface OpzioniAnteprimaSerramenti {
  /** Il nome dell'azienda che emette il preventivo. */
  emittente?: string | null;
  /**
   * Solo per chi vede l'impresa: il costo d'acquisto di una posizione dal
   * listino (`useCostoPosizioneListino`). Senza, niente blocco impresa.
   */
  costoPosizione?: (riga: RigaCostoListino) => number | null;
  margineMinPct?: number;
  /** Per i test: la data di oggi. */
  oggi?: Date;
}

/**
 * `form` è lo stato dei campi del preventivo (vince su `detail.progetto`, come
 * nel wizard: le modifiche non ancora salvate si vedono subito). `detail` manca
 * finché il preventivo è nuovo: si vedono solo i dati del cliente.
 */
export function anteprimaSerramenti(
  form: Partial<SrProgettoRow>,
  detail: SrProgettoDetail | undefined,
  opzioni: OpzioniAnteprimaSerramenti = {},
): AnteprimaPreventivo {
  const progetto = { ...(detail?.progetto ?? {}), ...form } as Partial<SrProgettoRow>;
  const oggi = opzioni.oggi ?? new Date();

  const serramenti = detail ? perPosizione(detail.serramenti) : [];
  const accessori = detail ? perPosizione(detail.accessori) : [];
  const servizi = detail ? perPosizione(detail.servizi ?? []) : [];

  const economia = {
    iva_percentuale: progetto.iva_percentuale ?? 10,
    sconto_percentuale: progetto.sconto_percentuale ?? 0,
    sconto_importo: progetto.sconto_importo ?? 0,
    prezzo_manuale: progetto.prezzo_manuale ?? null,
  };
  const totale = detail ? calcolaTotale(serramenti, accessori, economia, servizi) : null;
  const margine = detail && totale && opzioni.costoPosizione
    ? calcolaMargine({
        detail: { serramenti, accessori, servizi },
        prezzoManuale: totale.prezzo_manuale,
        venditaNetta: totale.imponibile_netto,
        costoPosizione: opzioni.costoPosizione,
        margineMinPct: opzioni.margineMinPct,
      })
    : null;
  const costo = (id: string) => margine?.costoPerRiga.get(id);

  const padri = new Map(serramenti.map((s) => [s.id, s]));
  const gruppi: GruppoAnteprima[] = [
    { id: "serramenti", titolo: "Serramenti", righe: serramenti.map((s) => rigaSerramento(s, costo(s.id))) },
    { id: "complementi", titolo: "Complementi e accessori", righe: accessori.map((a) => rigaAccessorio(a, padri, costo(a.id))) },
    { id: "servizi", titolo: "Servizi e posa", righe: servizi.map((m) => rigaServizio(m, costo(m.id))) },
  ];

  const totali: VoceTotale[] = [];
  const note: string[] = [];
  if (totale) {
    const haVoci = serramenti.length + accessori.length + servizi.length > 0;
    if (haVoci || totale.prezzo_manuale) {
      totali.push({
        id: "lordo",
        etichetta: totale.prezzo_manuale ? "Prezzo concordato" : "Totale voci",
        importo: totale.imponibile_lordo,
      });
      if (totale.sconto > 0.005) {
        const pct = Number(economia.sconto_percentuale) || 0;
        const fisso = Number(economia.sconto_importo) || 0;
        totali.push({
          id: "sconto",
          etichetta: pct > 0 && fisso <= 0 ? `Sconto ${pct}%` : "Sconto",
          importo: totale.sconto,
          negativo: true,
        });
        totali.push({ id: "netto", etichetta: "Imponibile", importo: totale.imponibile_netto });
      }
      if (totale.iva_mista && totale.mista_breakdown) {
        const b = totale.mista_breakdown;
        if (b.imponibile_10 > 0) totali.push({ id: "iva10", etichetta: `IVA 10% su ${formattaEuro(b.imponibile_10)}`, importo: b.iva_10 });
        if (b.imponibile_22 > 0) totali.push({ id: "iva22", etichetta: `IVA 22% su ${formattaEuro(b.imponibile_22)}`, importo: b.iva_22 });
        note.push("IVA mista: i serramenti al 10% fino al valore delle altre prestazioni, l'eccedenza al 22%.");
      } else {
        const aliquota = totale.iva_pct_applicata === IVA_MISTA_SENTINEL ? 10 : totale.iva_pct_applicata;
        totali.push({ id: "iva", etichetta: `IVA ${aliquota}%`, importo: totale.iva_importo });
      }
      totali.push({ id: "totale", etichetta: "Totale", importo: totale.totale_iva_inclusa, forte: true });
    }
    if (totale.prezzo_manuale) {
      note.push(`Prezzo scritto a mano: prende il posto della somma delle voci (${formattaEuro(totale.somma_voci)}).`);
    }
  }

  const scadenza = progetto.valido_fino_data ? new Date(progetto.valido_fino_data) : null;
  const dataEtichetta = [
    dataEstesa(oggi),
    scadenza && !Number.isNaN(scadenza.getTime()) ? `valido fino al ${dataEstesa(scadenza)}` : null,
  ].filter(Boolean).join(" · ");

  const tipo = (progetto.tipo_intervento as SrTipoIntervento | undefined) ?? "sostituzione";
  // I lavori allo stesso indirizzo del cliente non ripetono la riga (come il PDF): se c'è il piano resta «stesso indirizzo · piano 3».
  const piano = progetto.cantiere_piano ? `piano ${progetto.cantiere_piano}` : null;
  const cantiere = lavoriDiversiDalCliente(progetto)
    ? compattaIndirizzo(
      progetto.cantiere_indirizzo,
      compatta(progetto.cantiere_cap, progetto.cantiere_citta),
      progetto.cantiere_provincia,
      piano,
    )
    : piano ? `stesso indirizzo · ${piano}` : "";

  // Il PDF dei serramenti stampa le prime tre: l'anteprima mostra le stesse.
  const esigenze = leggiEsigenze(progetto.esigenze).slice(0, ESIGENZE_NEL_PDF_SERRAMENTI);

  return {
    emittente: opzioni.emittente ?? null,
    codice: progetto.code ?? null,
    dataEtichetta,
    titolo: progetto.intervento_titolo?.trim() || TITOLO_INTERVENTO[tipo] || null,
    cliente: {
      nome: compatta(progetto.cliente_nome, progetto.cliente_cognome) || null,
      righe: [
        compattaIndirizzo(progetto.cliente_indirizzo, compatta(progetto.cliente_cap, progetto.cliente_citta), progetto.cliente_provincia),
        compatta(progetto.cliente_telefono),
        compatta(progetto.cliente_email),
      ].filter(Boolean),
    },
    cantiere: cantiere || null,
    ...(esigenze.length > 0 ? { esigenze: { titolo: "Le tue esigenze", voci: esigenze.map((e) => e.titolo) } } : {}),
    gruppi,
    totali,
    totaleDocumento: totali.length > 0 && totale ? totale.totale_iva_inclusa : null,
    prezzoACorpo: Boolean(totale?.prezzo_manuale),
    avvisi: [],
    note,
    impresa: margine
      ? {
          costi: margine.costoTotale,
          margine: margine.margine,
          marginePct: margine.marginePct,
          costiCompleti: margine.costiCompleti,
          righeSenzaCosto: margine.righeSenzaCosto,
          sottoTarget: margine.sottoTarget,
          margineMinPct: margine.margineMinPct,
        }
      : null,
  };
}
