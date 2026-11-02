/**
 * La seconda revisione di «Crea con Silvio» (docs/silvio-commessa-revisione-20261102.md), la
 * parte D: database ed edge. Le RPC si provano davvero in una transazione annullata
 * (docs/silvio-commessa-revisione-20261102-prova.sql, con crea → geolocalizzazione → annulla,
 * preventivo → crea → annulla → ricrea, completa da 0, conferma parziale): qui i test tengono
 * fermo il codice che quella prova ha visto, e provano le parti in TypeScript coi gestori veri.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { avvisoLettureFallite, leggiContestoRisorse, righe, righeCerte, type ClientRisorse } from "../../../shared/silvio-commessa/contestoRisorse.ts";
import { controlloDaSegnalare, controlloFase, type StatoDellaFase } from "../../../shared/silvio-commessa/pianoVolo.ts";
import type { ContestoRisorse } from "../../../shared/silvio-commessa/risorse.ts";
import { aziendeDelGiro, giroAzienda, type ClientGiro, type EsitoGiro } from "../../../supabase/functions/silvio-piano-volo/giro.ts";
import { confermaVolo, proposteDelVolo } from "@/lib/silvio-commessa/pianoVolo";
import { STAFF_ROLES } from "@/hooks/useCompanyStaffUsers";

const radice = resolve(__dirname, "../../..");
const migrazione = (nome: string) => readFileSync(resolve(radice, `supabase/migrations/${nome}.sql`), "utf8");
const BOZZE = migrazione("20281112100000_commessa_bozze_silvio");
const AUTONOMIA = migrazione("20281112140000_silvio_autonomia");
const VOLO = migrazione("20281112141000_silvio_piano_volo");
const CORREZIONI = migrazione("20281112090000_silvio_correzioni");

/** Il corpo di una funzione SQL, fino al suo `$$`. */
function funzione(sql: string, nome: string): string {
  const inizio = sql.indexOf(`create or replace function public.${nome}(`);
  expect(inizio, `manca ${nome}`).toBeGreaterThanOrEqual(0);
  const apre = sql.indexOf("$$", inizio);
  return sql.slice(inizio, sql.indexOf("$$", apre + 2));
}

type Riga = Record<string, unknown>;
type Rispondi = (filtri: Record<string, unknown>) => Riga[] | { errore: string };

/** Un client che risponde per tabella, e passa alla risposta i filtri `eq` della domanda. */
function clientFinto(tabelle: Record<string, Rispondi>) {
  const chiamateRpc: { nome: string; argomenti: Record<string, unknown> }[] = [];
  const notifiche: Record<string, unknown>[] = [];
  const domanda = (tabella: string) => {
    const filtri: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    for (const m of ["select", "is", "not", "gte", "lte", "or", "in", "order", "limit"]) q[m] = () => q;
    q.eq = (c: string, v: unknown) => { filtri[c] = v; return q; };
    q.then = (fatto: (r: unknown) => unknown, errore?: (e: unknown) => unknown) => {
      const r = (tabelle[tabella] ?? (() => []))(filtri);
      const risposta = Array.isArray(r) ? { data: r, error: null as null } : { data: null as null, error: { message: r.errore } };
      return Promise.resolve(risposta).then(fatto, errore);
    };
    return q;
  };
  const client = {
    from: (tabella: string) => (tabella === "notifications"
      ? { insert: async (righeNuove: Record<string, unknown>[]) => { notifiche.push(...righeNuove); return { error: null as null }; } }
      : domanda(tabella)),
    rpc: async (nome: string, argomenti: Record<string, unknown>) => {
      chiamateRpc.push({ nome, argomenti });
      return { data: { nuova: true, cambiata: false }, error: null as null };
    },
  };
  return { admin: client as unknown as ClientGiro, db: client as unknown as ClientRisorse, chiamateRpc, notifiche };
}

const esitoVuoto = (): EsitoGiro => ({ oggi: "2026-11-16", aziende: 0, commesse: 0, controlli: 0, sal: 0, notifiche: 0, scadute: 0, errori: [] });
const ORDINE = { id: "o1", order_code: "C-1", company_id: "az", deleted_at: null as string | null, status: "in_corso", assigned_to: "u1", capomastro_user_id: null as string | null, indirizzo_lavori: null as string | null, work_address: null as string | null, total_amount: 100000, vat_rate: 10 };
const faseData = (id: string, dal: string, al: string) => ({ id, name: id, start_date: dal, end_date: al, position: Number(id.slice(1)), order_id: "o1", ordine: ORDINE });

describe("D1: l'annullamento non si ferma per quello che scrivono le macchine", () => {
  const annulla = funzione(BOZZE, "commessa_annulla_silvio");
  it("le colonne di macchina sono scritte una per una, e non comprendono il lavoro di una persona", () => {
    const f = funzione(BOZZE, "_silvio_colonna_di_macchina");
    for (const c of ["updated_at", "version", "work_geocoded_at", "distanza_sede_km", "distanza_sede_minuti", "distanza_sede_il", "ritardo_avvisato_il"]) expect(f).toContain(`'${c}'`);
    for (const c of ["total_amount", "hours_worked", "percentuale_avanzamento", "deposit_paid", "stato", "work_lat"]) expect(f).not.toContain(`'${c}'`);
    expect(annulla).toContain("not public._silvio_colonna_di_macchina(r.tabella, k)");
    expect(annulla).not.toContain("k <> 'updated_at'");
  });
  it("la coordinata conta solo se Silvio l'aveva scritta: il cron riempie solo quelle vuote", () => {
    expect(annulla).toContain("k in ('work_lat', 'work_lng') and r.istantanea->>k is null");
  });
  it("le tabelle delle macchine non sono lavoro aggiunto; quelle col lavoro restano fuori dall'elenco", () => {
    const t = funzione(BOZZE, "_silvio_tabelle_di_macchina");
    for (const n of ["ordine_margine_stato", "commessa_campo_sync", "google_calendar_order_events"]) expect(t).toContain(n);
    for (const n of ["customer_weekly_reports", "giornale_lavori", "order_events", "invoices", "campo_rapportini", "order_attachments", "order_items"]) expect(t).not.toContain(`'${n}'`);
    expect(annulla).toContain("not (k.figlia = any (public._silvio_tabelle_di_macchina()))");
    expect(funzione(BOZZE, "_silvio_stato_riga")).toContain("not (c.figlia = any (public._silvio_tabelle_di_macchina()))");
  });
});

describe("D2, D3, D6, D9, D12: le RPC della commessa", () => {
  const crea = funzione(BOZZE, "commessa_crea_con_silvio");
  const annulla = funzione(BOZZE, "commessa_annulla_silvio");
  it("D2: lo stato del preventivo si registra con la creazione, e sopravvive alla pulizia delle colonne", () => {
    expect(crea.indexOf("delete from public.commessa_bozze_scritture")).toBeLessThan(crea.indexOf("'quotes', v_quote, 'aggiornata'"));
    expect(crea).toContain("jsonb_build_object('status', jsonb_build_object('prima', v_quote_stato, 'dopo', q.status))");
  });
  it("D3: «Completa» tratta lo 0 come vuoto per l'importo, e solo per l'importo", () => {
    expect(funzione(BOZZE, "_silvio_aggiungi")).toContain("(k = 'total_amount' and (v_prima->>k)::numeric = 0)");
  });
  it("D6: il vincolo della bozza non guarda order_id, che è ON DELETE SET NULL", () => {
    expect(BOZZE).not.toContain("commessa_bozze_completa_con_commessa");
    expect(BOZZE).toContain("constraint commessa_bozze_stato_del_modo check (stato = 'bozza' or (modo = 'crea') = (stato = 'creata'))");
  });
  it("D9: «Crea» ripetuto restituisce la commessa nata, prima del controllo «bozza già usata»", () => {
    expect(crea.indexOf("'gia_creata', true")).toBeGreaterThan(0);
    expect(crea.indexOf("'gia_creata', true")).toBeLessThan(crea.indexOf("perform public._silvio_pronta(b)"));
  });
  it("D12: la giacenza torna prima che i movimenti spariscano", () => {
    const rimette = annulla.indexOf("update public.warehouse_stock set quantity = quantity + r.quanto");
    expect(rimette).toBeGreaterThan(0);
    expect(rimette).toBeLessThan(annulla.indexOf("execute format('delete from public.%I where id = $1'"));
  });
});

describe("D4 e P2: chi scrive non scavalca le policy", () => {
  const permessa = funzione(AUTONOMIA, "_silvio_scrittura_permessa");
  it("i contratti chiedono gli stessi due permessi della policy; squadra e condizioni l'amministratore", () => {
    expect(permessa).toMatch(/can_view_costs[\s\S]*can_view_subappaltatori_amministrazione[\s\S]*'contratti_ditte'/);
    expect(permessa).toMatch(/if not v_admin then[\s\S]*'squadra'[\s\S]*'condizioni'/);
    expect(permessa).toContain("'can_view_sicurezza_cantiere'");
  });
  it("senza «Importi di vendita» importo, IVA e rate escono; quello che esce le RPC lo dicono", () => {
    expect(permessa).toMatch(/can_view_order_amounts[\s\S]*#- '\{ordine,total_amount\}' #- '\{ordine,vat_rate\}'/);
    expect(funzione(BOZZE, "commessa_crea_con_silvio")).toContain("'tolte_permessi'");
    expect(funzione(BOZZE, "commessa_completa_con_silvio")).toContain("'tolte_permessi'");
  });
});

describe("D5: le correzioni si leggono dove si vede la commessa", () => {
  it("can_see_order, importi solo con «Importi di vendita», senza commessa solo chi le ha scritte", () => {
    const policy = CORREZIONI.slice(CORREZIONI.indexOf("create policy silvio_correzioni_lettura"), CORREZIONI.indexOf("-- Scrive solo chi può"));
    expect(policy).toContain("public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)");
    expect(policy).toContain("area not in ('economia', 'pagamenti')");
    expect(policy).toContain("'can_view_order_amounts'");
    expect(policy).toContain("when order_id is null then user_id = (select auth.uid())");
  });
});

describe("D7: la conferma del piano di volo", () => {
  const conferma = funzione(VOLO, "silvio_volo_conferma");
  it("resta aperta se c'è qualcosa di saltato o di non scelto", () => {
    expect(conferma).toContain("jsonb_array_length(v_saltate) + jsonb_array_length(v_non_scelte) = 0 then 'confermata' else 'aperta'");
    expect(conferma).not.toMatch(/set stato = 'confermata'/);
  });
  it("quello già fatto non si riesegue e, riscritta la riga dal cron, non si ripropone", () => {
    expect(conferma.indexOf("d->>'chiave' = v_chiave")).toBeLessThan(conferma.indexOf("case x->>'tipo'"));
    expect(funzione(VOLO, "silvio_volo_registra")).toContain("public._silvio_volo_chiave(e.a) not in");
  });
  it("il client riporta lo stato, e cosa è già fatto", async () => {
    const db = { rpc: async () => ({ data: { fatte: [{ indice: 1, tipo: "attivita" }], saltate: [{ indice: 2, tipo: "prenota_mezzo", motivo: "preso" }], gia_fatte: [0], non_scelte: [] as number[], stato: "aperta" }, error: null as null }) };
    await expect(confermaVolo("p", null, db)).resolves.toMatchObject({ stato: "aperta", giaFatte: [0], saltate: [{ indice: 2, motivo: "preso" }] });
    const lista = { rpc: async () => ({ data: [{ id: "p", tipo: "controllo", gia_fatte: [0], saltate: [{ indice: 2, tipo: "prenota_mezzo", motivo: "preso" }] }], error: null as null }) };
    await expect(proposteDelVolo("o", lista)).resolves.toMatchObject([{ giaFatte: [0], saltate: [{ motivo: "preso" }] }]);
  });
});

describe("D8: il SAL conta tutte le fasi della commessa", () => {
  const settimane = [["f1", "2026-10-26", "2026-10-30"], ["f2", "2026-11-02", "2026-11-06"], ["f3", "2026-11-09", "2026-11-13"], ["f4", "2026-11-16", "2026-11-20"]];
  it("dieci fasi, finita la terza: 30 %, anche se la finestra del giro ne vede quattro", async () => {
    const vicine = settimane.map(([id, dal, al]) => faseData(id, dal, al));
    const altre = ["f5", "f6", "f7", "f8", "f9", "f10"].map((id, i) => ({ id, name: id, start_date: null as string | null, end_date: null as string | null, position: 5 + i, sottofasi: [{ giorni: 5 }] }));
    const { admin, db, chiamateRpc } = clientFinto({
      order_work_phases: (filtri) => (filtri.order_id ? [...vicine, ...altre] : vicine),
      order_installments: () => [{ trigger_evento: "sal_numero", trigger_numero: 2, amount: 11000, label: "SAL 2" }],
    });
    const esito = esitoVuoto();
    await giroAzienda(admin, db, "az", "2026-11-16", false, esito);
    expect(esito.errori).toEqual([]);
    const sal = chiamateRpc.find((c) => c.argomenti.p_tipo === "sal");
    expect((sal?.argomenti.p_azioni as { pct_avanzamento_totale: number; importo: number }[])[0]).toMatchObject({ pct_avanzamento_totale: 30, importo: 30000 });
  });
});

describe("D10: un errore di lettura non è un dato vuoto", () => {
  it("il contesto dice cosa non è riuscito a leggere, e il popup ha la frase", async () => {
    const { db } = clientFinto({ hr_assenze: () => ({ errore: "timeout" }), mezzi: () => ({ errore: "permesso" }) });
    const ctx = await leggiContestoRisorse("az", [], null, db);
    expect(ctx.lettureFallite).toEqual(expect.arrayContaining(["le assenze", "i mezzi"]));
    expect(ctx.lettureFallite).toHaveLength(2);
    expect(avvisoLettureFallite(ctx)).toMatch(/non è riuscito a leggere: .*le assenze/);
    const buono = await leggiContestoRisorse("az", [], null, clientFinto({}).db);
    expect(avvisoLettureFallite(buono)).toBeNull();
  });
  it("`righeCerte` alza, `righe` resta per chi può permetterselo", async () => {
    const male = { then: (fatto: (r: { data: unknown; error: { message: string } }) => unknown) => Promise.resolve({ data: null, error: { message: "giù" } }).then(fatto) } as PromiseLike<{ data: unknown; error: { message: string } }>;
    await expect(righeCerte("x", male)).rejects.toThrow(/lettura non riuscita \(x\): giù/);
    await expect(righe(male)).resolves.toEqual([]);
  });
  it("il cron salta la commessa e lo registra: niente «nessuno è assegnato», le altre vanno avanti", async () => {
    const spia = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fase = (order: string, id: string) => ({ id, name: "Tetto", start_date: "2026-11-18", end_date: "2026-11-20", position: 1, order_id: order, ordine: { ...ORDINE, id: order, order_code: order } });
    const { admin, db, chiamateRpc, notifiche } = clientFinto({
      order_work_phases: () => [fase("rotta", "f1"), fase("buona", "f2")],
      order_employees: (filtri) => (filtri.order_id === "rotta" ? { errore: "timeout" } : []),
    });
    const esito = esitoVuoto();
    await giroAzienda(admin, db, "az", "2026-11-16", false, esito);
    spia.mockRestore();
    expect(esito.errori.join(" ")).toMatch(/rotta saltata: lettura non riuscita \(la squadra\): timeout/);
    expect(chiamateRpc.map((c) => c.argomenti.p_order)).toEqual(["buona"]);
    expect(notifiche.map((n) => n.entity_id)).toEqual(["buona"]);
  });
  it("senza sapere cosa ha vietato il titolare, l'azienda si salta tutta", async () => {
    const { admin, db, chiamateRpc } = clientFinto({ silvio_autonomia: () => ({ errore: "giù" }), order_work_phases: () => [faseData("f1", "2026-11-18", "2026-11-20")] });
    await expect(giroAzienda(admin, db, "az", "2026-11-16", false, esitoVuoto())).rejects.toThrow(/autonomia/);
    expect(chiamateRpc).toEqual([]);
  });
});

describe("D11: i punti bassi", () => {
  it("assigned_to e capomastro: solo i ruoli dello staff, gli stessi del popup", () => {
    const f = funzione(BOZZE, "_silvio_colonne");
    const ruoli = /r\.role::text in \(([^)]*)\)/.exec(f)?.[1].split(",").map((x) => x.trim().replace(/'/g, "")) ?? [];
    expect([...ruoli].sort()).toEqual([...STAFF_ROLES].sort());
    expect(ruoli).not.toContain("customer");
  });
  it("«attivita» si ricontrolla: con i promemoria vietati non si esegue, e non si propone", () => {
    expect(funzione(VOLO, "silvio_volo_conferma")).toContain("public._silvio_livello(r.company_id, 'promemoria') = 'vietata'");
    const ctx = ctxBase();
    const stato: StatoDellaFase = { ...vuoto, ordini: [{ id: "o", numero: "1", fornitore: "F", stato: "bozza", consegna: null }] };
    const vietato = controlloFase(TETTO, stato, ctx, { promemoria: { livello: "vietata", soglia_eur: null } });
    expect(vietato.problemi.some((p) => p.area === "materiali")).toBe(true);
    expect(vietato.azioni.filter((a) => a.tipo === "attivita")).toEqual([]);
    expect(controlloFase(TETTO, stato, ctx).azioni.filter((a) => a.tipo === "attivita")).toHaveLength(1);
  });
  it("la rotazione delle aziende: in pochi giorni le vede tutte, oggi al massimo 25", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `az-${String(i).padStart(2, "0")}`);
    const viste = new Set<string>();
    for (const giorno of ["2026-11-16", "2026-11-17", "2026-11-18"]) {
      const oggi = aziendeDelGiro(ids, giorno);
      expect(oggi).toHaveLength(25);
      expect(new Set(oggi).size).toBe(25);
      oggi.forEach((a) => viste.add(a));
    }
    expect(viste.size).toBe(60);
    expect(aziendeDelGiro(["b", "a"], "2026-11-16")).toEqual(["a", "b"]);
  });
  it("«Tutto pronto» non suona la campanella, nel giro vero", async () => {
    const { admin, db, chiamateRpc, notifiche } = clientFinto({
      order_work_phases: () => [faseData("Pittura", "2026-11-18", "2026-11-20")],
      employees: () => [{ id: "p1", first_name: "Mario", last_name: "Bianchi", is_active: true }],
      order_employees: (filtri) => (filtri.order_id ? [{ employee_id: "p1", phase_id: "Pittura", dipendente: { first_name: "Mario", last_name: "Bianchi" } }] : []),
    });
    const esito = esitoVuoto();
    await giroAzienda(admin, db, "az", "2026-11-16", false, esito);
    expect(esito.errori).toEqual([]);
    expect(esito.controlli).toBe(1);
    expect(String(chiamateRpc[0].argomenti.p_riassunto)).toMatch(/Tutto pronto/);
    expect(notifiche).toEqual([]);
    expect(controlloDaSegnalare({ fase: TETTO, problemi: [{ area: "meteo", testo: "pioggia" }], azioni: [], riassunto: "" })).toBe(false);
    expect(controlloDaSegnalare({ fase: TETTO, problemi: [{ area: "ditte", testo: "x" }], azioni: [], riassunto: "" })).toBe(true);
  });
});

const TETTO = { id: "f1", nome: "Pittura interni", dal: "2026-11-16", al: "2026-11-20" };
const vuoto: StatoDellaFase = { persone: [], mezzi: [], ditte: [], ordini: [] };
function ctxBase(patch: Partial<ContestoRisorse> = {}): ContestoRisorse {
  return {
    oggi: "2026-11-11", dipendenti: [{ id: "p1", nome: "Mario Bianchi", attivo: true }, { id: "p2", nome: "Luca Verdi", attivo: false }],
    storicoDipendenti: [], impegniDipendenti: [], assenze: [], staff: [], capomastri: [],
    ditte: [], storicoDitte: [], documentiDitte: [{ subappaltatore_id: "s1", tipo: "durc", scadenza: "2027-06-30", esito: null }],
    mezzi: [], storicoMezzi: [], impegniMezzi: [], fornitori: [], storicoAcquisti: [],
    ...patch,
  };
}

describe("D13: il controllo della fase dice la cosa giusta", () => {
  const ditta = (contratto: string | null) => ({ external_team_id: "t1", nome: "Rossi srl", subappaltatore_id: "s1", contratto });
  it("una fase fatta da una ditta in regola, col contratto: tutto pronto, non «nessuno è assegnato»", () => {
    const c = controlloFase(TETTO, { ...vuoto, ditte: [ditta("attivo")] }, ctxBase());
    expect(c.problemi).toEqual([]);
    expect(c.riassunto).toMatch(/Tutto pronto/);
  });
  it("senza ditte e senza persone, «nessuno è assegnato» c'è ancora", () => {
    expect(controlloFase(TETTO, vuoto, ctxBase()).problemi[0].testo).toMatch(/Nessuno è assegnato/);
  });
  it("un dipendente non più attivo non è «tutto pronto»", () => {
    const c = controlloFase(TETTO, { ...vuoto, persone: [{ employee_id: "p2", nome: "Luca Verdi" }] }, ctxBase());
    expect(c.problemi[0].testo).toBe("Luca Verdi non è più tra i dipendenti attivi.");
    expect(c.riassunto).not.toMatch(/Tutto pronto/);
  });
  it("il contratto della ditta: mancante, in bozza, risolto; attivo non dice niente", () => {
    const testi = (contratto: string | null) => controlloFase(TETTO, { ...vuoto, ditte: [ditta(contratto)] }, ctxBase()).problemi.map((p) => p.testo).join(" ");
    expect(testi(null)).toMatch(/non ha un contratto/);
    expect(testi("bozza")).toMatch(/contratto ancora in bozza/);
    expect(testi("risolto")).toMatch(/contratto risolto/);
    expect(testi("attivo")).toBe("");
    const c = controlloFase(TETTO, { ...vuoto, ditte: [ditta("bozza")] }, ctxBase());
    expect(c.azioni).toMatchObject([{ tipo: "attivita", titolo: "Sistema il contratto di Rossi srl" }]);
  });
  it("una squadra interna non ha né DURC né contratto", () => {
    const interna = { external_team_id: "t2", nome: "Squadra nostra", subappaltatore_id: null as null, interna: true, contratto: null as null };
    expect(controlloFase(TETTO, { ...vuoto, ditte: [interna] }, ctxBase()).problemi).toEqual([]);
  });
});
