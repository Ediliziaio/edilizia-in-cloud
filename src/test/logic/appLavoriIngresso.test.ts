import { describe, expect, it } from "vitest";

/**
 * Chi entra dall'app Lavori (23/11/2026). Dal 22/11 l'area campo si è aperta a
 * company_staff e company_admin: chiunque arrivasse su lavori.ediliziaincloud.com
 * veniva trattato come tecnico e, senza essere capocantiere di una commessa
 * (su tutta la piattaforma esistevano 4 righe in tutto), restava su una pagina
 * vuota senza modo di tornare al gestionale.
 */
import { destinazioneAppLavori } from "@/lib/auth/appHome";

describe("l'ingresso dall'app Lavori", () => {
  it("l'operaio e il subappaltatore entrano nell'area campo", () => {
    expect(destinazioneAppLavori({ ruolo: "employee", sottodominio: "lavori" })).toBe("/campo");
    expect(destinazioneAppLavori({ ruolo: "subcontractor", sottodominio: "lavori" })).toBe("/campo");
  });

  it("lo staff d'ufficio e il titolare proseguono verso il gestionale", () => {
    expect(destinazioneAppLavori({ ruolo: "company_staff", sottodominio: "lavori" })).toBeNull();
    expect(destinazioneAppLavori({ ruolo: "company_admin", sottodominio: "lavori" })).toBeNull();
  });

  it("ma la scheda di un cantiere chiesta per nome si apre anche al capocantiere", () => {
    const meta = "/campo/cantieri/scuola-via-milano?tab=documenti";
    expect(destinazioneAppLavori({ ruolo: "company_staff", meta, sottodominio: "lavori" })).toBe(meta);
    expect(destinazioneAppLavori({ ruolo: "company_admin", meta, sottodominio: "app" })).toBe(meta);
  });

  it("chi non c'entra con i cantieri non ci finisce mai", () => {
    expect(destinazioneAppLavori({ ruolo: "customer", meta: "/campo/cantieri/x", sottodominio: "lavori" })).toBeNull();
    expect(destinazioneAppLavori({ ruolo: "super_admin", sottodominio: "lavori" })).toBeNull();
    expect(destinazioneAppLavori({ ruolo: null, sottodominio: "lavori" })).toBeNull();
  });

  it("sugli altri sottodomini l'ingresso nudo non porta nell'area campo", () => {
    expect(destinazioneAppLavori({ ruolo: "employee", sottodominio: "app" })).toBeNull();
    expect(destinazioneAppLavori({ ruolo: "employee", sottodominio: "www" })).toBeNull();
  });
});
