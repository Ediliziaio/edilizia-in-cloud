/**
 * Il piano di volo (fase 5, lotto 5.3): quali fasi si controllano (3 giorni lavorativi prima),
 * cosa trova il controllo (persone, mezzi, ordini, DURC, meteo) con l'azione pronta, la proposta
 * del SAL a fine fase; e la funzione del cron: risposta rapida, segreto, nessun messaggio, il
 * job scritto ma non acceso.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  controlloFase, fasiAppenaFinite, fasiDaControllare, propostaSal, type StatoDellaFase,
} from "../../../shared/silvio-commessa/pianoVolo.ts";
import type { ContestoRisorse } from "../../../shared/silvio-commessa/risorse.ts";
import { azioneInParole } from "@/lib/silvio-commessa/pianoVolo";

const radice = resolve(__dirname, "../../..");

const ctx = (patch: Partial<ContestoRisorse> = {}): ContestoRisorse => ({
  oggi: "2026-11-11",
  dipendenti: [{ id: "p1", nome: "Mario Bianchi", attivo: true }, { id: "p2", nome: "Luca Verdi", attivo: true }],
  storicoDipendenti: [{ employee_id: "p1", fase: "Rifacimento tetto" }, { employee_id: "p2", fase: "Rifacimento tetto" }],
  impegniDipendenti: [], assenze: [], staff: [], capomastri: [],
  ditte: [], storicoDitte: [], documentiDitte: [],
  mezzi: [{ id: "m1", nome: "Piattaforma aerea", stato: "disponibile", gestione: "singola", quantita_totale: 1 }],
  storicoMezzi: [{ mezzo_id: "m1", fase: "Rifacimento tetto" }], impegniMezzi: [],
  fornitori: [], storicoAcquisti: [],
  ...patch,
});
const vuoto: StatoDellaFase = { persone: [], mezzi: [], ditte: [], ordini: [] };
const TETTO = { id: "f1", nome: "Rifacimento tetto", dal: "2026-11-16", al: "2026-11-20" };

describe("quali fasi", () => {
  it("si controllano le fasi che partono fra 1 e 3 giorni lavorativi", () => {
    const fasi = [
      { id: "a", nome: "A", dal: "2026-11-16", al: "2026-11-20" }, // lunedì: 3 giorni lavorativi da mercoledì 11
      { id: "b", nome: "B", dal: "2026-11-17", al: null },         // 4: non ancora
      { id: "c", nome: "C", dal: "2026-11-11", al: null },         // oggi: già partita
      { id: "d", nome: "D", dal: null, al: null },
    ];
    expect(fasiDaControllare(fasi, "2026-11-11").map((f) => f.id)).toEqual(["a"]);
  });

  it("le feste allungano l'attesa: con l'Immacolata il 9/12 è a 2 giorni dal 4/12", () => {
    expect(fasiDaControllare([{ id: "x", nome: "X", dal: "2026-12-09", al: null }], "2026-12-04").map((f) => f.id)).toEqual(["x"]);
  });

  it("le fasi appena finite: ieri o l'altro ieri, lavorativi", () => {
    const fasi = [{ id: "a", nome: "A", dal: "2026-11-02", al: "2026-11-06" }, { id: "b", nome: "B", dal: "2026-10-01", al: "2026-10-20" }];
    expect(fasiAppenaFinite(fasi, "2026-11-09").map((f) => f.id)).toEqual(["a"]); // venerdì → lunedì
  });
});

describe("il controllo della fase", () => {
  it("nessuno assegnato: il problema e chi è libero, pronto da assegnare; il mezzo di solito usato; il meteo di novembre", () => {
    const c = controlloFase(TETTO, vuoto, ctx());
    expect(c.problemi.map((p) => p.area)).toEqual(["persone", "meteo"]);
    expect(c.azioni.map((a) => a.tipo)).toEqual(["assegna_persona", "prenota_mezzo"]);
    expect(c.azioni[0]).toMatchObject({ employee_id: "p1", fase_id: "f1" });
    expect(c.riassunto).toBe("«Rifacimento tetto» parte il 16/11: una cosa da sistemare.");
  });

  it("chi è assegnato ma è in ferie diventa un problema, e si propone un altro", () => {
    const c = controlloFase(TETTO, { ...vuoto, persone: [{ employee_id: "p1", nome: "Mario Bianchi" }] },
      ctx({ assenze: [{ employee_id: "p1", dal: "2026-11-18", al: "2026-11-19", tipo: "ferie" }] }));
    expect(c.problemi[0].testo).toMatch(/Mario Bianchi è assente \(ferie\)/);
    expect(c.azioni[0]).toMatchObject({ tipo: "assegna_persona", employee_id: "p2" });
  });

  it("mezzo prenotato altrove, ordine in bozza, consegna dopo l'inizio, DURC scaduto: ognuno col suo da fare", () => {
    const c = controlloFase(TETTO, {
      persone: [{ employee_id: "p1", nome: "Mario Bianchi" }],
      mezzi: [{ mezzo_id: "m1", nome: "Piattaforma aerea" }],
      ditte: [{ external_team_id: "d1", nome: "Lattoneria Prova", subappaltatore_id: "s1" }],
      ordini: [
        { id: "o1", numero: "ODA-1", fornitore: "Tegole Srl", stato: "bozza", consegna: "2026-11-13" },
        { id: "o2", numero: "ODA-2", fornitore: "Guaine Srl", stato: "inviato", consegna: "2026-11-18" },
        { id: "o3", numero: "ODA-3", fornitore: "Viti Srl", stato: "ricevuto", consegna: null },
      ],
    }, ctx({
      impegniMezzi: [{ mezzo_id: "m1", commessa: "ORD-9", dal: "2026-11-19", al: "2026-11-25", quantita: 1 }],
      documentiDitte: [{ subappaltatore_id: "s1", tipo: "durc", scadenza: "2026-10-31", esito: null }],
    }));
    expect(c.problemi.map((p) => p.area)).toEqual(["mezzi", "materiali", "materiali", "ditte", "meteo"]);
    expect(c.problemi[0].testo).toMatch(/già prenotato per la commessa ORD-9/);
    expect(c.problemi[3].testo).toMatch(/DURC è scaduto il 31\/10/);
    expect(c.azioni.map((a) => (a.tipo === "attivita" ? a.titolo : a.tipo))).toEqual([
      "Manda l'ordine ODA-1 a Tegole Srl", "Sollecita Guaine Srl: consegna prima del 16/11", "Chiedi a Lattoneria Prova il DURC e i documenti aggiornati",
    ]);
  });

  it("tutto pronto: il riassunto lo dice, e le azioni vietate non si propongono", () => {
    const pronto = controlloFase({ id: "f2", nome: "Impianto elettrico", dal: "2026-11-16", al: "2026-11-18" },
      { ...vuoto, persone: [{ employee_id: "p1", nome: "Mario Bianchi" }] }, ctx());
    expect(pronto.problemi).toEqual([]);
    expect(pronto.riassunto).toBe("Tutto pronto per «Impianto elettrico» il 16/11.");
    const vietato = controlloFase(TETTO, vuoto, ctx(), { squadra: { livello: "vietata", soglia_eur: null }, mezzi: { livello: "vietata", soglia_eur: null } });
    expect(vietato.azioni).toEqual([]);
    expect(vietato.problemi[0].testo).toMatch(/Nessuno è assegnato/);
  });

  it("le azioni si leggono in una riga", () => {
    const c = controlloFase(TETTO, vuoto, ctx());
    expect(azioneInParole(c.azioni[0])).toMatch(/^Assegna Mario Bianchi: è libero/);
  });
});

describe("la proposta del SAL", () => {
  const fasi = [
    { id: "a", nome: "Demolizioni", dal: "2026-11-02", al: "2026-11-06", giorni: 5 },
    { id: "b", nome: "Impianti", dal: "2026-11-09", al: "2026-11-20", giorni: 10 },
    { id: "c", nome: "Finiture", dal: "2026-11-23", al: "2026-12-04", giorni: 10 },
  ];
  it("con la rata a SAL, l'importo è quello della rata", () => {
    const p = propostaSal({ fasi, finita: fasi[0], totale: 20000, salFatti: [],
      rate: [{ trigger_evento: "sal_numero", trigger_numero: 1, amount: 4000, label: "1° SAL" }] });
    expect(p).toMatchObject({ tipo: "sal_bozza", numero: 1, importo: 4000, pct_avanzamento_totale: 20 });
  });
  it("senza la rata di quel numero, l'avanzamento meno i SAL fatti", () => {
    const p = propostaSal({ fasi, finita: fasi[1], totale: 20000, salFatti: [{ numero: 1, importo: 4000 }],
      rate: [{ trigger_evento: "sal_numero", trigger_numero: 1, amount: 4000, label: "1° SAL" }] });
    expect(p).toMatchObject({ numero: 2, pct_avanzamento_totale: 60, importo: 8000 });
  });
  it("una commessa senza rate a SAL non ha proposte di SAL", () => {
    expect(propostaSal({ fasi, finita: fasi[0], totale: 20000, salFatti: [], rate: [{ trigger_evento: "fine_lavori", trigger_numero: null, amount: 20000, label: "Saldo" }] })).toBeNull();
  });
});

describe("la funzione del cron e il job", () => {
  const funzione = readFileSync(resolve(radice, "supabase/functions/silvio-piano-volo/index.ts"), "utf8");
  it("risponde rapida a pg_net, controlla il segreto, non manda messaggi né chiama l'AI", () => {
    expect(funzione).toMatch(/serveConMetricheRapida\("silvio-piano-volo"/);
    expect(funzione).toMatch(/cronSecretValido\(req\)/);
    // Il codice, senza i commenti (che dicono proprio che niente parte).
    const codice = funzione.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codice).not.toMatch(/sendEmail|whatsapp|openwa|aiRouter|fetch\(/i);
    expect(funzione).toMatch(/type: "silvio_piano_volo"/);
  });
  it("verify_jwt = false in config.toml", () => {
    const config = readFileSync(resolve(radice, "supabase/config.toml"), "utf8");
    expect(config).toMatch(/\[functions\.silvio-piano-volo\]\nverify_jwt = false/);
  });
  it("il job è scritto fuori da supabase/migrations: 15 secondi e segreto dal Vault", () => {
    const job = resolve(radice, "supabase/migrations-pending/20281106142500_silvio_piano_volo_cron.sql");
    expect(existsSync(job)).toBe(true);
    expect(existsSync(resolve(radice, "supabase/migrations/20281106142500_silvio_piano_volo_cron.sql"))).toBe(false);
    const sql = readFileSync(job, "utf8");
    expect(sql).toMatch(/timeout_milliseconds := 15000/);
    expect(sql).toMatch(/vault\.decrypted_secrets where name = 'cron_secret'/);
  });
});
