/**
 * Condizioni diverse per UN cliente (07/11/2026).
 *
 * Florin: «se uno ha i permessi, quando fa un preventivo oppure un contratto, può decidere di modificare le
 * condizioni contrattuali specificamente per quel cliente». La regola: titolare e amministratori sempre, gli altri
 * col permesso «Riscrivere le condizioni su un documento» (o con Listino & Prezzi). Controllata anche nel server,
 * perché chi chiama la funzione direttamente non passa dall'interfaccia.
 */
import { describe, expect, it } from "vitest";
import { puoRiscrivereCondizioniNelServer } from "../../../supabase/functions/_shared/permessoCondizioni";
import {
  condizioniDelContratto, condizioniInCodaAlContratto, type ModelloArchivio,
} from "../../../supabase/functions/_shared/condizioniArchivio";

const db = (ruoli: unknown, permessi: Record<string, unknown> | null, errore = false) => ({
  rpc: async (): Promise<{ data: unknown; error: unknown }> => (errore ? { data: null, error: { message: "x" } } : { data: ruoli, error: null }),
  from: () => {
    const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: permessi, error: null as unknown }) };
    return c;
  },
});

describe("Chi può cambiare le condizioni di un documento, nel server", () => {
  it("titolare e amministratore sì", async () => {
    expect(await puoRiscrivereCondizioniNelServer(db(["company_admin"], null), "c", "u")).toBe(true);
    expect(await puoRiscrivereCondizioniNelServer(db(["super_admin"], null), "c", "u")).toBe(true);
  });

  it("un collaboratore solo col permesso, o con Listino & Prezzi", async () => {
    expect(await puoRiscrivereCondizioniNelServer(db(["company_staff"], { can_riscrivere_condizioni: true }), "c", "u")).toBe(true);
    expect(await puoRiscrivereCondizioniNelServer(db(["company_staff"], { can_edit_settings_pricing: true }), "c", "u")).toBe(true);
    expect(await puoRiscrivereCondizioniNelServer(db(["company_staff"], { can_riscrivere_condizioni: false }), "c", "u")).toBe(false);
    expect(await puoRiscrivereCondizioniNelServer(db(["salesperson"], null), "c", "u")).toBe(false);
  });

  it("se il database non risponde, no", async () => {
    const rotto = { rpc: async () => { throw new Error("rete"); }, from: () => { throw new Error("rete"); } };
    expect(await puoRiscrivereCondizioniNelServer(rotto, "c", "u")).toBe(false);
  });
});

describe("La parte del contratto che viene dall'archivio", () => {
  const modello: ModelloArchivio = {
    id: "m", nome: "Appalto", ambito: "appalto", attivo: true, versione: 1,
    clausole: [{ titolo: "Foro", testo: "Torino.", vessatoria: true }],
  };
  const contratto = `# Contratto d'appalto\n## Art. 1 — Oggetto\nRifacimento bagno.\n\n${condizioniInCodaAlContratto(modello)}`;

  it("si riconosce dal titolo in fondo, e cambiare il resto del contratto non la tocca", () => {
    const prima = condizioniDelContratto(contratto);
    expect(prima.startsWith("## Condizioni generali dell'impresa")).toBe(true);
    expect(condizioniDelContratto(contratto.replace("Rifacimento bagno.", "Rifacimento cucina."))).toBe(prima);
  });

  it("toccare una clausola si vede; gli a capo in più no", () => {
    const prima = condizioniDelContratto(contratto);
    expect(condizioniDelContratto(contratto.replace("Torino.", "Milano."))).not.toBe(prima);
    expect(condizioniDelContratto(contratto.replace("Torino.", "Torino.\n\n"))).toBe(prima);
  });

  it("un contratto senza condizioni dell'archivio non ha questa parte", () => {
    expect(condizioniDelContratto("# Contratto\nTesto.")).toBe("");
    expect(condizioniDelContratto(null)).toBe("");
  });
});
