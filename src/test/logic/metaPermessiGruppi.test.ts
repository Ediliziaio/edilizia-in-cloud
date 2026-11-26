/**
 * Permessi Meta per gruppo nel collegamento.
 *
 * Un permesso chiesto ma non aggiunto all'app su Meta fa fallire il
 * collegamento di tutte le aziende: ogni gruppo si accende da solo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estraiPermessiConcessi,
  leggiModalitaGruppi,
  MODALITA_PREDEFINITE,
  PERMESSI_BASE,
  scopeRichiesti,
} from "../../../supabase/functions/_shared/metaPermessi";
import { modalitaMessaggiDaImpostazioni } from "../../../supabase/functions/_shared/socialMessaggiMeta";

const ROOT = join(__dirname, "../../..");

describe("leggiModalitaGruppi", () => {
  it("senza impostazioni: sponsorizzate attive e permessi non approvati solo in revisione", () => {
    expect(leggiModalitaGruppi(null)).toEqual(MODALITA_PREDEFINITE);
    expect(MODALITA_PREDEFINITE.sponsorizzate).toBe("attivo");
    expect(MODALITA_PREDEFINITE.post).toBe("spento");
    expect(MODALITA_PREDEFINITE.reportPubblicitari).toBe("revisione");
    expect(MODALITA_PREDEFINITE.webhookPagine).toBe("revisione");
  });

  it("legge il JSON e ignora valori sbagliati", () => {
    const m = leggiModalitaGruppi('{"post":"revisione","statistiche":"true","sponsorizzate":"boh"}');
    expect(m.post).toBe("revisione");
    expect(m.statistiche).toBe("attivo");
    expect(m.sponsorizzate).toBe("spento");
    expect(leggiModalitaGruppi("non json")).toEqual(MODALITA_PREDEFINITE);
  });

  it("i messaggi ripiegano sulla vecchia impostazione meta_messaggi_attivi", () => {
    expect(leggiModalitaGruppi(null, "revisione").messaggi).toBe("revisione");
    expect(leggiModalitaGruppi('{"messaggi":"spento"}', "true").messaggi).toBe("spento");
  });
});

describe("scopeRichiesti", () => {
  const tuttoSpento = { sponsorizzate: "spento", messaggi: "spento", post: "spento", statistiche: "spento", reportPubblicitari: "spento", webhookPagine: "spento" } as const;

  it("con le impostazioni esistenti i clienti non chiedono scope rifiutati o non inviati", () => {
    const modalita = leggiModalitaGruppi('{"sponsorizzate":"attivo","messaggi":"revisione","post":"revisione","statistiche":"revisione"}');
    const cliente = scopeRichiesti(modalita, false);
    expect(cliente).toEqual(expect.arrayContaining(["pages_show_list", "pages_read_engagement", "leads_retrieval", "pages_manage_ads", "business_management", "ads_management"]));
    for (const scope of ["ads_read", "pages_manage_metadata", "pages_messaging", "pages_manage_posts", "read_insights"]) {
      expect(cliente).not.toContain(scope);
    }
    expect(scopeRichiesti(modalita, true)).toEqual(expect.arrayContaining(["ads_read", "pages_manage_metadata"]));
  });

  it("la futura approvazione dei webhook non abilita anche il permesso report rifiutato", () => {
    const modalita = leggiModalitaGruppi({ webhookPagine: "attivo" });
    expect(scopeRichiesti(modalita, false)).toContain("pages_manage_metadata");
    expect(scopeRichiesti(modalita, false)).not.toContain("ads_read");
    expect(scopeRichiesti(leggiModalitaGruppi({ reportPubblicitari: "attivo", webhookPagine: "spento" }), false)).toContain("ads_read");
    expect(scopeRichiesti(leggiModalitaGruppi({ reportPubblicitari: "attivo", webhookPagine: "spento" }), true)).not.toContain("pages_manage_metadata");
  });

  it("i permessi base ci sono sempre, i gruppi spenti no", () => {
    expect(scopeRichiesti({ ...tuttoSpento }, true)).toEqual(PERMESSI_BASE);
  });

  it("in revisione solo il super admin chiede i permessi del gruppo", () => {
    const m = { ...tuttoSpento, post: "revisione" as const };
    expect(scopeRichiesti(m, false)).not.toContain("pages_manage_posts");
    expect(scopeRichiesti(m, true)).toEqual(expect.arrayContaining(["pages_manage_posts", "instagram_content_publish"]));
  });

  it("nessun doppione quando più gruppi condividono instagram_basic", () => {
    const s = scopeRichiesti({ ...tuttoSpento, sponsorizzate: "attivo", messaggi: "attivo", post: "attivo", statistiche: "attivo" }, false);
    expect(s.filter((p) => p === "instagram_basic")).toHaveLength(1);
    expect(s).toEqual(expect.arrayContaining(["ads_management", "read_insights", "instagram_manage_insights", "pages_messaging"]));
  });
});

describe("permessi concessi", () => {
  it("prende solo quelli granted da /me/permissions", () => {
    expect(estraiPermessiConcessi({ data: [
      { permission: "ads_read", status: "granted" },
      { permission: "ads_management", status: "declined" },
      { permission: "pages_show_list", status: "granted" },
    ] })).toEqual(["ads_read", "pages_show_list"]);
    expect(estraiPermessiConcessi({ error: { message: "x" } })).toEqual([]);
  });

  it("il callback salva i permessi letti da Meta", () => {
    const cb = readFileSync(join(ROOT, "supabase/functions/meta-oauth-callback/index.ts"), "utf8");
    expect(cb).toMatch(/me\/permissions/);
    expect(cb).toMatch(/granted_scopes: permessiConcessi\.length > 0/);
  });
});

describe("iscrizione delle pagine ai messaggi", () => {
  it("segue la stessa impostazione per gruppi del login", () => {
    expect(modalitaMessaggiDaImpostazioni('{"messaggi":"revisione"}', null)).toBe("revisione");
    expect(modalitaMessaggiDaImpostazioni('{"post":"attivo"}', "true")).toBe("attivo");
    expect(modalitaMessaggiDaImpostazioni(null, null)).toBe("spento");
  });
});
