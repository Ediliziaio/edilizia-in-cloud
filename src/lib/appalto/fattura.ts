/**
 * Dal rendiconto alla fattura, e dal rendiconto alla stampa.
 *
 * Qui dentro non c'e' niente che tocchi il database o il browser: sono le due
 * trasformazioni che il committente vede, e si provano senza montare una pagina
 * ne' aprire un PDF.
 *
 * Fase 5 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 */
import type { DocumentoFiscale, RigaDocumento, ClienteSnapshot, RiepilogoIVA } from "@/types/fatturazione";

/* ─── Raggruppare per cantiere ───────────────────────────────────────── */

export interface RigaDaStampare {
  id: string;
  order_id: string;
  data: string;
  descrizione: string;
  unita_misura: string;
  prezzo_unitario: number;
  quantita: number;
  maggiorazione_pct: number;
  importo: number;
  extra_contratto: boolean;
  note?: string | null;
}

export interface CantiereDelRendiconto {
  orderId: string;
  codice: string | null;
  descrizione: string | null;
  /** Come si chiama il cantiere nel documento: il codice se c'è, altrimenti la descrizione. */
  etichetta: string;
  righe: RigaDaStampare[];
  totale: number;
}

/**
 * Il dettaglio raggruppato per cantiere: è quello che i committenti chiedono
 * sempre, perché il rendiconto arriva da chi ha più cantieri aperti con loro e
 * la prima domanda è «questa riga su quale lavoro l'hai fatta?».
 *
 * Le righe di un cantiere restano in ordine di data — un rendiconto si legge
 * come un diario — e i cantieri sono in ordine di etichetta, così due stampe
 * dello stesso periodo escono identiche.
 */
export function raggruppaPerCantiere(
  righe: ReadonlyArray<RigaDaStampare>,
  cantieri: ReadonlyArray<{ id: string; order_code: string | null; description: string | null }>,
): CantiereDelRendiconto[] {
  const anagrafica = new Map(cantieri.map((c) => [c.id, c]));
  const gruppi = new Map<string, CantiereDelRendiconto>();

  for (const r of righe) {
    let g = gruppi.get(r.order_id);
    if (!g) {
      const c = anagrafica.get(r.order_id);
      const codice = c?.order_code ?? null;
      const descrizione = c?.description ?? null;
      g = {
        orderId: r.order_id,
        codice,
        descrizione,
        // Un cantiere senza codice né descrizione non diventa una riga anonima:
        // il committente deve poterlo nominare, anche solo per chiedere.
        etichetta: codice?.trim() || descrizione?.trim() || "Cantiere senza codice",
        righe: [],
        totale: 0,
      };
      gruppi.set(r.order_id, g);
    }
    g.righe.push(r);
    g.totale += Number(r.importo);
  }

  const out = [...gruppi.values()];
  for (const g of out) {
    g.righe.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    g.totale = Math.round(g.totale * 100) / 100;
  }
  out.sort((a, b) => a.etichetta.localeCompare(b.etichetta, "it"));
  return out;
}

/* ─── La fattura ─────────────────────────────────────────────────────── */

export type RegimeIvaAppalto = "ordinaria" | "reverse_charge";

export interface DatiFatturaDaRendiconto {
  numero: number;
  periodoDal: string;
  periodoAl: string;
  cantieri: ReadonlyArray<CantiereDelRendiconto>;
  committente: {
    business_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    vat_number?: string | null;
    fiscal_code?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    province?: string | null;
  };
  /** Dal contratto: il riferimento che il committente usa per riconoscere il lavoro. */
  riferimentoCommittente?: string | null;
  regimeIva: RegimeIvaAppalto;
  ritenutaPct: number;
  giorniPagamento?: number | null;
  /** L'aliquota ordinaria dell'azienda. Ignorata in reverse charge. */
  aliquotaIva?: string;
  /**
   * La riga di `anagrafiche_native` del committente, se c'e'.
   *
   * Senza, la fattura nasceva col nome del cliente ma **staccata** dalla sua
   * anagrafica: non compariva fra i suoi documenti e niente poteva verificare
   * che fosse davvero la sua. Chi la crea la cerca per P.IVA o codice fiscale
   * e, se non c'e', la crea — come fa l'editor quando scrivi un cliente nuovo.
   */
  anagraficaId?: string | null;
  /** Oggi, per calcolare la scadenza. Si passa solo nelle prove. */
  oggi?: Date;
}

const giornoIT = (iso: string): string => {
  const [a, m, g] = iso.split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/**
 * La scadenza della fattura, dai giorni di pagamento del contratto.
 *
 * `giorniPagamento` arrivava dal contratto e non veniva usato da nessuno: la
 * fattura nasceva **senza data di scadenza**, cioe' fuori dallo scadenzario e
 * fuori dal previsionale di cassa. Per un appaltatore quella data e' il punto:
 * il contratto dice «45 giorni» e la fattura non lo sapeva.
 *
 * Si conta da oggi, che e' la data che la fattura prendera' all'emissione
 * ("la data di oggi viene assegnata quando emetti"). Resta modificabile
 * nell'editor: se la emetti fra una settimana, la sposti di una settimana.
 */
export function scadenzaDaGiorni(giorni: number | null | undefined, oggi: Date = new Date()): string | null {
  if (giorni === null || giorni === undefined || !Number.isFinite(Number(giorni)) || Number(giorni) < 0) return null;
  const d = new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()));
  d.setUTCDate(d.getUTCDate() + Math.round(Number(giorni)));
  return d.toISOString().slice(0, 10);
}

/**
 * La bozza di fattura che nasce da un rendiconto approvato.
 *
 * Tre scelte dentro, e nessuna è di comodo:
 *
 * - **Una riga per cantiere**, non una per ogni giornata: la fattura resta
 *   leggibile e il dettaglio lo porta il PDF del rendiconto, che si allega.
 *   Chi vuole il dettaglio in fattura aggiunge le righe a mano nell'editor.
 * - **Il riferimento del committente va in `riferimenti_ordine`**, cioè nel
 *   `DatiOrdineAcquisto/IdDocumento` della FatturaPA: è il campo che l'ufficio
 *   del committente legge per abbinare la fattura al suo ordine. Finisce anche
 *   in `codice_commessa_convenzione` e nella causale, che si leggono sulla
 *   carta.
 * - **Il regime IVA arriva dal contratto.** In reverse charge (subappalto
 *   edile, art. 17 co. 6 lett. a DPR 633/72) l'aliquota è zero con natura N6.3
 *   e la dicitura di legge in causale: metterci il 22% sarebbe un errore
 *   fiscale, e indovinarlo ogni volta è il modo di farlo.
 *
 * La ritenuta la scrive come ritenuta d'acconto (RT02, società): l'editor la
 * mostra e si corregge lì se il caso è un altro.
 */
export function prefillFatturaDaRendiconto(d: DatiFatturaDaRendiconto): Partial<DocumentoFiscale> {
  const reverse = d.regimeIva === "reverse_charge";
  const aliquota = reverse ? "0" : (d.aliquotaIva ?? "22");

  const righe: RigaDocumento[] = d.cantieri.map((c, i) => {
    const imponibile = arrotonda(c.totale);
    const imposta = reverse ? 0 : arrotonda((imponibile * Number(aliquota)) / 100);
    return {
      id: `rendiconto-${d.numero}-${c.orderId}`,
      numero_linea: i + 1,
      descrizione:
        `Lavori in appalto — ${c.etichetta}` +
        (c.codice && c.descrizione ? ` (${c.descrizione})` : "") +
        ` · periodo ${giornoIT(d.periodoDal)} – ${giornoIT(d.periodoAl)}`,
      quantita: 1,
      unita_misura: "corpo",
      prezzo_unitario: imponibile,
      imponibile,
      aliquota_iva: aliquota,
      ...(reverse ? { natura_iva: "N6_3" as const } : {}),
      imposta,
      totale_riga: arrotonda(imponibile + imposta),
      ritenuta: d.ritenutaPct > 0,
    };
  });

  const riepilogo: RiepilogoIVA[] = [];
  const imponibileTotale = arrotonda(righe.reduce((s, r) => s + r.imponibile, 0));
  const ivaTotale = arrotonda(righe.reduce((s, r) => s + r.imposta, 0));
  const ritenutaImporto = arrotonda((imponibileTotale * d.ritenutaPct) / 100);
  riepilogo.push({
    aliquota,
    ...(reverse ? { natura: "N6_3" as const } : {}),
    imponibile: imponibileTotale,
    imposta: ivaTotale,
    esigibilita: "I",
  });

  const causale: string[] = [
    `Rendiconto n. ${d.numero} dal ${giornoIT(d.periodoDal)} al ${giornoIT(d.periodoAl)}` +
      (d.riferimentoCommittente ? ` — Vs. rif. ${d.riferimentoCommittente}` : ""),
  ];
  if (reverse) {
    causale.push(
      "Inversione contabile — prestazioni rese nel settore edile in regime di subappalto, art. 17 comma 6 lettera a) del DPR 633/72",
    );
  }

  const nome =
    d.committente.business_name?.trim() ||
    [d.committente.first_name, d.committente.last_name].filter(Boolean).join(" ").trim() ||
    "Committente";

  const cliente: ClienteSnapshot = {
    ragione_sociale: nome,
    partita_iva: d.committente.vat_number ?? undefined,
    codice_fiscale: d.committente.fiscal_code ?? undefined,
    indirizzo_via: d.committente.address ?? undefined,
    indirizzo_cap: d.committente.postal_code ?? undefined,
    indirizzo_comune: d.committente.city ?? undefined,
    indirizzo_provincia: d.committente.province ?? undefined,
    // Un committente è un'impresa: è il caso B2B. Se non lo fosse non avrebbe
    // un contratto d'appalto.
    tipo_cliente: "B2B",
  };

  const scadenza = scadenzaDaGiorni(d.giorniPagamento, d.oggi);
  const totaleDaPagare = arrotonda(imponibileTotale + ivaTotale - ritenutaImporto);

  return {
    ...(d.anagraficaId ? { anagrafica_id: d.anagraficaId } : {}),
    ...(scadenza
      ? {
          data_scadenza: scadenza,
          scadenze_pagamento: [
            {
              numero_rata: 1,
              data_scadenza: scadenza,
              importo: totaleDaPagare,
              metodo_pagamento: "MP05" as const,
              pagato: false,
            },
          ],
        }
      : {}),
    cliente_snapshot: cliente,
    righe,
    riepilogo_iva: riepilogo,
    subtotale: imponibileTotale,
    imponibile_totale: imponibileTotale,
    iva_totale: ivaTotale,
    totale_documento: arrotonda(imponibileTotale + ivaTotale),
    totale_da_pagare: totaleDaPagare,
    causale,
    codice_commessa_convenzione: d.riferimentoCommittente ?? undefined,
    ...(d.riferimentoCommittente
      ? { riferimenti_ordine: [{ IdDocumento: d.riferimentoCommittente }] }
      : {}),
    ritenuta_acconto: d.ritenutaPct > 0,
    ...(d.ritenutaPct > 0
      ? {
          ritenuta_tipo: "RT02",
          ritenuta_aliquota: d.ritenutaPct,
          ritenuta_importo: ritenutaImporto,
          ritenuta_causale: "A",
        }
      : {}),
    note_documento: causale[0],
  };
}
