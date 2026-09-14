/**
 * Facebook o Instagram per i lead Meta.
 *
 * BeMade, 14/09: il registro attività diceva solo «Fonte: Meta Lead Ads».
 * La piattaforma si chiede a Meta a parte: un errore non deve mai fermare
 * l'ingresso del lead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizzaPiattaformaMeta, piattaformaDelLead } from "../../../supabase/functions/_shared/metaPiattaforma";

const ROOT = join(__dirname, "../../..");
const processa = readFileSync(join(ROOT, "supabase/functions/meta-process-leads/index.ts"), "utf8");

const risposta = (body: unknown) => async () => ({ json: async () => body });

describe("normalizzaPiattaformaMeta", () => {
  it("traduce le sigle di Graph", () => {
    expect(normalizzaPiattaformaMeta("fb")).toBe("facebook");
    expect(normalizzaPiattaformaMeta("ig")).toBe("instagram");
    expect(normalizzaPiattaformaMeta(" IG ")).toBe("instagram");
    expect(normalizzaPiattaformaMeta("msg")).toBe("messenger");
    expect(normalizzaPiattaformaMeta("an")).toBe("audience_network");
  });

  it("un valore sconosciuto resta vuoto", () => {
    expect(normalizzaPiattaformaMeta("tiktok")).toBeNull();
    expect(normalizzaPiattaformaMeta(undefined)).toBeNull();
    expect(normalizzaPiattaformaMeta(3)).toBeNull();
  });
});

describe("piattaformaDelLead", () => {
  it("legge platform dalla risposta", async () => {
    expect(await piattaformaDelLead("1", "t", "v21.0", risposta({ id: "1", platform: "ig" }))).toBe("instagram");
  });

  it("un errore di Meta o di rete torna null, non lancia", async () => {
    expect(await piattaformaDelLead("1", "t", "v21.0", risposta({ error: { code: 100, message: "Tried accessing nonexisting field (platform)" } }))).toBeNull();
    expect(await piattaformaDelLead("1", "t", "v21.0", async () => { throw new Error("rete"); })).toBeNull();
  });
});

describe("meta-process-leads", () => {
  it("la richiesta principale del lead non contiene platform", () => {
    const principale = processa.match(/fields=id,created_time,field_data[^&`]*/)?.[0] ?? "";
    expect(principale).not.toMatch(/platform/);
  });

  it("salva la piattaforma su contatto nuovo e aggiornato", () => {
    expect(processa).toMatch(/updateData\.meta_platform = piattaforma/);
    expect(processa).toMatch(/meta_platform: piattaforma,/);
  });
});

describe("registro attività: evento di ingresso", async () => {
  const { righeOrigine } = await import("@/lib/marketing/origineContatto");

  it("mostra fonte, piattaforma, campagna e inserzione, una per riga", () => {
    expect(righeOrigine({ fonte: "Meta Lead Ads", piattaforma: "instagram", campagna: "[TOFU] - 50%", inserzione: "Video bagno" }))
      .toBe("Fonte: Meta Lead Ads\nPiattaforma: Instagram\nCampagna: [TOFU] - 50%\nInserzione: Video bagno");
  });

  it("salta i dati che mancano (lead vecchi senza piattaforma)", () => {
    expect(righeOrigine({ fonte: "Meta Lead Ads", campagna: "[TOFU] - 50%" })).toBe("Fonte: Meta Lead Ads\nCampagna: [TOFU] - 50%");
    expect(righeOrigine({})).toBeNull();
  });
});
