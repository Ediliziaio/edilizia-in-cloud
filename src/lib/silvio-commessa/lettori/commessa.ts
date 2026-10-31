/**
 * Lettore della commessa esistente (31/10/2026, fase 1, lotto 1.1; serve alla fase 2,
 * «Completa con Silvio»).
 *
 * Quello che una persona ha già scritto nella commessa entra nel piano con fonte
 * `persona`: `fondi` non lo tocca più, e Silvio propone solo quello che manca. Per ogni
 * variabile del registro:
 * - colonne di `orders`: compilata secondo lo stesso controllo del punteggio di
 *   completezza; il valore è la colonna (o l'oggetto delle colonne compilate);
 * - fasi, rate e righe: l'elenco vero, nella forma del piano;
 * - le altre tabelle collegate: quante righe ci sono (`{ righe: n }`), che basta a dire
 *   «c'è già, non proporre».
 * Le variabili «righe con una colonna» (le date delle fasi) non si scrivono: il piano le
 * legge dall'elenco delle fasi.
 */
import type { FaseDelPiano, Frammento, RataDelPiano } from "../../../../shared/silvio-commessa/piano.ts";
import { REGISTRO } from "../../../../shared/silvio-commessa/registro.ts";
import { compilata } from "../../../../shared/silvio-commessa/completezza.ts";
import {
  frammentoDalModello, MODELLI_LAVORO, misuraDalTesto, riconosciTipoLavoro,
} from "../../../../shared/silvio-commessa/modelliLavoro.ts";
import { colonne, metti, nuovoFrammento, numero, testo } from "./comuni";

export interface DatiCommessaEsistente {
  /** La riga di `orders`. */
  order: Record<string, unknown>;
  /** `order_work_phases` della commessa, con le sottofasi (`order_work_subphases`) se lette. */
  fasi?: ReadonlyArray<Record<string, unknown> & { sottofasi?: ReadonlyArray<Record<string, unknown>> }>;
  /** `order_installments`. */
  rate?: ReadonlyArray<Record<string, unknown>>;
  /** `order_items`. */
  righe?: ReadonlyArray<Record<string, unknown>>;
  /** Per le altre tabelle collegate: quante righe ha la commessa. */
  conteggi?: Readonly<Record<string, number>>;
}

const perPosizione = <T extends Record<string, unknown>>(xs: ReadonlyArray<T>) =>
  [...xs].sort((a, b) => (numero(a.position) ?? 0) - (numero(b.position) ?? 0));

function fasiDellaCommessa(fasi: NonNullable<DatiCommessaEsistente["fasi"]>): FaseDelPiano[] {
  return perPosizione(fasi).map((f) => {
    const fase: FaseDelPiano = { id: testo(f.id) || null, name: testo(f.name) };
    if (f.start_date) fase.start_date = testo(f.start_date).slice(0, 10);
    if (f.end_date) fase.end_date = testo(f.end_date).slice(0, 10);
    if (f.sottofasi?.length) fase.sottofasi = perPosizione(f.sottofasi).map((s) => ({ name: testo(s.name) }));
    return fase;
  });
}

function rateDellaCommessa(rate: NonNullable<DatiCommessaEsistente["rate"]>): RataDelPiano[] {
  return perPosizione(rate).map((r) => ({
    label: testo(r.label),
    type: r.type === "balance" || r.type === "financing" ? r.type : "deposit",
    amount: numero(r.amount) ?? 0,
    trigger_evento: testo(r.trigger_evento) || null,
    trigger_numero: numero(r.trigger_numero),
  }));
}

/** Le colonne di sistema non dicono niente della commessa. */
const TECNICHE = new Set(["id", "order_id", "company_id", "created_at", "updated_at", "created_by"]);
const senzaTecniche = (r: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => !TECNICHE.has(k)));

export function frammentoDaCommessa(dati: DatiCommessaEsistente): Frammento {
  const o = dati.order;
  const codice = testo(o.order_code);
  const fr = nuovoFrammento({ tipo: "persona", id: testo(o.id) || null, etichetta: `commessa ${codice || "esistente"}`, dove: null });
  const elenchi: Record<string, unknown[] | undefined> = {
    "fasi.order_work_phases": dati.fasi && fasiDellaCommessa(dati.fasi),
    "pagamenti.rate": dati.rate && rateDellaCommessa(dati.rate),
    "economia.order_items": dati.righe && perPosizione(dati.righe).map(senzaTecniche),
  };
  const nota = "Già nella commessa: Silvio non lo cambia.";

  for (const v of REGISTRO) {
    const c = v.controllo;
    if (c.tipo === "colonne") {
      if (!compilata(v, { order: o, righe: {} })) continue;
      const valore = v.colonne.length === 1
        ? o[v.colonne[0]]
        : colonne(Object.fromEntries(v.colonne.map((k) => [k, o[k]])));
      metti(fr, v.chiave, valore, { nota, dove: "commessa" });
      continue;
    }
    if (c.conColonna) continue;
    if (v.chiave in elenchi && elenchi[v.chiave]) {
      metti(fr, v.chiave, elenchi[v.chiave], { nota, dove: "commessa" });
      continue;
    }
    const n = c.tabelle.reduce((s, t) => s + (dati.conteggi?.[t] ?? 0), 0);
    if (n > 0) metti(fr, v.chiave, { righe: n }, { nota, dove: "commessa" });
  }
  return fr;
}

/**
 * I frammenti con cui parte «Completa con Silvio» (fase 2, lotto 2.1): la commessa e, se non
 * ha le fasi ma si capisce il lavoro (tipo di lavoro, titolo, descrizione), il modello per
 * tipo di lavoro con la misura che i testi dicono e, se c'è, l'inizio lavori della commessa.
 * Il modello resta una proposta: quello che la commessa ha già vince in `fondi`.
 */
export function frammentiPerCompletare(dati: DatiCommessaEsistente): Frammento[] {
  const commessa = frammentoDaCommessa(dati);
  if (dati.fasi?.length) return [commessa];
  const o = dati.order;
  const testi = [o.tipo_lavoro, o.description, o.work_description].map(testo).filter(Boolean).join(" ");
  const tipo = riconosciTipoLavoro(testi);
  if (!tipo) return [commessa];
  const inizio = testo(o.work_start_date).slice(0, 10) || null;
  return [commessa, frammentoDalModello(tipo, { misura: misuraDalTesto(testi, MODELLI_LAVORO[tipo].unita), inizio })];
}
