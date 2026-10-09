import { describe, expect, it } from "vitest";
import { destinazioneIndietro } from "@/lib/campo/tornaIndietro";

describe("freccia indietro della testata campo", () => {
  it("dentro l'app torna alla pagina di prima", () => {
    expect(destinazioneIndietro("k3j9x2")).toBe(-1);
  });

  it("aperta da un link (prima pagina della cronologia, chiave «default») porta alla Home, non fuori dall'app", () => {
    expect(destinazioneIndietro("default")).toBe("/campo");
  });
});

describe("una sola freccia indietro sul telefono", () => {
  // La testata dell'app ha già la freccia; le pagine ne avevano una seconda (e quella del cantiere andava alla Home).
  const pagine: Record<string, string> = {
    CampoLavoroDetail: 'rounded-xl bg-muted active:bg-muted max-md:hidden"',
    CampoFotoCantiere: 'rounded-xl active:bg-muted max-md:hidden"',
    CampoSquadra: 'className="h-10 w-10 shrink-0 max-md:hidden"',
    CampoTicketNuovo: 'bg-muted active:bg-muted shrink-0 max-md:hidden"',
  };
  for (const [pagina, pezzo] of Object.entries(pagine)) {
    it(`${pagina}: la freccia della pagina si vede solo da tablet in su`, async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const sorgente = readFileSync(resolve(process.cwd(), `src/pages/campo/${pagina}.tsx`), "utf8");
      expect(sorgente).toContain(pezzo);
    });
  }
});
