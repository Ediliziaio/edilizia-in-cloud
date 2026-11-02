import { describe, expect, it } from "vitest";
import { operaiDaProporre, operaiPerIlModello, suggerimentiVerificati, periodoDaControllare } from "../../../supabase/functions/_shared/allocazioneOperai.ts";
import { oggiInParole } from "../../../supabase/functions/_shared/oraItaliana.ts";

const riga = (over: Record<string, unknown>) => ({
  employee_id: "e1", nome: "Capocantiere Rossi", role_type: "operaio", area: "cantiere",
  stato_carico: "libero", ore_30gg: 0, utilizzo_pct: 0, ordini_attivi: 0, ...over,
});

describe("chi si può proporre", () => {
  it("lascia fuori chi è impegnato, assente, sovraccarico e chi non lavora in cantiere", () => {
    const righe = [
      riga({ employee_id: "libero" }),
      riga({ employee_id: "impegnato", stato_carico: "impegnato" }),
      riga({ employee_id: "assente", stato_carico: "assente" }),
      riga({ employee_id: "pieno", stato_carico: "overload" }),
      riga({ employee_id: "ufficio", role_type: "staff_interno" }),
      riga({ employee_id: "impiegato", role_type: "impiegato" }),
      riga({ employee_id: "ditta", role_type: "subappaltatore" }),
      riga({ employee_id: "reparto", area: "amministrazione" }),
      riga({ employee_id: "posatore", role_type: "Posatore Infissi" }),
    ];
    expect(operaiDaProporre(righe).map((r) => r.employee_id)).toEqual(["libero", "posatore"]);
  });

  it("al modello non arrivano né il nome né il reparto: non può scegliere da come si chiama uno", () => {
    const [per] = operaiPerIlModello([riga({})]);
    expect(per).not.toHaveProperty("nome");
    expect(per).not.toHaveProperty("area");
    expect(JSON.stringify(per)).not.toContain("Rossi");
  });
});

describe("le proposte del modello", () => {
  const disponibili = [riga({ employee_id: "a", nome: "Mario Bianchi" }), riga({ employee_id: "b", nome: "Luca Neri", role_type: "Capoposa" })];

  it("scarta chi non è nell'elenco e rimette il nome vero", () => {
    const { suggerimenti } = suggerimentiVerificati([
      { employee_id: "x", nome: "Inventato", ruolo_proposto: "operaio_principale", motivazione: "ok", score: 90 },
      { employee_id: "a", nome: "Altro", ruolo_proposto: "operaio_principale", motivazione: "Libero nel periodo", score: 80 },
    ], disponibili);
    expect(suggerimenti).toHaveLength(1);
    expect(suggerimenti[0].nome).toBe("Mario Bianchi");
  });

  it("capocantiere solo a chi ha quel ruolo in scheda, e lo dice", () => {
    const { suggerimenti, avvisi } = suggerimentiVerificati([
      { employee_id: "a", ruolo_proposto: "capocantiere", motivazione: "Libero", score: 95 },
      { employee_id: "b", ruolo_proposto: "capocantiere", motivazione: "Libero", score: 90 },
    ], disponibili);
    expect(suggerimenti.map((s) => s.ruolo_proposto)).toEqual(["operaio_principale", "capocantiere"]);
    expect(avvisi.join(" ")).toContain("Mario Bianchi");
  });

  it("toglie i motivi che non vengono dai dati: esperienza e nome", () => {
    for (const motivazione of ["Operaio esperto", "Bravo e affidabile", "Molto competente"]) {
      const { suggerimenti: [s] } = suggerimentiVerificati([{ employee_id: "a", motivazione }], disponibili);
      expect(s.motivazione).toContain("Ruolo");
    }
    const { suggerimenti } = suggerimentiVerificati([
      { employee_id: "a", ruolo_proposto: "operaio_principale", motivazione: "Nome indica esperienza, area cantiere match", score: 95 },
    ], [riga({ employee_id: "a", role_type: "operaio", stato_carico: "leggero", ore_30gg: 40 })]);
    expect(suggerimenti[0].motivazione).toBe("Ruolo operaio, carico leggero: 40 ore nell'ultimo mese");
  });
});

describe("il periodo da controllare", () => {
  it("dall'inizio lavori, o da oggi se è già passato, fino alla fine prevista", () => {
    expect(periodoDaControllare({ work_start_date: "2026-10-19", expected_date: "2026-12-14" }, "2026-11-02")).toEqual({ dal: "2026-11-02", al: "2026-12-14", senzaFine: false });
    expect(periodoDaControllare({ work_start_date: "2026-10-19", work_end_date: "2027-01-10", expected_date: "2026-12-14" }, "2026-11-02").al).toBe("2027-01-10");
    expect(periodoDaControllare({ work_start_date: "2027-01-10", expected_date: "2027-02-01" }, "2026-11-02")).toEqual({ dal: "2027-01-10", al: "2027-02-01", senzaFine: false });
  });
  it("senza date, o con la fine già passata, guarda oggi", () => {
    expect(periodoDaControllare({ work_start_date: null, expected_date: null }, "2026-11-02")).toEqual({ dal: "2026-11-02", al: "2026-11-02", senzaFine: true });
    expect(periodoDaControllare({ work_start_date: "2024-01-01", expected_date: "2024-02-01" }, "2026-11-02")).toEqual({ dal: "2026-11-02", al: "2026-11-02", senzaFine: true });
  });
});

describe("oggi per Silvio", () => {
  it("dice il giorno della settimana giusto, nell'ora italiana", () => {
    expect(oggiInParole(new Date("2026-11-02T10:00:00Z")).testo).toBe("lunedì 02/11/2026");
    expect(oggiInParole(new Date("2026-11-01T23:30:00Z"))).toEqual({ iso: "2026-11-02", testo: "lunedì 02/11/2026" });
  });
});
