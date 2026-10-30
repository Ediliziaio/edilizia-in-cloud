import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));

import { messaggioServerPos } from "@/hooks/usePos";

describe("messaggio d'errore del server POS", () => {
  it("il messaggio scritto dal nostro server passa com'è", () => {
    expect(messaggioServerPos(422, { error: "Il PDF richiede un font aggiuntivo per U+2192" }, "")).toBe("Il PDF richiede un font aggiuntivo per U+2192");
  });
  it("il limite di risorse della piattaforma diventa un testo comprensibile, non il JSON con i codici", () => {
    const corpo = { code: "WORKER_RESOURCE_LIMIT", message: "Function failed due to not having enough compute resources" };
    const m = messaggioServerPos(546, corpo, JSON.stringify(corpo));
    expect(m).toMatch(/troppo grande/);
    expect(m).not.toMatch(/WORKER|compute/);
    expect(messaggioServerPos(500, { code: "WORKER_LIMIT" }, "")).toMatch(/troppo grande/);
  });
  it("sessione scaduta, gateway e server: frasi italiane", () => {
    expect(messaggioServerPos(401, { code: 401, message: "Invalid JWT" }, '{"code":401,"message":"Invalid JWT"}')).toMatch(/Sessione scaduta/);
    expect(messaggioServerPos(504, {}, "<html>Gateway Time-out</html>")).toMatch(/non risponde/);
    expect(messaggioServerPos(500, {}, "boom")).toMatch(/Problema temporaneo/);
  });
  it("un testo semplice e breve resta, un JSON o una pagina HTML no", () => {
    expect(messaggioServerPos(400, {}, "Richiesta non valida")).toBe("Richiesta non valida");
    expect(messaggioServerPos(400, { x: 1 }, '{"x":1}')).toBe("Operazione non riuscita");
    expect(messaggioServerPos(400, {}, "<html>…</html>", "Anteprima PDF non disponibile")).toBe("Anteprima PDF non disponibile");
    expect(messaggioServerPos(400, {}, "x".repeat(300))).toBe("Operazione non riuscita");
  });
});
