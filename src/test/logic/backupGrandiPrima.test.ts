import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Le aziende grandi partono per prime (23/11/2026).
 *
 * `company-backup` fa un giro solo per tutte le aziende: le piccole col dump
 * unico, le grandi a blocchi in una chiamata loro. La catena delle grandi stava
 * in fondo al gestore, dopo i dump e i caricamenti di tutte le piccole — una
 * quarantina di aziende, un minuto e mezzo di file scritti. Quel giro non
 * arrivava in fondo: il runtime ritira il worker e nessuno legge la risposta,
 * perché a pg_net arriva prima della fine del lavoro.
 *
 * Così dal 15/11 le quattordici aziende che vanno a blocchi — Vulcano con 131
 * commesse, Renova, Bonarrigo, le Demo — sono rimaste senza copia per quindici
 * giorni, e Consorzio Amalfi non l'ha mai avuta. Nessun errore da nessuna parte:
 * i file delle piccole c'erano, e il giro moriva zitto prima delle grandi.
 *
 * Qui si tiene fermo l'ORDINE, che è la correzione: prima si conta chi è grande
 * e la catena parte, poi si fa il lavoro lungo.
 */
const SORGENTE = readFileSync(
  join(__dirname, "../../../supabase/functions/company-backup/index.ts"),
  "utf8",
);

describe("il giro del backup", () => {
  it("fa partire le aziende grandi prima di mettersi a fare i dump", () => {
    const catenaGrandi = SORGENTE.indexOf("avviaBackupABlocchi(aBlocchi[0].id");
    const primoDump = SORGENTE.indexOf('admin.rpc("admin_esporta_azienda"');
    expect(catenaGrandi).toBeGreaterThan(-1);
    expect(primoDump).toBeGreaterThan(-1);
    expect(catenaGrandi).toBeLessThan(primoDump);
  });

  it("il conto delle righe non trascina dietro nessun dump", () => {
    const conto = SORGENTE.indexOf('admin.rpc("admin_tabelle_con_dati"');
    const catenaGrandi = SORGENTE.indexOf("avviaBackupABlocchi(aBlocchi[0].id");
    expect(conto).toBeGreaterThan(-1);
    expect(conto).toBeLessThan(catenaGrandi);
    // Fra il conto e la partenza delle grandi non si scrive niente su storage.
    const inMezzo = SORGENTE.slice(conto, catenaGrandi);
    expect(inMezzo).not.toContain(".upload(");
    expect(inMezzo).not.toContain("admin_esporta_azienda");
  });

  it("chi non passa col dump unico ha una catena sua, in coda", () => {
    const primoDump = SORGENTE.indexOf('admin.rpc("admin_esporta_azienda"');
    const catenaRipiego = SORGENTE.indexOf("avviaBackupABlocchi(ripiego[0].id");
    expect(catenaRipiego).toBeGreaterThan(primoDump);
  });
});
