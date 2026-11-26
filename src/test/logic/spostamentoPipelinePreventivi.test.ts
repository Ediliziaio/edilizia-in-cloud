import { describe, expect, it } from "vitest";
import { pianoSpostamentoPreventivo } from "@/lib/preventivi/spostamentoPipeline";
import type { UnifiedRow } from "@/components/marketing/preventivi/UnifiedPreventiviList";

const riga = (patch: Partial<UnifiedRow>): UnifiedRow => ({ id: "1", tipo: "serramenti", numero: "SF-1", cliente: "Cliente", commerciale_id: null, commerciale_nome: null, stato_unif: "bozza", stato_raw: "bozza", totale: 100, data: "2026-01-01", href: "/test", ...patch });

describe("spostamento preventivi", () => {
  it("usa la transizione prevista dal modulo serramenti", () => {
    expect(pianoSpostamentoPreventivo(riga({}), "in_corso")).toMatchObject({ tabella: "sr_progetti", colonna: "stato", da: "bozza", a: "da_consegnare" });
    expect(pianoSpostamentoPreventivo(riga({ stato_unif: "in_corso", stato_raw: "consegnato" }), "vinto")).toMatchObject({ a: "accettato" });
  });
  it("non inventa invii, firme o stati del computo e non riapre una vendita accettata", () => {
    expect(pianoSpostamentoPreventivo(riga({ tipo: "classico" }), "in_corso")).toBeNull();
    expect(pianoSpostamentoPreventivo(riga({ tipo: "computo" }), "perso")).toBeNull();
    expect(pianoSpostamentoPreventivo(riga({ stato_unif: "vinto", stato_raw: "accettato" }), "perso")).toBeNull();
  });
  it("usa il corrispondente stato perso per ogni modulo", () => {
    expect(pianoSpostamentoPreventivo(riga({ tipo: "classico" }), "perso")).toMatchObject({ tabella: "quotes", colonna: "status", a: "rifiutata" });
    expect(pianoSpostamentoPreventivo(riga({ tipo: "fotovoltaico" }), "perso")).toMatchObject({ tabella: "fv_progetti", a: "annullato" });
  });
});
