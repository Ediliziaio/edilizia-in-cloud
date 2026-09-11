/**
 * Logica PURA dei clienti marketing a provvigione: gli scaglioni sul venduto
 * mensile, i costi per lead/appuntamento/vendita e le letture del mese.
 * Niente React, niente database: provata in vitest e usata dalla console,
 * dalla scheda del cliente e dalla chiusura del mese.
 */

export interface Scaglione {
  /** da questo importo (escluso) */
  da: number;
  /** fino a questo importo (incluso); null = senza limite */
  a: number | null;
  /** percentuale sulla fetta di venduto che cade nello scaglione */
  pct: number;
}

/** La tabella standard dei clienti Marketing Edile: la percentuale scende col venduto. */
export const SCAGLIONI_STANDARD: Scaglione[] = [
  { da: 0, a: 50_000, pct: 3 },
  { da: 50_000, a: 150_000, pct: 2.5 },
  { da: 150_000, a: 250_000, pct: 2 },
  { da: 250_000, a: 500_000, pct: 1.5 },
  { da: 500_000, a: 1_000_000, pct: 1 },
  { da: 1_000_000, a: null, pct: 0.75 },
];

/** Scaglioni puliti e in ordine: quelli senza numeri validi si scartano. */
export function normalizzaScaglioni(raw: unknown): Scaglione[] {
  if (!Array.isArray(raw)) return [];
  const out: Scaglione[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const da = Number(r?.da);
    const pct = Number(r?.pct);
    const a = r?.a == null || r?.a === "" ? null : Number(r.a);
    if (!Number.isFinite(da) || da < 0 || !Number.isFinite(pct) || pct < 0) continue;
    if (a != null && (!Number.isFinite(a) || a <= da)) continue;
    out.push({ da, a, pct });
  }
  return out.sort((x, y) => x.da - y.da);
}

/**
 * Provvigione progressiva: ogni scaglione si applica solo alla fetta di
 * venduto che ci cade dentro. 75.000 € con la tabella standard = 3% di
 * 50.000 + 2,5% di 25.000 = 2.125 €. Stessa formula della funzione SQL
 * aedix_provvigione_scaglioni.
 */
export function provvigioneAScaglioni(base: number, scaglioni: Scaglione[]): number {
  const b = Number.isFinite(base) ? Math.max(0, base) : 0;
  let tot = 0;
  for (const s of scaglioni) {
    const fetta = Math.max(0, Math.min(b, s.a ?? Infinity) - s.da);
    tot += (fetta * s.pct) / 100;
  }
  return Math.round(tot * 100) / 100;
}

/** Scaglione per scaglione: la fetta di venduto che ci cade e quanto rende. */
export function fetteScaglioni(base: number, scaglioni: Scaglione[]): Array<{ scaglione: Scaglione; fetta: number; importo: number }> {
  const b = Number.isFinite(base) ? Math.max(0, base) : 0;
  return scaglioni.map((s) => {
    const fetta = Math.max(0, Math.min(b, s.a ?? Infinity) - s.da);
    return { scaglione: s, fetta, importo: Math.round(fetta * s.pct) / 100 };
  });
}

/** Percentuale media effettiva sul venduto (0 se non c'è venduto). */
export function aliquotaEffettiva(base: number, scaglioni: Scaglione[]): number {
  if (!base || base <= 0) return 0;
  return Math.round((provvigioneAScaglioni(base, scaglioni) / base) * 10000) / 100;
}

/** Lo scaglione in cui cade il venduto: «sei nel 2,5%». */
export function scaglioneCorrente(base: number, scaglioni: Scaglione[]): Scaglione | null {
  if (!scaglioni.length) return null;
  const b = Math.max(0, base);
  return scaglioni.find((s) => b > s.da && (s.a == null || b <= s.a)) ?? scaglioni[0];
}

/** Quanto manca per entrare nello scaglione successivo (null se è l'ultimo). */
export function alProssimoScaglione(base: number, scaglioni: Scaglione[]): number | null {
  const s = scaglioneCorrente(base, scaglioni);
  if (!s || s.a == null) return null;
  return Math.max(0, s.a - Math.max(0, base));
}

/** Le righe dell'editor: testo libero, da convertire in scaglioni validi. */
export interface RigaScaglione { da: string; a: string; pct: string }

export function righeDaScaglioni(s: Scaglione[]): RigaScaglione[] {
  return s.map((x) => ({ da: String(x.da), a: x.a == null ? "" : String(x.a), pct: String(x.pct) }));
}

export function scaglioniDaRighe(r: RigaScaglione[]): Scaglione[] {
  return normalizzaScaglioni(r.map((x) => ({
    da: x.da === "" ? NaN : Number(x.da),
    a: x.a === "" ? null : Number(x.a),
    pct: x.pct === "" ? NaN : Number(x.pct),
  })));
}

/** Costo per unità: null quando non ci sono unità (0 lead non è «0 €», è «—»). */
export function costoPer(spesa: number, unita: number): number | null {
  if (!unita || unita <= 0) return null;
  return Math.round((spesa / unita) * 100) / 100;
}

/** Variazione percentuale intera rispetto al mese prima; null senza base di confronto. */
export function variazione(adesso: number, prima: number): number | null {
  if (!prima) return null;
  return Math.round(((adesso - prima) / prima) * 100);
}

/** Primo giorno del mese, yyyy-mm-01, spostato di `delta` mesi. */
export function meseChiave(d: Date, delta = 0): string {
  const x = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`;
}

/** La chiave yyyy-mm-01 spostata di `delta` mesi. */
export function spostaMese(chiave: string, delta: number): string {
  const [y, m] = chiave.split("-").map(Number);
  return meseChiave(new Date(y, (m || 1) - 1, 1), delta);
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** «settembre 2026» da yyyy-mm-01. */
export function meseLeggibile(chiave: string): string {
  const [y, m] = chiave.split("-").map(Number);
  return `${MESI[(m || 1) - 1]} ${y}`;
}

/** Ultimo giorno del mese di `chiave`, non oltre oggi (Meta non accetta il futuro). */
export function fineMeseOOggi(chiave: string, oggi: Date): string {
  const [y, m] = chiave.split("-").map(Number);
  const ultimo = new Date(y, m, 0);
  const fine = ultimo < oggi ? ultimo : oggi;
  return `${fine.getFullYear()}-${String(fine.getMonth() + 1).padStart(2, "0")}-${String(fine.getDate()).padStart(2, "0")}`;
}

/** Riga della console, come la restituisce admin_clienti_marketing_riepilogo. */
export interface ClienteMarketing {
  service_client_id: string;
  company_id: string;
  cliente_nome: string;
  logo_url: string | null;
  stato: string;
  data_inizio: string | null;
  billing_model: string;
  provvigione_scaglioni: unknown;
  commerciale: string | null;
  servizio: string | null;
  lead_mese: number;
  lead_prec: number;
  lead_meta: number;
  lead_google: number;
  lead_form: number;
  lead_altri: number;
  lead_lavorati: number;
  lead_non_gestiti: number;
  ore_mediane_primo_contatto: number | null;
  appuntamenti_mese: number;
  appuntamenti_prec: number;
  vinte_mese: number;
  vinte_prec: number;
  valore_vinto_mese: number;
  valore_vinto_prec: number;
  pipeline_aperta: number;
  valore_pipeline_aperta: number;
  fatturato_mese: number | null;
  fatturato_prec: number | null;
  fatture_collegate: boolean;
  spesa_meta: number;
  lead_meta_dichiarati: number;
  spesa_meta_al: string | null;
  spesa_google: number;
  spesa_manuale: number;
  meta_stato: string | null;
  meta_integration_id: string | null;
  meta_account_id: string | null;
  meta_account_nome: string | null;
  meta_pagine: string | null;
  google_account: string | null;
  form_attivi: number;
  utenti: number;
  ultimo_accesso: string | null;
  mese_dovuto: number | null;
  mese_incassato: number | null;
  mese_chiuso: boolean;
  /** lead di ogni giorno degli ultimi 30, dal più vecchio a oggi */
  lead_giorni: number[];
  /** giorni passati dall'ultimo lead; null se non ne è mai arrivato uno */
  giorni_senza_lead: number | null;
  referente_nome: string | null;
  referente_telefono: string | null;
  referente_email: string | null;
  promemoria_aperti: number;
  promemoria_scaduti: number;
  prossimo_promemoria: { id: string; titolo: string; scadenza: string | null; tipo: string | null } | null;
}

export interface LetturaMese {
  spesa: number;
  cpl: number | null;
  costoAppuntamento: number | null;
  cpa: number | null;
  /** venduto imponibile su cui si calcola la provvigione, e da dove viene */
  venduto: number;
  fonteVenduto: "fatture" | "vendite" | "nessuna";
  scaglioni: Scaglione[];
  provvigione: number;
  aliquota: number;
  /** ritorno sulla spesa: venduto / spesa (null senza spesa) */
  roas: number | null;
  avvisi: Avviso[];
}

export type TipoAvviso =
  | "lead_fermi" | "meta_scaduto" | "meta_assente" | "senza_costi" | "senza_lead" | "lead_meta_mancanti"
  | "mai_entrati" | "senza_fatture" | "promemoria";

export interface Avviso {
  tipo: TipoAvviso;
  testo: string;
  grave: boolean;
}

/**
 * Tutto quello che si deduce da una riga: costi unitari, venduto e
 * provvigione del mese, avvisi. Il venduto viene dalle fatture del gestionale
 * quando ci sono; altrimenti dalle vendite chiuse nel CRM.
 */
export function leggiMese(c: ClienteMarketing, meseCorrente: boolean): LetturaMese {
  const spesa = (c.spesa_meta || 0) + (c.spesa_google || 0) + (c.spesa_manuale || 0);
  const scaglioni = normalizzaScaglioni(c.provvigione_scaglioni);
  const fatturato = c.fatturato_mese == null ? null : Number(c.fatturato_mese);
  const fonteVenduto: LetturaMese["fonteVenduto"] = c.fatture_collegate && fatturato != null
    ? "fatture"
    : c.valore_vinto_mese > 0 ? "vendite" : "nessuna";
  const venduto = fonteVenduto === "fatture" ? Math.max(0, fatturato ?? 0) : fonteVenduto === "vendite" ? c.valore_vinto_mese : 0;
  const provvigione = scaglioni.length ? provvigioneAScaglioni(venduto, scaglioni) : 0;

  const avvisi: Avviso[] = [];
  if (c.stato === "attivo") {
    if (c.lead_non_gestiti > 0) {
      avvisi.push({ tipo: "lead_fermi", grave: c.lead_non_gestiti >= 5, testo: `${c.lead_non_gestiti} lead del mese fermi da più di 2 giorni senza nessuna azione` });
    }
    if (c.meta_stato === "token_expired") avvisi.push({ tipo: "meta_scaduto", grave: true, testo: "Collegamento Meta scaduto: va ricollegato" });
    else if (!c.meta_stato) avvisi.push({ tipo: "meta_assente", grave: false, testo: "Meta non collegato: niente costi né lead dalle inserzioni" });
    else if (!c.meta_account_id) avvisi.push({ tipo: "meta_assente", grave: false, testo: "Nessun account pubblicitario scelto su Meta" });
    if (meseCorrente && c.giorni_senza_lead != null && c.giorni_senza_lead >= 3) {
      avvisi.push({ tipo: "senza_lead", grave: c.giorni_senza_lead >= 5, testo: `Nessun lead da ${c.giorni_senza_lead} giorni` });
    } else if (meseCorrente && c.lead_mese === 0) {
      avvisi.push({ tipo: "senza_lead", grave: true, testo: "Nessun lead questo mese" });
    }
    if (c.promemoria_scaduti > 0) {
      avvisi.push({ tipo: "promemoria", grave: false, testo: c.promemoria_scaduti === 1 ? "1 promemoria scaduto" : `${c.promemoria_scaduti} promemoria scaduti` });
    }
    if (c.lead_mese > 0 && spesa === 0) avvisi.push({ tipo: "senza_costi", grave: false, testo: "Costi del mese non ancora caricati: CPL e CPA restano vuoti" });
    if (c.lead_meta_dichiarati > 0 && c.lead_meta < c.lead_meta_dichiarati * 0.8) {
      avvisi.push({ tipo: "lead_meta_mancanti", grave: true, testo: `Meta conta ${c.lead_meta_dichiarati} lead, nel CRM ne sono arrivati ${c.lead_meta}: controlla il collegamento dei moduli` });
    }
    if (c.utenti > 0 && !c.ultimo_accesso) avvisi.push({ tipo: "mai_entrati", grave: false, testo: "Nessun utente del cliente è mai entrato nel gestionale" });
    if (!c.fatture_collegate && c.valore_vinto_mese === 0 && meseCorrente) {
      avvisi.push({ tipo: "senza_fatture", grave: false, testo: "Fatture non collegate: il venduto va inserito a mano alla chiusura del mese" });
    }
  }

  return {
    spesa,
    cpl: costoPer(spesa, c.lead_mese),
    costoAppuntamento: costoPer(spesa, c.appuntamenti_mese),
    cpa: costoPer(spesa, c.vinte_mese),
    venduto,
    fonteVenduto,
    scaglioni,
    provvigione,
    aliquota: aliquotaEffettiva(venduto, scaglioni),
    roas: spesa > 0 ? Math.round((venduto / spesa) * 10) / 10 : null,
    avvisi,
  };
}

/** Cosa si può fare, con un clic, per ogni avviso. */
export type AzioneOggi = "lead_fermi" | "ricollega_meta" | "inserzioni" | "moduli" | "costi" | "referente" | "fatture" | "promemoria" | "entra";

export interface VoceOggi {
  service_client_id: string;
  company_id: string;
  cliente: string;
  tipo: TipoAvviso;
  grave: boolean;
  testo: string;
  azione: AzioneOggi;
}

const AZIONE_PER_TIPO: Record<TipoAvviso, AzioneOggi> = {
  lead_fermi: "lead_fermi",
  meta_scaduto: "ricollega_meta",
  meta_assente: "ricollega_meta",
  senza_lead: "inserzioni",
  senza_costi: "costi",
  lead_meta_mancanti: "moduli",
  mai_entrati: "referente",
  senza_fatture: "fatture",
  promemoria: "promemoria",
};

/**
 * La lista del mattino: gli avvisi di tutti i clienti attivi, i gravi prima,
 * poi per volume di lead (chi porta più lead pesa di più). «Nessun lead» senza
 * un account Meta non porta alle inserzioni: si entra nell'azienda.
 */
export function cosaFareOggi(righe: ClienteMarketing[], meseCorrente: boolean): VoceOggi[] {
  const voci: Array<VoceOggi & { peso: number }> = [];
  for (const c of righe) {
    if (c.stato !== "attivo") continue;
    for (const a of leggiMese(c, meseCorrente).avvisi) {
      let azione = AZIONE_PER_TIPO[a.tipo];
      if (azione === "inserzioni" && !c.meta_account_id) azione = "entra";
      if (azione === "referente" && !c.referente_telefono && !c.referente_email) azione = "entra";
      voci.push({ service_client_id: c.service_client_id, company_id: c.company_id, cliente: c.cliente_nome, tipo: a.tipo, grave: a.grave, testo: a.testo, azione, peso: c.lead_mese });
    }
  }
  return voci
    .sort((x, y) => Number(y.grave) - Number(x.grave) || y.peso - x.peso || x.cliente.localeCompare(y.cliente))
    .map(({ peso: _peso, ...v }) => v);
}

/** Link a Gestione inserzioni di Meta per l'account scelto (act_… o solo cifre). */
export function linkGestioneInserzioni(accountId: string | null): string | null {
  if (!accountId) return null;
  const id = accountId.replace(/^act_/, "").trim();
  return /^\d+$/.test(id) ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id}` : null;
}

/** Link WhatsApp al referente: solo cifre, prefisso italiano se manca. */
export function linkWhatsapp(telefono: string | null): string | null {
  if (!telefono) return null;
  let cifre = telefono.replace(/[^\d+]/g, "");
  if (cifre.startsWith("00")) cifre = `+${cifre.slice(2)}`;
  if (!cifre.startsWith("+")) cifre = cifre.startsWith("39") && cifre.length >= 11 ? `+${cifre}` : `+39${cifre}`;
  const solo = cifre.replace(/\D/g, "");
  return solo.length >= 8 ? `https://wa.me/${solo}` : null;
}

/** Totali della console su tutti i clienti attivi. */
export function totaliMese(righe: ClienteMarketing[], meseCorrente: boolean) {
  const attivi = righe.filter((r) => r.stato === "attivo");
  const letture = attivi.map((r) => leggiMese(r, meseCorrente));
  const somma = (f: (r: ClienteMarketing, l: LetturaMese) => number) => attivi.reduce((s, r, i) => s + f(r, letture[i]), 0);
  return {
    clienti: attivi.length,
    lead: somma((r) => r.lead_mese),
    leadPrec: somma((r) => r.lead_prec),
    appuntamenti: somma((r) => r.appuntamenti_mese),
    vinte: somma((r) => r.vinte_mese),
    valoreVinto: somma((r) => r.valore_vinto_mese),
    spesa: somma((_r, l) => l.spesa),
    venduto: somma((_r, l) => l.venduto),
    provvigioni: somma((_r, l) => l.provvigione),
    dovutoChiuso: somma((r) => (r.mese_chiuso ? Number(r.mese_dovuto ?? 0) : 0)),
    avvisiGravi: letture.reduce((s, l) => s + l.avvisi.filter((a) => a.grave).length, 0),
  };
}
