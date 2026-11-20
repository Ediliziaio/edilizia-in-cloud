/**
 * Il fabbisogno dei materiali per l'ufficio acquisti: cosa ordinare e entro
 * quando. Le righe vengono da materiali_riconciliazione_azienda (solo fasi
 * validate dal tecnico, migrazioni 20281222150000 e 20281222200000):
 * «entro quando» = data in cui serve (o inizio della fase) meno i giorni di
 * consegna del fornitore.
 */

import type { VerificaAcquisto } from "@/lib/distinta/verificaAcquisto";
import type { MaterialeDaVerificare } from "@/lib/distinta/bozzaVerificaMateriale";

export interface RigaFabbisogno {
  verifica_acquisto?: VerificaAcquisto;
  dati_verifica?: MaterialeDaVerificare;
  order_item_id: string;
  order_id: string;
  commessa: string | null;
  phase_id: string | null;
  fase: string | null;
  name: string;
  unita_misura: string | null;
  supplier_id: string | null;
  fornitore: string | null;
  previsto: number;
  ordinato: number;
  in_bozza: number;
  ricevuto: number;
  residuo: number;
  eccedenza: number;
  unita_diversa: boolean;
  stato: string;
  data_serve: string | null;
  /** La data scritta a mano; senza, il materiale segue l'inizio della fase (data_serve). */
  data_scritta?: string | null;
  giorni_consegna: number | null;
  ordina_entro: string | null;
}

export type Urgenza = "ritardo" | "settimana" | "mese" | "dopo" | "senza_data" | "da_verificare";

export const ETICHETTA_URGENZA: Record<Urgenza, string> = {
  ritardo: "In ritardo",
  settimana: "Entro 7 giorni",
  mese: "Entro 30 giorni",
  dopo: "Più avanti",
  senza_data: "Senza data",
  da_verificare: "Da verificare",
};

export const ORDINE_URGENZA: Urgenza[] = ["ritardo", "settimana", "mese", "dopo", "senza_data", "da_verificare"];

const giorno = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Giorni da oggi a «entro quando»: negativo = in ritardo. */
export function giorniAlLimite(ordinaEntro: string | null, oggi: string): number | null {
  if (!ordinaEntro) return null;
  return Math.round((giorno(ordinaEntro) - giorno(oggi)) / 86_400_000);
}

/**
 * Una riga senza niente da ordinare ma con un'incongruenza (ordinato più del
 * previsto, unità diverse dall'ordine) va fra «da verificare»: non è urgente,
 * ma qualcuno deve guardarla.
 */
export function urgenza(r: RigaFabbisogno, oggi: string): Urgenza {
  if (r.verifica_acquisto?.stato === "da_verificare") return "da_verificare";
  const daOrdinare = r.residuo > 0 && !["consegnato", "installato"].includes(r.stato);
  if (!daOrdinare) return "da_verificare";
  const g = giorniAlLimite(r.ordina_entro, oggi);
  if (g == null) return "senza_data";
  if (g < 0) return "ritardo";
  if (g <= 7) return "settimana";
  if (g <= 30) return "mese";
  return "dopo";
}

export function raggruppaPerUrgenza(righe: RigaFabbisogno[], oggi: string): Array<{ urgenza: Urgenza; righe: RigaFabbisogno[] }> {
  const gruppi = new Map<Urgenza, RigaFabbisogno[]>();
  for (const r of righe) {
    const u = urgenza(r, oggi);
    gruppi.set(u, [...(gruppi.get(u) ?? []), r]);
  }
  return ORDINE_URGENZA.filter((u) => gruppi.has(u)).map((u) => ({
    urgenza: u,
    righe: [...gruppi.get(u)!].sort((a, b) =>
      (a.ordina_entro ?? "9999").localeCompare(b.ordina_entro ?? "9999")
      || (a.commessa ?? "").localeCompare(b.commessa ?? "")
      || a.name.localeCompare(b.name)),
  }));
}

/** «fra 3 giorni», «oggi», «da 4 giorni»: per la colonna «entro quando». */
export function testoLimite(ordinaEntro: string | null, oggi: string): string {
  const g = giorniAlLimite(ordinaEntro, oggi);
  if (g == null) return "senza data: manca l'inizio della fase";
  if (g === 0) return "oggi";
  if (g === 1) return "domani";
  if (g === -1) return "da ieri";
  return g > 0 ? `fra ${g} giorni` : `da ${-g} giorni`;
}

/** Il collegamento ai materiali della commessa, sulla fase giusta. */
export function linkMateriali(r: Pick<RigaFabbisogno, "order_id" | "phase_id">): string {
  return `/azienda/ordini/${r.order_id}?tab=articoli&vista_materiali=articoli${r.phase_id ? `&fase=${r.phase_id}` : ""}`;
}

/** Selezionabile per assegnare il fornitore o ordinare: c'è ancora da ordinare e non è già in un ordine. */
export function selezionabile(r: RigaFabbisogno): boolean {
  return r.residuo > 0 && ["da_ordinare", "in_offerta"].includes(r.stato);
}

/**
 * Dentro una commessa si ragiona per fase (17/11/2026): una sezione per fase, nell'ordine della prima
 * scadenza, con quante righe sono in ritardo o entro 7 giorni. Dentro la fase, le più urgenti prima.
 */
export function raggruppaPerFase(righe: RigaFabbisogno[], oggi: string): Array<{ fase: string; righe: RigaFabbisogno[]; ritardo: number; settimana: number }> {
  const perFase = new Map<string, RigaFabbisogno[]>();
  for (const r of righe) {
    const k = r.fase?.trim() || "Senza fase";
    perFase.set(k, [...(perFase.get(k) ?? []), r]);
  }
  const prima = (rr: RigaFabbisogno[]) => rr.map((r) => r.ordina_entro ?? "9999").sort()[0];
  return [...perFase.entries()]
    .map(([fase, rr]) => ({
      fase,
      righe: [...rr].sort((a, b) => (a.ordina_entro ?? "9999").localeCompare(b.ordina_entro ?? "9999") || a.name.localeCompare(b.name, "it")),
      ritardo: rr.filter((r) => urgenza(r, oggi) === "ritardo").length,
      settimana: rr.filter((r) => urgenza(r, oggi) === "settimana").length,
    }))
    .sort((a, b) => prima(a.righe).localeCompare(prima(b.righe)) || a.fase.localeCompare(b.fase, "it"));
}

/** Ancora aperta nel fabbisogno: c'è da ordinare, oppure un'incongruenza da guardare. */
export function apertaFabbisogno(r: RigaFabbisogno): boolean {
  return (r.residuo > 0 && !["consegnato", "installato"].includes(r.stato)) || r.eccedenza > 0 || r.unita_diversa;
}

const PREFISSO_QUANTITA = /^\s*n\.?\s*\d+\s*[,.:-]?\s*/i;
const PREFISSO_LAVORO = /^(fornitura\s+e\s+posa(\s+in\s+opera)?|fornitura|posa\s+in\s+opera|f\.?\s*e\s*p\.?)\s+(di\s+|del\s+|della\s+|dei\s+|delle\s+)?/i;
const pulisci = (nome: string) => nome.replace(PREFISSO_QUANTITA, "").replace(PREFISSO_LAVORO, "").trim();
const maiuscola = (s: string) => (s ? s[0].toLocaleUpperCase("it-IT") + s.slice(1) : s);
const taglia = (s: string, max: number) => {
  if (s.length <= max) return s;
  const spazio = s.lastIndexOf(" ", max);
  return `${s.slice(0, spazio > max / 2 ? spazio : max).replace(/[\s,;:]+$/, "")}…`;
};

/**
 * Il nome che si legge in una riga (17/11/2026): le voci del computo sono descrizioni da capitolato di
 * tre righe. Si toglie «N.1», «Fornitura e posa in opera di», e si tiene la prima frase, al massimo 48
 * caratteri. `accorciato` dice se il nome intero va mostrato nei dettagli.
 */
export function nomeBreve(nome: string): { titolo: string; accorciato: boolean } {
  const base = pulisci(nome) || nome.trim();
  const frase = base.split(/(?<=\S)\s*(?:[.;:(]|,\s|\s-\s)/)[0]?.trim() || base;
  const titolo = maiuscola(taglia(frase, 48));
  return { titolo, accorciato: titolo.replace(/…$/, "") !== nome.trim() };
}

/**
 * Righe col nome breve uguale (quattro «Deumidificatore…»): per ognuna il pezzo di descrizione da cui
 * comincia a essere diversa dalle altre, così si distinguono senza leggere tre righe ciascuna.
 */
export function differenze(righe: Pick<RigaFabbisogno, "order_item_id" | "name">[]): Map<string, string> {
  const perTitolo = new Map<string, typeof righe>();
  for (const r of righe) {
    const t = nomeBreve(r.name).titolo;
    perTitolo.set(t, [...(perTitolo.get(t) ?? []), r]);
  }
  const esito = new Map<string, string>();
  for (const gruppo of perTitolo.values()) {
    if (gruppo.length < 2) continue;
    const testi = gruppo.map((r) => pulisci(r.name));
    gruppo.forEach((r, i) => {
      const t = testi[i];
      // Il primo carattere in cui questa riga si stacca da almeno un'altra del gruppo.
      let da = t.length;
      for (let j = 0; j < testi.length; j++) {
        if (j === i || testi[j] === t) continue;
        let k = 0;
        while (k < t.length && t[k] === testi[j][k]) k++;
        da = Math.min(da, k);
      }
      if (da >= t.length) return;
      // Se poco prima c'è una quantità («N. 4 Tubi…») si parte da lì, altrimenti dall'inizio della parola.
      // (anche subito dopo: «… 0 m, N. 4 Tubi» dice di più da «N. 4»).
      const quantita = [...t.matchAll(/N\.?\s*\d/gi)].find((m) => m.index != null && m.index >= da - 6 && m.index <= da + 15);
      const inizio = quantita?.index ?? Math.max(0, t.lastIndexOf(" ", da - 1));
      esito.set(r.order_item_id, taglia(t.slice(inizio).replace(/^[\s.…,;:]+/, ""), 70));
    });
  }
  return esito;
}

const GENERICHE = new Set(["fornitura", "posa", "opera", "compreso", "compresa", "realizzazione", "esecuzione", "tipo", "modello",
  "della", "delle", "degli", "dello", "nella", "nelle", "sulla", "dalla", "come", "ogni", "altro", "materiale", "materiali"]);

/** La parola che dice cos'è il materiale: la prima di almeno 4 lettere che non sia generica. */
export function parolaChiave(nome: string): string | null {
  const parole = pulisci(nome).toLocaleLowerCase("it-IT").normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) ?? [];
  const p = parole.find((w) => !GENERICHE.has(w));
  // «deumidificatore» e «deumidificatori» sono lo stesso materiale.
  return p ? p.slice(0, Math.max(4, p.length - 1)) : null;
}

export interface FornitoreStorico { nome: string; supplier_id: string; fornitore: string; peso?: number }

/**
 * Il fornitore da proporre per un materiale senza fornitore (17/11/2026): quello che l'azienda ha già usato
 * (o ha a listino) per materiali con la stessa parola chiave, il più frequente. Solo una proposta: si
 * assegna con un clic, mai da sé.
 */
export function suggerisciFornitori(
  righe: Pick<RigaFabbisogno, "order_item_id" | "name" | "supplier_id">[],
  storico: FornitoreStorico[],
): Map<string, { supplier_id: string; fornitore: string }> {
  const conti = new Map<string, Map<string, { fornitore: string; n: number }>>();
  for (const s of storico) {
    const k = parolaChiave(s.nome);
    if (!k) continue;
    const m = conti.get(k) ?? new Map();
    const c = m.get(s.supplier_id) ?? { fornitore: s.fornitore, n: 0 };
    c.n += s.peso ?? 1;
    m.set(s.supplier_id, c);
    conti.set(k, m);
  }
  const esito = new Map<string, { supplier_id: string; fornitore: string }>();
  for (const r of righe) {
    if (r.supplier_id) continue;
    const k = parolaChiave(r.name);
    const m = k ? conti.get(k) : undefined;
    if (!m) continue;
    const [id, c] = [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[1].fornitore.localeCompare(b[1].fornitore, "it"))[0];
    esito.set(r.order_item_id, { supplier_id: id, fornitore: c.fornitore });
  }
  return esito;
}

/** Per fase: quanti materiali sono già coperti da un ordine, su quanti ne servono. */
export function avanzamentoFasi(tutte: RigaFabbisogno[]): Map<string, { coperti: number; totale: number }> {
  const esito = new Map<string, { coperti: number; totale: number }>();
  for (const r of tutte) {
    if (r.previsto <= 0) continue;
    const k = r.fase?.trim() || "Senza fase";
    const a = esito.get(k) ?? { coperti: 0, totale: 0 };
    a.totale += 1;
    if (r.residuo <= 0 || ["ordinato", "consegnato", "installato"].includes(r.stato)) a.coperti += 1;
    esito.set(k, a);
  }
  return esito;
}
