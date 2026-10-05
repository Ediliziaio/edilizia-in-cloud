/**
 * L'anteprima live dei preventivi a computo (gli otto moduli edili: Bagni,
 * Climatizzazione, Elettrico, Pavimenti, Piscine, Ristrutturazione, Termoidraulico,
 * Tetti): dalle voci del computo al contratto `AnteprimaPreventivo`.
 *
 * Funzione PURA, una sola per tutti. Non calcola niente di nuovo: i totali e gli
 * importi di riga li dà il `calcoli` del modulo (`calcTotaliComputo`,
 * `calcRigaImporto`), lo stesso che usano lo step Economia, l'elenco e il PDF.
 * Chi la chiama passa il proprio, così un cambio di regola in un modulo si vede
 * subito anche qui.
 *
 * Regola del margine (la stessa dei moduli): con una voce venduta senza costo il
 * margine non si conosce e resta `null` («—»), non il 100%.
 */
import { calcDetraibile, superaMassimale } from "@/lib/preventivi/incentivi";
import {
  type AnteprimaPreventivo,
  type GruppoAnteprima,
  type RigaAnteprima,
  type VoceTotale,
  dataEstesa,
  formattaEuro,
  formattaNumero,
} from "@/lib/preventivatore/anteprima";

/** Una voce del computo, ridotta ai campi che hanno in comune gli otto moduli. */
export interface VoceComputoAnteprima {
  id: string;
  capitolo_nome: string;
  descrizione: string;
  unita_misura: string;
  quantita: number;
  prezzo_unitario: number;
  sconto_pct: number;
  costo_materiali: number;
  costo_manodopera: number;
  /** Solo la Ristrutturazione: il vano in cui si lavora. */
  ambiente?: string | null;
}

interface RigaCalcolo {
  capitolo_nome: string;
  quantita: number;
  prezzo_unitario: number;
  sconto_pct: number;
  costo_materiali: number;
  costo_manodopera: number;
}

interface TotaliComputo {
  imponibile: number;
  iva: number;
  totale: number;
  costoTot: number;
  margineEur: number | null;
  marginePct: number | null;
  imponibileLordo: number;
  sommaVoci: number;
  prezzoManuale: boolean;
  costiCompleti: boolean;
  righeSenzaCosto: number;
  perCapitolo: Array<{ nome: string; imponibile: number; costo: number; voci: number }>;
}

/** Il `lib/<modulo>/calcoli` del modulo: ne servono due funzioni. */
export interface CalcoliComputo {
  calcRigaImporto: (r: { quantita: number; prezzo_unitario: number; sconto_pct: number }) => number;
  calcTotaliComputo: (
    righe: RigaCalcolo[],
    opts: { sconto_pct: number; iva_pct: number; prezzo_manuale?: number | null },
  ) => TotaliComputo;
}

/** I campi del progetto che l'anteprima legge: quelli del form, che vincono sul salvato. */
export interface ProgettoAnteprimaComputo {
  code?: string | null;
  cliente_nome?: string | null;
  cliente_cognome?: string | null;
  cliente_email?: string | null;
  cliente_telefono?: string | null;
  cantiere_indirizzo?: string | null;
  cantiere_cap?: string | null;
  cantiere_citta?: string | null;
  cantiere_provincia?: string | null;
  sconto_pct?: number | null;
  iva_pct?: number | null;
  detrazione_pct?: number | null;
  massimale_detrazione?: number | null;
  prezzo_manuale?: number | null;
}

export interface OpzioniAnteprimaComputo {
  /** Il nome dell'azienda che emette il preventivo. */
  emittente?: string | null;
  /** Sopra la tabella: il nome dell'intervento. Vuoto = «Computo metrico». */
  titolo?: string | null;
  /** L'IVA di riserva del modulo: la colonna `iva_pct` del suo database (22, o 10 per bagni e tetti). */
  ivaDefault: number;
  /**
   * Conto Termico e Casa Full Electric hanno gli incentivi nei loro dati: la
   * detrazione generica non c'entra e non si mostra.
   */
  senzaDetrazione?: boolean;
  /** Falso a chi non può vedere costi e margini: il blocco impresa non si prepara. */
  conImpresa?: boolean;
  /** Per i test: la data di oggi. */
  oggi?: Date;
}

const compatta = (...parti: Array<string | null | undefined>) =>
  parti.map((p) => p?.trim()).filter(Boolean).join(" ");
const compattaIndirizzo = (...parti: Array<string | null | undefined>) =>
  parti.map((p) => p?.trim()).filter(Boolean).join(", ");

const numero = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};

const percentuale = (p: number) => formattaNumero(p, Number.isInteger(p) ? 0 : 1);

export function anteprimaComputo(
  voci: VoceComputoAnteprima[],
  progetto: ProgettoAnteprimaComputo,
  calcoli: CalcoliComputo,
  opzioni: OpzioniAnteprimaComputo,
): AnteprimaPreventivo {
  const oggi = opzioni.oggi ?? new Date();
  const scontoPct = numero(progetto.sconto_pct);
  const ivaPct = numero(progetto.iva_pct ?? opzioni.ivaDefault);
  const prezzoManuale = progetto.prezzo_manuale ?? null;

  const totali = calcoli.calcTotaliComputo(
    voci.map((v) => ({
      capitolo_nome: v.capitolo_nome || "Generale",
      quantita: v.quantita,
      prezzo_unitario: v.prezzo_unitario,
      sconto_pct: v.sconto_pct,
      costo_materiali: v.costo_materiali,
      costo_manodopera: v.costo_manodopera,
    })),
    { sconto_pct: scontoPct, iva_pct: ivaPct, prezzo_manuale: prezzoManuale },
  );

  // I capitoli come li mostra l'editor: nell'ordine in cui compaiono.
  const ordine: string[] = [];
  const perCapitolo = new Map<string, RigaAnteprima[]>();
  for (const v of voci) {
    const capitolo = v.capitolo_nome || "Generale";
    if (!perCapitolo.has(capitolo)) { perCapitolo.set(capitolo, []); ordine.push(capitolo); }
    const costoUnitario = Math.max(0, numero(v.costo_materiali)) + Math.max(0, numero(v.costo_manodopera));
    const costoRiga = costoUnitario * Math.max(0, numero(v.quantita));
    perCapitolo.get(capitolo)!.push({
      id: v.id,
      titolo: v.descrizione?.trim() || "Voce senza descrizione",
      dettaglio: [v.ambiente?.trim(), numero(v.sconto_pct) > 0 ? `sconto ${percentuale(numero(v.sconto_pct))}%` : null]
        .filter(Boolean).join(" · ") || null,
      quantita: numero(v.quantita),
      unita: v.unita_misura,
      prezzoUnitario: v.prezzo_unitario ?? null,
      totale: calcoli.calcRigaImporto(v),
      costo: costoRiga > 0 ? costoRiga : null,
    });
  }
  const gruppi: GruppoAnteprima[] = ordine.map((capitolo) => ({
    id: `capitolo:${capitolo}`,
    titolo: capitolo,
    righe: perCapitolo.get(capitolo) ?? [],
  }));

  const riepilogo: VoceTotale[] = [];
  const note: string[] = [];
  if (voci.length > 0 || totali.prezzoManuale) {
    riepilogo.push({
      id: "lordo",
      etichetta: totali.prezzoManuale ? "Prezzo concordato" : "Totale voci",
      importo: totali.imponibileLordo,
    });
    const sconto = totali.imponibileLordo - totali.imponibile;
    if (sconto > 0.005) {
      riepilogo.push({ id: "sconto", etichetta: `Sconto ${percentuale(scontoPct)}%`, importo: sconto, negativo: true });
      riepilogo.push({ id: "netto", etichetta: "Imponibile", importo: totali.imponibile });
    }
    riepilogo.push({ id: "iva", etichetta: `IVA ${percentuale(ivaPct)}%`, importo: totali.iva });
    riepilogo.push({ id: "totale", etichetta: "Totale", importo: totali.totale, forte: true });
  }
  if (totali.prezzoManuale) {
    note.push(`Prezzo scritto a mano: prende il posto della somma delle voci (${formattaEuro(totali.sommaVoci)}).`);
  }

  const detrazionePct = numero(progetto.detrazione_pct);
  const massimale = progetto.massimale_detrazione ?? null;
  const detrazione = !opzioni.senzaDetrazione && detrazionePct > 0 && riepilogo.length > 0
    ? {
        pct: detrazionePct,
        importo: calcDetraibile(totali.imponibile, detrazionePct, massimale),
        massimale,
        oltreMassimale: superaMassimale(totali.imponibile, massimale),
      }
    : null;

  const cantiere = compattaIndirizzo(
    progetto.cantiere_indirizzo,
    compatta(progetto.cantiere_cap, progetto.cantiere_citta),
    progetto.cantiere_provincia,
  );

  return {
    emittente: opzioni.emittente ?? null,
    codice: progetto.code ?? null,
    dataEtichetta: dataEstesa(oggi),
    titolo: opzioni.titolo?.trim() || "Computo metrico",
    cliente: {
      nome: compatta(progetto.cliente_nome, progetto.cliente_cognome) || null,
      righe: [compatta(progetto.cliente_telefono), compatta(progetto.cliente_email)].filter(Boolean),
    },
    cantiere: cantiere || null,
    gruppi,
    totali: riepilogo,
    totaleDocumento: riepilogo.length > 0 ? totali.totale : null,
    prezzoACorpo: totali.prezzoManuale,
    avvisi: [],
    note,
    impresa: opzioni.conImpresa === false
      ? null
      : {
          costi: totali.costoTot,
          margine: totali.margineEur,
          marginePct: totali.marginePct,
          costiCompleti: totali.costiCompleti,
          righeSenzaCosto: totali.righeSenzaCosto,
        },
    detrazione,
  };
}
