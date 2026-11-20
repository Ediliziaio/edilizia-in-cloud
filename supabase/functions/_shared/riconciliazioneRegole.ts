/**
 * Confronto righe fattura ↔ righe DDT/ordine: prima le regole, poi l'AI
 * (docs/automazioni-acquisti.md, lotto 3).
 *
 * `riconcilia-fattura-ai` chiedeva all'AI di abbinare ogni riga anche quando
 * il codice articolo o la descrizione erano identici e la quantità tornava.
 * Qui si prova con le regole comuni (`shared/acquisti/righe.ts`): codice
 * (anche tramite le equivalenze confermate), descrizione uguale, quantità con
 * le sole conversioni autorizzate, una riga di bolla usata una volta.
 *
 * Se tutte le righe si chiudono con certezza l'AI non si chiama. Altrimenti
 * all'AI vanno SOLO le righe in dubbio (`chiuseRighe` → `pianificaLotti`), senza
 * le righe di bolla e d'ordine già usate dalle regole, e l'unione dei lotti
 * rimette insieme le due parti (15/11/2026).
 *
 * Prudenze in più rispetto all'AI:
 *   - una riga di bolla già fatturata in parte, o con un residuo incerto, non si
 *     abbina da sola (la quantità residua la valuta chi conosce le altre fatture);
 *   - se sono stati scelti ordini, ogni riga deve trovare anche la riga d'ordine.
 */
import { abbinaRigheFattura, confrontaRiga, type EquivalenzaCodice, type RigaDocumento, type Tolleranze } from "../../../shared/acquisti/righe.ts";
import type { ConversioneAutorizzata } from "../../../shared/acquisti/normalizza.ts";
import { unitaCanonica } from "../../../shared/acquisti/normalizza.ts";
import type { RigaFatturaLetta } from "../../../shared/acquisti/riferimentiFattura.ts";
import { datiRiconciliazione, documentoAmmessoPerRiga, type ContestoRiconciliazione, type PropostaRiconciliazione } from "./riconciliazioneFattureAI.ts";

export const MODELLO_REGOLE = "regole";

const testo = (v: unknown) => (v == null ? "" : String(v));

function equivalenze(c: ContestoRiconciliazione): EquivalenzaCodice[] {
  return (c.equivalenze ?? [])
    .filter((e) => e.attiva !== false && e.fattura_codice && e.documento_codice)
    .map((e) => ({ codiceFornitore: testo(e.fattura_codice), codiceNostro: testo(e.documento_codice) }));
}

function conversioni(c: ContestoRiconciliazione): ConversioneAutorizzata[] {
  return (c.conversioni ?? [])
    .filter((e) => Number(e.fattore) > 0 && e.unita_fattura && e.unita_ddt)
    .map((e) => ({
      da: testo(e.unita_fattura),
      a: testo(e.unita_ddt),
      fattore: Number(e.fattore),
      codiceArticolo: e.codice_articolo ? testo(e.codice_articolo) : null,
    }));
}

export interface EsitoRegole {
  /** La proposta, se TUTTE le righe si chiudono con le regole; altrimenti null. */
  proposta: PropostaRiconciliazione | null;
  /** Le righe chiuse dalle regole, anche quando non sono tutte: all'AI vanno solo le altre. */
  chiuseRighe: PropostaRiconciliazione["righe"];
  righe: number;
  chiuse: number;
  /** Perché non si è chiuso tutto (per il registro dei lavori senza AI). */
  motivo: string | null;
}

/**
 * Soglie dell'azienda (Impostazioni → Automazioni, 16/11/2026) dalla risposta di
 * azienda_soglie_automazioni; senza risposta valgono i default del codice.
 */
export function tolleranzeDaSoglie(s: unknown): Tolleranze | undefined {
  if (!s || typeof s !== "object") return undefined;
  const o = s as Record<string, unknown>;
  const n = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? undefined : Number(v));
  return { quantitaPerc: n(o.acquisti_quantita_toll_perc), prezzoPerc: n(o.acquisti_prezzo_toll_perc), importoCent: n(o.acquisti_prezzo_toll_cent) };
}

export function propostaDaRegole(c: ContestoRiconciliazione, impostazioni: { tolleranze?: Tolleranze } = {}): EsitoRegole {
  const d = datiRiconciliazione(c);
  const righe: RigaFatturaLetta[] = d.fattura.map((f, i): RigaFatturaLetta => ({
    numeroLinea: i + 1,
    codici: f.codice ? [{ tipo: "", valore: f.codice }] : [],
    descrizione: f.descrizione,
    quantita: f.quantita,
    unitaLetta: f.um,
    unita: unitaCanonica(f.um),
    prezzoUnitario: f.prezzo,
    totale: f.importo ?? 0,
    tipoCessione: null,
    dataInizio: null,
    dataFine: null,
    altriDati: [],
  }));
  const totale = righe.length;
  if (!totale) return { proposta: null, chiuseRighe: [], righe: 0, chiuse: 0, motivo: "fattura senza righe leggibili" };

  const tolleranze = Object.fromEntries(Object.entries(impostazioni.tolleranze ?? {}).filter(([, v]) => v != null)) as Tolleranze;
  const opz = { equivalenze: equivalenze(c), conversioni: conversioni(c), tolleranze };
  const bolle: RigaDocumento[] = d.bolle
    .filter((b) => !b.residuoIncerto && b.giaFatturata === 0)
    .map((b) => ({ id: b.id, documentoId: b.documentoId, codice: b.codice, descrizione: b.descrizione, quantita: b.quantita, unita: b.um, prezzoUnitario: b.prezzo }));
  const ordini: RigaDocumento[] = d.ordini.map((o) => ({
    id: o.id,
    documentoId: o.documentoId,
    codice: o.codice,
    descrizione: o.descrizione,
    quantita: o.quantita,
    unita: o.um,
    prezzoUnitario: o.prezzo,
  }));

  const conDdt = d.bolle.length > 0;
  const conOda = d.ordini.length > 0;
  const perDdt = conDdt ? abbinaRigheFattura(righe, r => bolle
    .filter(b => documentoAmmessoPerRiga(c.ddt_per_riga, d.fattura[r.numeroLinea - 1].id, b.documentoId)), opz) : [];
  const perOda = conOda ? abbinaRigheFattura(righe, r => ordini
    .filter(o => documentoAmmessoPerRiga(c.oda_per_riga, d.fattura[r.numeroLinea - 1].id, o.documentoId)), opz) : [];

  const out: PropostaRiconciliazione["righe"] = [];
  let chiuse = 0;
  let motivo: string | null = null;
  d.fattura.forEach((f, i) => {
    const n = i + 1;
    const dd = perDdt.find((x) => x.numeroLinea === n)?.decisione;
    const od = perOda.find((x) => x.numeroLinea === n)?.decisione;
    const okDdt = (!conDdt && c.ddt_per_riga?.[f.id] === undefined) || (dd?.esito === "automatico" && !!dd.sceltoId);
    const okOda = (!conOda && c.oda_per_riga?.[f.id] === undefined) || (od?.esito === "automatico" && !!od.sceltoId);
    if (okDdt && okOda) {
      chiuse++;
      // Il prezzo non decide l'abbinamento, ma uno scarto oltre la tolleranza si scrive nel motivo.
      const scelta = (conDdt ? bolle.find((b) => b.id === dd?.sceltoId) : ordini.find((o) => o.id === od?.sceltoId)) ?? null;
      const prezzo = scelta ? confrontaRiga(righe[i], scelta, { tolleranze, conversioni: opz.conversioni }).find((x) => x.tipo === "prezzo") : undefined;
      const notaPrezzo = prezzo && prezzo.tipo === "prezzo" ? ` · prezzo diverso del ${prezzo.scartoPerc.toFixed(2).replace(".", ",")}%, oltre la tolleranza` : "";
      out.push({
        fattura: f.id,
        ddt: conDdt && dd?.sceltoId ? [dd.sceltoId] : [],
        oda: conOda && od?.sceltoId ? [od.sceltoId] : [],
        affidabilita: "alta",
        motivo: `Regola, senza AI: ${[dd?.motivo, od?.motivo].filter(Boolean).join(" · ")}${notaPrezzo}`.slice(0, 700),
      });
    } else if (!motivo) {
      const d0 = !okDdt ? dd : od;
      motivo = `riga ${n}: ${d0?.esito ?? "nessuno"} (${d0?.motivo ?? "nessun candidato"})`;
    }
  });
  if (chiuse < totale) return { proposta: null, chiuseRighe: out, righe: totale, chiuse, motivo };
  return { proposta: { righe: out, avvisi: [] }, chiuseRighe: out, righe: totale, chiuse, motivo: null };
}
