/**
 * Il listino si carica anche senza contratto (25/11/2026): il contenitore lo
 * apre il programma, una volta sola, e lo dice a chi ha caricato.
 */
import { describe, expect, it } from "vitest";
import { assicuraContratto, nomeContrattoPredefinito } from "@/lib/appalto/contrattoPredefinito";

type Riga = Record<string, unknown>;

/** Il minimo del client Supabase usato da `assicuraContratto`, con il registro delle chiamate. */
function dbFinto(contratti: Riga[], opzioni: { erroreLettura?: unknown; erroreInsert?: unknown } = {}) {
  const registro: string[] = [];
  const inseriti: Riga[] = [];
  const db = {
    from(tabella: string) {
      registro.push(`from:${tabella}`);
      return {
        select: () => {
          const catena = {
            eq: () => catena,
            order: async () => ({ data: contratti, error: opzioni.erroreLettura ?? null }),
          };
          return catena;
        },
        insert: (riga: Riga) => {
          registro.push("insert");
          inseriti.push(riga);
          return {
            select: () => ({
              single: async (): Promise<{ data: Riga | null; error: unknown }> =>
                opzioni.erroreInsert
                  ? { data: null, error: opzioni.erroreInsert }
                  : { data: { id: "nuovo", nome: riga.nome }, error: null },
            }),
          };
        },
      };
    },
  };
  return { db, registro, inseriti };
}

const base = { companyId: "az", committenteId: "comm" };

describe("assicuraContratto", () => {
  it("usa il contratto che la pagina ha già, senza toccare il database", async () => {
    const { db, registro } = dbFinto([]);
    const dove = await assicuraContratto(db, { ...base, contratto: { id: "c1", nome: "Accordo 2026" } });
    expect(dove).toEqual({ id: "c1", nome: "Accordo 2026", creato: false });
    expect(registro).toEqual([]);
  });

  it("riusa il contratto in corso invece di crearne un secondo", async () => {
    const { db, inseriti } = dbFinto([
      { id: "c2", nome: "Accordo 2026", valido_dal: "2026-01-01", valido_al: null, attivo: true },
    ]);
    const dove = await assicuraContratto(db, { ...base, contratto: null });
    expect(dove).toEqual({ id: "c2", nome: "Accordo 2026", creato: false });
    expect(inseriti).toEqual([]);
  });

  it("ripiega su un contratto scaduto: nessun accordo nuovo a sua insaputa", async () => {
    const { db, inseriti } = dbFinto([
      { id: "vecchio", nome: "Accordo 2025", valido_dal: "2025-01-01", valido_al: "2025-12-31", attivo: true },
    ]);
    const dove = await assicuraContratto(db, { ...base, contratto: null });
    expect(dove.id).toBe("vecchio");
    expect(dove.creato).toBe(false);
    expect(inseriti).toEqual([]);
  });

  it("senza nessun contratto ne apre uno coi predefiniti e lo dichiara creato", async () => {
    const { db, inseriti } = dbFinto([]);
    const dove = await assicuraContratto(db, { ...base, contratto: null });
    expect(dove).toEqual({ id: "nuovo", nome: nomeContrattoPredefinito(), creato: true });
    expect(inseriti).toHaveLength(1);
    expect(inseriti[0]).toMatchObject({ company_id: "az", committente_id: "comm", nome: nomeContrattoPredefinito() });
    // Le condizioni le mette il database (30 gg, ritenuta 0, per commessa, IVA ordinaria):
    // scriverle qui vorrebbe dire due verità in due posti.
    expect(Object.keys(inseriti[0]).sort()).toEqual(["committente_id", "company_id", "nome", "valido_dal"]);
    expect(String(inseriti[0].valido_dal)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("se la lettura fallisce non inventa un contratto", async () => {
    const { db, inseriti } = dbFinto([], { erroreLettura: new Error("rete") });
    await expect(assicuraContratto(db, { ...base, contratto: null })).rejects.toBeTruthy();
    expect(inseriti).toEqual([]);
  });

  it("se la creazione fallisce l'errore arriva a chi ha caricato", async () => {
    const { db } = dbFinto([], { erroreInsert: { message: "permesso negato" } });
    await expect(assicuraContratto(db, { ...base, contratto: null })).rejects.toBeTruthy();
  });
});
