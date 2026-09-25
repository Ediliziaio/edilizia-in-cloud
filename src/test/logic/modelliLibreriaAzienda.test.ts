/**
 * I modelli della libreria dei moduli si salvano per l'azienda (25/09/2026).
 *
 * Prima restavano nel solo browser di chi li faceva: un collega su un altro
 * computer creava i preventivi Tetti e Serramenti col modello di serie, senza
 * avviso, e non c'era alcun backup. Ora ogni salvataggio va anche nella tabella
 * modelli_libreria_azienda (src/lib/moduli-vendita/archivioModelli.ts), e la
 * libreria e i preventivatori riportano nel browser le copie più recenti.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Riga { company_id: string; chiave: string; contenuto: unknown; salvato_il: string }

const db = vi.hoisted(() => ({
  righe: [] as Riga[],
  scritture: [] as Riga[],
  /** Le colonne di ogni lettura: si vede se si è scaricato il contenuto o solo l'elenco. */
  letture: [] as string[],
  erroreLettura: null as string | null,
  erroreScrittura: null as string | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const leggi = (colonne: string) => {
    const filtri: Array<(r: Riga) => boolean> = [];
    const domanda = {
      eq: (colonna: keyof Riga, valore: string) => { filtri.push((r) => r[colonna] === valore); return domanda; },
      in: (colonna: keyof Riga, valori: string[]) => { filtri.push((r) => valori.includes(String(r[colonna]))); return domanda; },
      then: <T>(ok: (esito: unknown) => T, ko?: (e: unknown) => T) => {
        db.letture.push(colonne);
        const campi = colonne.split(",").map((c) => c.trim() as keyof Riga);
        return Promise.resolve(db.erroreLettura
          ? { data: null, error: { message: db.erroreLettura } }
          : { data: db.righe.filter((r) => filtri.every((f) => f(r))).map((r) => Object.fromEntries(campi.map((c) => [c, r[c]]))), error: null })
          .then(ok, ko);
      },
    };
    return domanda;
  };
  return {
    supabase: {
      from: (tabella: string) => {
        if (tabella !== "modelli_libreria_azienda") throw new Error(`Tabella inattesa: ${tabella}`);
        return {
          select: leggi,
          upsert: async (riga: Riga) => {
            db.scritture.push(riga);
            if (db.erroreScrittura) return { error: { message: db.erroreScrittura } };
            db.righe = [...db.righe.filter((r) => r.chiave !== riga.chiave), riga];
            return { error: null };
          },
        };
      },
    },
  };
});

import {
  MODELLO_NON_ONLINE,
  archivioModelliAzienda,
  aziendaDelModello,
  modelliDaMandareOnline,
  sincronizzaModelliAzienda,
} from "@/lib/moduli-vendita/archivioModelli";
import { loadLocalSerramentiTemplate, saveLocalSerramentiTemplate } from "@/lib/moduli-vendita/localSerramentiTemplates";
import { createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";

const AZIENDA = "5b0f7c2e-8d1a-4c3b-9e6f-1a2b3c4d5e6f";
const ALTRA = "9c8d7e6f-5a4b-4c3d-8e2f-0a1b2c3d4e5f";
const CHIAVE = `eic:full-bgn-module:v1:${AZIENDA}:vasca-doccia`;
const record = (savedAt: string, titolo: string) => JSON.stringify({ version: 1, companyId: AZIENDA, savedAt, template: { titolo } });
const PRIMA = "2026-09-25T08:00:00.000Z";
const DOPO = "2026-09-25T09:00:00.000Z";
const ARCHIVI = resolve(process.cwd(), "src/lib/moduli-vendita");

beforeEach(() => {
  localStorage.clear();
  db.righe = [];
  db.scritture = [];
  db.letture = [];
  db.erroreLettura = null;
  db.erroreScrittura = null;
});
afterEach(() => vi.restoreAllMocks());

describe("le chiavi dei modelli", () => {
  const archivi = readdirSync(ARCHIVI).filter((f) => /^local.*\.ts$/.test(f) && readFileSync(resolve(ARCHIVI, f), "utf8").includes("`eic:"));

  it("ogni archivio dei moduli salva per l'azienda, non nel solo browser", () => {
    expect(archivi.length).toBeGreaterThanOrEqual(12);
    for (const file of archivi) {
      const codice = readFileSync(resolve(ARCHIVI, file), "utf8");
      expect(codice, file).toContain('from "./archivioModelli"');
      expect(codice, file).toMatch(/storage: \w*StoragePort = archivioModelliAzienda/);
      expect(codice, file).not.toMatch(/=\s*localStorage\b/);
    }
  });

  it("ogni chiave che gli archivi scrivono porta all'azienda del modello", () => {
    for (const file of archivi) {
      const modelli = readFileSync(resolve(ARCHIVI, file), "utf8").match(/`eic:[^`]*`/g) ?? [];
      expect(modelli.length, file).toBeGreaterThan(0);
      for (const modello of modelli) {
        const chiave = modello.slice(1, -1).replace("${encodeURIComponent(companyId)}", AZIENDA).replace(/\$\{[^}]+\}/g, "modello");
        expect(aziendaDelModello(chiave), `${file}: ${chiave}`).toBe(AZIENDA);
      }
    }
  });

  it("le altre chiavi del browser restano solo nel browser", () => {
    expect(aziendaDelModello("sr-autosave-progetto-1")).toBeNull();
    expect(aziendaDelModello("eic:modelli-libreria:in-sospeso:v1")).toBeNull();
    archivioModelliAzienda.setItem("sr-autosave-progetto-1", "{}");
    expect(localStorage.getItem("sr-autosave-progetto-1")).toBe("{}");
    expect(db.scritture).toHaveLength(0);
  });
});

describe("salvare un modello", () => {
  it("lo manda anche online, con la data del salvataggio", async () => {
    const salvato = saveLocalSerramentiTemplate(AZIENDA, "finestre", createSerramentiModuleTemplate({ company_id: AZIENDA }, "finestre"), null);
    await vi.waitFor(() => expect(db.scritture).toHaveLength(1));
    const [riga] = db.scritture;
    expect(riga.company_id).toBe(AZIENDA);
    expect(aziendaDelModello(riga.chiave)).toBe(AZIENDA);
    expect(riga.salvato_il).toBe(salvato.savedAt);
    expect((riga.contenuto as { savedAt: string }).savedAt).toBe(salvato.savedAt);
    await vi.waitFor(() => expect(modelliDaMandareOnline(AZIENDA)).toEqual([]));
  });

  it("se non arriva online lo si dice subito, e resta da mandare", async () => {
    db.erroreScrittura = "rete assente";
    const avviso = vi.fn();
    window.addEventListener(MODELLO_NON_ONLINE, avviso);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      saveLocalSerramentiTemplate(AZIENDA, "finestre", createSerramentiModuleTemplate({ company_id: AZIENDA }, "finestre"), null);
      await vi.waitFor(() => expect(avviso).toHaveBeenCalledOnce());
    } finally {
      window.removeEventListener(MODELLO_NON_ONLINE, avviso);
    }
    expect(loadLocalSerramentiTemplate(AZIENDA, "finestre")).not.toBeNull();
    expect(modelliDaMandareOnline(AZIENDA)).toHaveLength(1);
    expect(modelliDaMandareOnline(ALTRA)).toEqual([]);
  });
});

describe("allineare browser e database", () => {
  /** Un salvataggio dall'editor senza rete: resta nel browser, segnato da mandare online. */
  async function salvaSenzaRete(valore: string) {
    db.erroreScrittura = "rete assente";
    const avviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    archivioModelliAzienda.setItem(CHIAVE, valore);
    await vi.waitFor(() => expect(avviso).toHaveBeenCalledOnce());
    expect(modelliDaMandareOnline(AZIENDA)).toEqual([CHIAVE]);
    db.erroreScrittura = null;
    db.scritture = [];
  }

  it("porta nel browser il modello salvato da un collega su un altro computer", async () => {
    localStorage.setItem(CHIAVE, record(PRIMA, "mio"));
    db.righe = [{ company_id: AZIENDA, chiave: CHIAVE, contenuto: JSON.parse(record(DOPO, "del collega")), salvato_il: DOPO }];
    const esito = await sincronizzaModelliAzienda(AZIENDA);
    expect(esito).toEqual({ scaricati: 1, caricati: 0, daMandareOnline: [] });
    expect(JSON.parse(localStorage.getItem(CHIAVE)!).template.titolo).toBe("del collega");
    expect(db.scritture).toHaveLength(0);
  });

  it("manda online la copia di questo browser quando è la più recente", async () => {
    localStorage.setItem(CHIAVE, record(DOPO, "mio"));
    db.righe = [{ company_id: AZIENDA, chiave: CHIAVE, contenuto: JSON.parse(record(PRIMA, "vecchio")), salvato_il: PRIMA }];
    const esito = await sincronizzaModelliAzienda(AZIENDA);
    expect(esito).toEqual({ scaricati: 0, caricati: 1, daMandareOnline: [] });
    expect(db.righe[0]).toMatchObject({ chiave: CHIAVE, salvato_il: DOPO });
    expect(JSON.parse(localStorage.getItem(CHIAVE)!).template.titolo).toBe("mio");
  });

  it("rimanda online un modello rimasto indietro, e smette di segnalarlo", async () => {
    await salvaSenzaRete(record(PRIMA, "mio"));
    const esito = await sincronizzaModelliAzienda(AZIENDA);
    expect(esito).toEqual({ scaricati: 0, caricati: 1, daMandareOnline: [] });
    expect(db.righe.map((r) => r.chiave)).toEqual([CHIAVE]);
  });

  it("un modello salvato altrove dopo il mio vince anche sulla mia copia in sospeso", async () => {
    await salvaSenzaRete(record(PRIMA, "mio"));
    db.righe = [{ company_id: AZIENDA, chiave: CHIAVE, contenuto: JSON.parse(record(DOPO, "del collega")), salvato_il: DOPO }];
    const esito = await sincronizzaModelliAzienda(AZIENDA);
    expect(esito).toEqual({ scaricati: 1, caricati: 0, daMandareOnline: [] });
    expect(db.scritture).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(CHIAVE)!).template.titolo).toBe("del collega");
  });

  it("se nulla è cambiato legge solo l'elenco, senza riscaricare i modelli", async () => {
    localStorage.setItem(CHIAVE, record(DOPO, "mio"));
    db.righe = [{ company_id: AZIENDA, chiave: CHIAVE, contenuto: JSON.parse(record(DOPO, "mio")), salvato_il: DOPO }];
    const esito = await sincronizzaModelliAzienda(AZIENDA);
    expect(esito).toEqual({ scaricati: 0, caricati: 0, daMandareOnline: [] });
    expect(db.letture).toEqual(["chiave, salvato_il"]);
  });

  it("un modello che non entra nello spazio del browser si legge lo stesso, aggiornato", async () => {
    const pesante = `eic:full-bgn-module:v1:${AZIENDA}:bagno-completo`;
    localStorage.setItem(pesante, record(PRIMA, "vecchio"));
    db.righe = [{ company_id: AZIENDA, chiave: pesante, contenuto: JSON.parse(record(DOPO, "con le foto del collega")), salvato_il: DOPO }];
    const scrivi = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementation((chiave: string, valore: string) => {
      if (chiave === pesante) throw new DOMException("quota", "QuotaExceededError");
      scrivi(chiave, valore);
    });
    const esito = await sincronizzaModelliAzienda(AZIENDA);
    expect(esito.scaricati).toBe(1);
    expect(JSON.parse(localStorage.getItem(pesante)!).template.titolo).toBe("vecchio");
    expect(JSON.parse(archivioModelliAzienda.getItem(pesante)!).template.titolo).toBe("con le foto del collega");
    expect(db.scritture).toHaveLength(0);
  });

  it("non manda online i modelli di un'altra azienda", async () => {
    const altra = `eic:full-bgn-module:v1:${ALTRA}:vasca-doccia`;
    localStorage.setItem(altra, record(DOPO, "altra azienda"));
    const esito = await sincronizzaModelliAzienda(AZIENDA);
    expect(esito).toEqual({ scaricati: 0, caricati: 0, daMandareOnline: [] });
    expect(db.scritture).toHaveLength(0);
  });

  it("se il database non risponde lo dice, e il browser resta com'era", async () => {
    localStorage.setItem(CHIAVE, record(PRIMA, "mio"));
    db.erroreLettura = "timeout";
    await expect(sincronizzaModelliAzienda(AZIENDA)).rejects.toThrow("timeout");
    expect(JSON.parse(localStorage.getItem(CHIAVE)!).template.titolo).toBe("mio");
    expect(db.scritture).toHaveLength(0);
  });
});

describe("la tabella dei modelli", () => {
  const cartella = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(cartella).find((f) => f.endsWith("_modelli_libreria_azienda.sql"));
  const sql = file ? readFileSync(resolve(cartella, file), "utf8") : "";

  it("esiste, con RLS e senza accesso anonimo", () => {
    expect(file).toBeDefined();
    expect(sql).toContain("alter table public.modelli_libreria_azienda enable row level security");
    expect(sql).toContain("revoke all on table public.modelli_libreria_azienda from public, anon, authenticated");
    expect(sql).toMatch(/split_part\(chiave, ':', 4\) = company_id::text/);
  });

  it("la leggono i colleghi, mai il cliente esterno; la scrive chi può modificare i modelli", () => {
    expect(sql).toMatch(/create policy modelli_libreria_lettura[\s\S]*?get_my_company_id\(\)[\s\S]*?not \(select public\.utente_e_cliente_esterno\(\)\)/);
    expect(sql).toMatch(/create policy modelli_libreria_scrittura[\s\S]*?'can_edit_settings_pricing'/);
    expect(sql).toMatch(/as restrictive[\s\S]*?utente_bloccato\(\)/);
  });

  it("una copia più vecchia non sostituisce quella salvata dopo", () => {
    expect(sql).toMatch(/new\.salvato_il < old\.salvato_il/);
  });
});
