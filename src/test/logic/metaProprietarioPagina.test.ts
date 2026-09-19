import { describe, expect, it } from "vitest";
import { proprietarioPagina } from "../../../supabase/functions/_shared/metaProprietarioPagina";

// 19/09/2026: la pagina «Flo» era scelta in Demo Azienda (collegamento scaduto
// dall'08/06) e i lead delle sponsorizzate restavano in una coda ferma. Se la
// pagina è scelta anche nel CRM della piattaforma, il lead deve andare lì.
describe("a chi va il lead di una pagina scelta in più aziende", () => {
  const demo = { integration_id: "i-demo", company_id: "demo" };
  const piattaforma = { integration_id: "i-piatt", company_id: "piattaforma" };

  it("vince il collegamento vivo, anche se l'altro è più vecchio in elenco", () => {
    const collegamenti = [
      { id: "i-demo", status: "token_expired", updated_at: "2026-09-18T10:00:00Z" },
      { id: "i-piatt", status: "connected", updated_at: "2026-09-19T08:00:00Z" },
    ];
    expect(proprietarioPagina([demo, piattaforma], collegamenti)).toEqual(piattaforma);
    expect(proprietarioPagina([piattaforma, demo], collegamenti)).toEqual(piattaforma);
  });

  it("due collegamenti vivi: il più recente", () => {
    const collegamenti = [
      { id: "i-demo", status: "connected", updated_at: "2026-06-08T10:00:00Z" },
      { id: "i-piatt", status: "connected", updated_at: "2026-09-19T08:00:00Z" },
    ];
    expect(proprietarioPagina([demo, piattaforma], collegamenti)).toEqual(piattaforma);
  });

  it("una pagina sola: nessuna scelta da fare", () => {
    expect(proprietarioPagina([demo], [])).toEqual(demo);
    expect(proprietarioPagina([], [])).toBeNull();
  });
});
