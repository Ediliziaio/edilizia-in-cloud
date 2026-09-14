/**
 * Sponsorizzate Meta dal gestionale: creazione e gestione.
 *
 * 14/09: la pubblicazione cercava l'account solo in meta_ad_accounts (scritta
 * dal report) e non in meta_assets, dove le aziende lo scelgono → sempre
 * ad_account_not_found. Le creatività uscivano senza immagine, Instagram non
 * aveva identità, la pausa automatica non leggeva la risposta di Meta e gli
 * errori arrivavano come JSON di Graph.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  base64DaBytes,
  byteDaBase64,
  costruisciObjectStorySpec,
  datiDaDataUrl,
  hashDaRispostaAdImages,
  igUserIdDallaPagina,
  limitaPiattaformeSenzaInstagram,
  normalizzaActId,
  sorgenteImmagineAmmessa,
  traduciErroreMeta,
} from "../../../supabase/functions/_shared/metaAdsPubblicazione";

const ROOT = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");
const crea = leggi("supabase/functions/meta-ads-create-campaign/index.ts");
const aggiorna = leggi("supabase/functions/meta-ads-update-campaign/index.ts");
const controlloSpesa = leggi("supabase/functions/meta-ads-spend-check/index.ts");
const pagina = leggi("src/pages/azienda/marketing/AdsManagerBeta.tsx");

describe("normalizzaActId", () => {
  it("aggiunge act_ solo quando manca", () => {
    expect(normalizzaActId("123")).toBe("act_123");
    expect(normalizzaActId("act_123")).toBe("act_123");
    expect(normalizzaActId(" 123 ")).toBe("act_123");
  });
});

describe("traduciErroreMeta", () => {
  const graph = (code: number, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ error: { message: "(#" + code + ") errore", code, ...extra } });

  it("permesso mancante (#200, #10, #294) → ricollegare Meta", () => {
    for (const code of [200, 10, 294]) {
      const e = traduciErroreMeta(graph(code));
      expect(e.codice).toBe("permesso_mancante");
      expect(e.messaggio).toContain("Ricollega Meta per concedere il permesso di gestire le inserzioni");
      expect(e.codice_meta).toBe(code);
    }
  });

  it("token scaduto, limiti e dati rifiutati", () => {
    expect(traduciErroreMeta(graph(190)).codice).toBe("token_scaduto");
    expect(traduciErroreMeta(graph(17)).codice).toBe("limite_richieste");
    const rifiuto = traduciErroreMeta(graph(100, { error_user_msg: "Budget troppo basso" }));
    expect(rifiuto.codice).toBe("dato_rifiutato");
    expect(rifiuto.messaggio).toContain("Budget troppo basso");
  });

  it("testo non JSON: lo riporta, non esplode", () => {
    const e = traduciErroreMeta("Bad Gateway");
    expect(e.codice).toBe("errore_meta");
    expect(e.messaggio).toContain("Bad Gateway");
  });
});

describe("immagini", () => {
  it("data: URL solo se è un'immagine in base64", () => {
    expect(datiDaDataUrl("data:image/png;base64,aGVsbG8=")).toEqual({ mime: "image/png", base64: "aGVsbG8=" });
    expect(datiDaDataUrl("data:text/html;base64,aGVsbG8=")).toBeNull();
    expect(datiDaDataUrl("https://example.com/a.png")).toBeNull();
    expect(datiDaDataUrl("data:image/png;base64,<script>")).toBeNull();
  });

  it("base64 e dimensioni", () => {
    expect(base64DaBytes(new TextEncoder().encode("hello"))).toBe("aGVsbG8=");
    expect(byteDaBase64("aGVsbG8=")).toBe(5);
  });

  it("hash dalla risposta di /adimages, a uno o due livelli", () => {
    expect(hashDaRispostaAdImages({ images: { bytes: { hash: "abc", url: "https://x" } } })).toBe("abc");
    expect(hashDaRispostaAdImages({ images: { act_1: { "f.png": { hash: "def" } } } })).toBe("def");
    expect(hashDaRispostaAdImages({})).toBeNull();
    expect(hashDaRispostaAdImages(null)).toBeNull();
  });

  it("si scarica solo dallo storage del progetto o da un data: URL", () => {
    const base = "https://progetto.supabase.co";
    expect(sorgenteImmagineAmmessa(`${base}/storage/v1/object/public/ad-media/a/b.png`, base)).toBe(true);
    expect(sorgenteImmagineAmmessa("data:image/jpeg;base64,aGVsbG8=", base)).toBe(true);
    expect(sorgenteImmagineAmmessa("http://169.254.169.254/latest/meta-data", base)).toBe(false);
    expect(sorgenteImmagineAmmessa("https://altro.example.com/a.png", base)).toBe(false);
    expect(sorgenteImmagineAmmessa(`${base}/storage/v1/object/public/../../rest/v1/profiles`, base)).toBe(false);
  });
});

describe("Instagram", () => {
  it("l'account collegato viene dai metadata della Pagina", () => {
    expect(igUserIdDallaPagina({ instagram_business_account: { id: "17841400000000000" } })).toBe("17841400000000000");
    expect(igUserIdDallaPagina({ instagram_business_account: null })).toBeNull();
    expect(igUserIdDallaPagina(null)).toBeNull();
  });

  it("senza Instagram gli annunci escono solo su Facebook", () => {
    expect(limitaPiattaformeSenzaInstagram({ age_min: 25 }).targeting.publisher_platforms).toEqual(["facebook"]);
    const manuale = limitaPiattaformeSenzaInstagram({
      publisher_platforms: ["facebook", "instagram"],
      instagram_positions: ["stream"],
    });
    expect(manuale.targeting.publisher_platforms).toEqual(["facebook"]);
    expect(manuale.targeting.instagram_positions).toBeUndefined();
    expect(manuale.cambiato).toBe(true);
    expect(limitaPiattaformeSenzaInstagram({ publisher_platforms: ["instagram"] }).targeting.publisher_platforms).toEqual(["facebook"]);
    expect(limitaPiattaformeSenzaInstagram({ publisher_platforms: ["facebook", "messenger"] }).cambiato).toBe(false);
  });

  it("object_story_spec usa instagram_user_id e image_hash, mai instagram_actor_id", () => {
    const spec = costruisciObjectStorySpec({
      pageId: "111",
      igUserId: "178",
      messaggio: "Infissi nuovi",
      link: "https://esempio.it",
      cta: "GET_QUOTE",
      imageHash: "hash1",
      titolo: "Preventivo gratuito",
    });
    expect(spec.page_id).toBe("111");
    expect(spec.instagram_user_id).toBe("178");
    expect(spec).not.toHaveProperty("instagram_actor_id");
    const link = spec.link_data as Record<string, unknown>;
    expect(link.image_hash).toBe("hash1");
    expect(link).not.toHaveProperty("picture");
    expect(link.name).toBe("Preventivo gratuito");

    const senza = costruisciObjectStorySpec({ pageId: "111", messaggio: "x", link: "https://esempio.it" });
    expect(senza).not.toHaveProperty("instagram_user_id");
    expect(senza.link_data as Record<string, unknown>).not.toHaveProperty("image_hash");
  });
});

describe("meta-ads-create-campaign", () => {
  it("prende l'account scelto in meta_assets, con ripiego su meta_ad_accounts", () => {
    expect(crea).toContain("risolviAccountPubblicitario");
    expect(crea).toMatch(/from\("meta_assets"\)[\s\S]{0,200}eq\("asset_type", "ad_account"\)[\s\S]{0,80}eq\("selected", true\)/);
    expect(crea).toContain('error: "ad_account_not_found"');
    expect(crea).toContain('onConflict: "company_id,ad_account_id"');
  });

  it("carica le immagini su /adimages prima di creare la campagna", () => {
    expect(crea).toContain("/adimages");
    expect(crea).toContain('form.append("bytes", base64)');
    expect(crea.indexOf("caricaImmagineSuMeta(adAccount.ad_account_id")).toBeLessThan(crea.indexOf("// 1. CREATE CAMPAIGN"));
    expect(crea).toContain("image_hash: imageHashes[i] ?? null");
    expect(crea).not.toContain("instagram_actor_id");
  });

  it("gli errori di Graph arrivano tradotti nel detail", () => {
    expect(crea).toContain("traduciErroreMeta(text).messaggio");
    expect(crea).toMatch(/detail,\s*\n\s*errors:/);
  });
});

describe("meta-ads-update-campaign e meta-ads-spend-check", () => {
  it("attivare accende anche ad set e annunci, prima della campagna", () => {
    expect(aggiorna).toContain('from("meta_ad_sets")');
    expect(aggiorna).toContain('from("meta_ads")');
    expect(aggiorna.indexOf("aggiornaSuMeta(ad.meta_ad_id")).toBeLessThan(
      aggiorna.indexOf("aggiornaSuMeta(campaign.meta_campaign_id"),
    );
    expect(aggiorna).toContain("accountAncoraScelto");
    expect(aggiorna).toContain("traduciErroreMeta(corpo ?? testo)");
  });

  it("la pausa automatica legge la risposta di Meta prima di segnare «in pausa»", () => {
    expect(controlloSpesa).toContain("traduciErroreMeta(corpo ?? testo)");
    const controllo = controlloSpesa.indexOf("!resp.ok");
    const segnaPausa = controlloSpesa.indexOf('status: "paused"');
    expect(controllo).toBeGreaterThan(-1);
    expect(controllo).toBeLessThan(segnaPausa);
  });

  it("la pagina mostra il detail anche sulle risposte 4xx", () => {
    expect(pagina).toContain('edgeErrorDetail(error, "Pubblicazione non riuscita")');
    expect(pagina).toContain('edgeErrorDetail(error, "aggiornamento_fallito")');
  });
});
