/** «Prepara dalla giornata»: legge una commessa e un giorno, e dice cosa non ha potuto leggere. */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFinto } from "../helpers/dbFinto";
import { leggiBozzaGiornale, type PermessiBozza } from "@/lib/campo/leggiBozzaGiornale";

const DATA = "2026-10-28";
const TUTTI: PermessiBozza = { amministratore: true, vedeRapportini: true, vedeSegnalazioni: true };

function database(): DbFinto {
  const db = new DbFinto();
  Object.assign(db.tabelle, {
    campo_rapportini: [
      { id: "r1", company_id: "az", order_id: "o1", user_id: "u1", stato: "inviato", data_lavoro: DATA, descrizione_lavori: "Getto", autore: { first_name: "Mario", last_name: "Rossi" } },
      { id: "r2", company_id: "az", order_id: "o1", user_id: "u2", stato: "approvato", data_lavoro: DATA, descrizione_lavori: "Scavo", autore: { first_name: "Luca", last_name: null } },
      { id: "r-altro", company_id: "az", order_id: "o2", user_id: "u2", stato: "approvato", data_lavoro: DATA, descrizione_lavori: "Altro cantiere" },
    ],
    ddt_ricezione: [
      { id: "d1", company_id: "az", order_id: "o1", numero_ddt: "5", stato: "ricevuto", data_ricezione: DATA },
      { id: "d2", company_id: "az", order_id: null, oda: { order_id: "o1" }, numero_ddt: "6", stato: "verificato", data_ricezione: DATA },
      { id: "d-altra", company_id: "az", order_id: "o2", numero_ddt: "7", stato: "ricevuto", data_ricezione: DATA },
      { id: "d-att", company_id: "az", order_id: "o1", numero_ddt: "8", stato: "atteso", data_ricezione: DATA },
    ],
    tickets: [
      { id: "t1", company_id: "az", order_id: "o1", fonte: "campo", titolo: "Perdita", created_at: `${DATA}T10:00:00.000Z` },
      { id: "t-uff", company_id: "az", order_id: "o1", fonte: "ufficio", titolo: "Ufficio", created_at: `${DATA}T10:00:00.000Z` },
      { id: "t-ieri", company_id: "az", order_id: "o1", fonte: "campo", titolo: "Ieri", created_at: "2026-10-27T10:00:00.000Z" },
    ],
    foto_cantiere: [{ id: "f1", company_id: "az", order_id: "o1", taken_at: `${DATA}T09:00:00.000Z` }],
  });
  return db;
}

const leggi = (db: DbFinto, permessi: PermessiBozza) =>
  leggiBozzaGiornale(db.client as unknown as SupabaseClient, { companyId: "az", orderId: "o1", data: DATA, permessi });

describe("leggiBozzaGiornale", () => {
  it("prende solo quel cantiere e quel giorno, con i nomi di chi ha scritto", async () => {
    const { bozza, avvisi } = await leggi(database(), TUTTI);
    expect(avvisi).toEqual([]);
    expect(bozza.campi.lavorazioni_eseguite).toBe("Mario Rossi: Getto\nLuca: Scavo");
    expect(bozza.fonti).toEqual({ source_rapportini_ids: ["r1", "r2"], source_ddt_ids: ["d1", "d2"], source_segnalazioni_ids: ["t1"], source_foto_ids: ["f1"] });
  });

  it("senza permesso sulle segnalazioni le salta e lo dice", async () => {
    const db = database();
    const { bozza, avvisi } = await leggi(db, { amministratore: false, vedeRapportini: true, vedeSegnalazioni: false });
    expect(bozza.fonti.source_segnalazioni_ids).toEqual([]);
    expect(avvisi.join(" ")).toContain("Segnalazioni dal campo non riportate");
    expect(avvisi.join(" ")).toContain("magazzini a cui sei assegnato");
    expect(db.operazioni.some((o) => o.tabella === "tickets")).toBe(false);
  });

  it("un errore sulle bolle non ferma la proposta, sui rapportini sì", async () => {
    const db = database();
    db.erroriProssimi["ddt_ricezione:select"] = { message: "rotto" };
    const { bozza, avvisi } = await leggi(db, TUTTI);
    expect(bozza.campi.lavorazioni_eseguite).not.toBe("");
    expect(bozza.fonti.source_ddt_ids).toEqual([]);
    expect(avvisi).toContain("Non sono riuscito a leggere le bolle del giorno.");

    const db2 = database();
    db2.erroriProssimi["campo_rapportini:select"] = { message: "rotto" };
    await expect(leggi(db2, TUTTI)).rejects.toThrow("rapportini");
  });
});
