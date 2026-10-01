import { describe, expect, it } from "vitest";
import { colleghiGiaAssenti, inizialiRichiedente, nomeRichiedente, type RichiestaPerElenco } from "@/lib/personale/richieste";

const r = (id: string, profilo: string | null, stato: string, da: string, a: string, nome?: string): RichiestaPerElenco => ({
  id, profilo_id: profilo, stato, data_inizio: da, data_fine: a, profilo: nome ? { nome, cognome: "Rossi" } : null,
});

describe("richieste: chi è e chi manca", () => {
  it("senza profilo non resta vuoto", () => {
    expect(nomeRichiedente({ profilo: null })).toBe("Dipendente non collegato");
    expect(inizialiRichiedente({ profilo: null })).toBe("?");
    expect(nomeRichiedente({ profilo: { nome: "Mario", cognome: "Rossi" } })).toBe("Mario Rossi");
    expect(inizialiRichiedente({ profilo: { nome: "mario", cognome: "rossi" } })).toBe("MR");
  });
  it("colleghi già assenti: solo approvate, altre persone, giorni che si sovrappongono", () => {
    const nuova = r("1", "p1", "in_attesa", "2026-10-05", "2026-10-09", "Anna");
    const tutte = [
      nuova,
      r("2", "p2", "approvata", "2026-10-08", "2026-10-12", "Luca"),   // sovrapposta
      r("3", "p3", "approvata", "2026-10-10", "2026-10-12", "Gino"),   // dopo
      r("4", "p4", "in_attesa", "2026-10-05", "2026-10-09", "Piero"),  // non approvata
      r("5", "p1", "approvata", "2026-10-06", "2026-10-06", "Anna"),   // la stessa persona
      r("6", "p5", "approvata", "2026-10-01", "2026-10-05", "Sara"),   // tocca il primo giorno
    ];
    expect(colleghiGiaAssenti(nuova, tutte)).toEqual(["Luca Rossi", "Sara Rossi"]);
  });
});
