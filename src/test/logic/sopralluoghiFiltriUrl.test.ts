import { describe, expect, it } from "vitest";
import {
  FILTRI_SOPRALLUOGHI,
  leggiFiltriBacheca,
  scriviFiltriBacheca,
} from "@/lib/sopralluoghi/filtriBacheca";

describe("filtri sopralluoghi nell'URL", () => {
  it("non scambia i parametri degli acquisti per filtri dei sopralluoghi", () => {
    expect(
      leggiFiltriBacheca(
        new URLSearchParams(
          "tab=sopralluoghi&vista=elenco&cerca=rame&fase=materiali&periodo=30",
        ),
      ),
    ).toEqual(FILTRI_SOPRALLUOGHI);
  });
  it("scrive e ripristina i filtri senza cancellare scheda e preferenze degli acquisti", () => {
    const p = scriviFiltriBacheca(
      new URLSearchParams("tab=sopralluoghi&commessa=c1&vista=elenco"),
      {
        fase: "firmato",
        periodo: "mese",
        tecnico: "tecnico-1",
        testo: "Mario Rossi",
        soloSenzaPreventivo: true,
      },
    );
    expect(leggiFiltriBacheca(p)).toMatchObject({
      fase: "firmato",
      periodo: "mese",
      tecnico: "tecnico-1",
      testo: "Mario Rossi",
      soloSenzaPreventivo: true,
    });
    expect(p.get("vista")).toBe("elenco");
    expect(p.get("commessa")).toBe("c1");
    const pulito = scriviFiltriBacheca(p, FILTRI_SOPRALLUOGHI);
    expect(pulito.toString()).toBe("tab=sopralluoghi&commessa=c1&vista=elenco");
  });
  it("valori di fase e periodo sconosciuti tornano ai filtri predefiniti", () => {
    expect(
      leggiFiltriBacheca(
        new URLSearchParams("sop_fase=inesistente&sop_periodo=ieri"),
      ),
    ).toEqual(FILTRI_SOPRALLUOGHI);
  });
});
