import { describe, it, expect } from "vitest";
import {
  METRICHE_INSTAGRAM_GIORNO,
  METRICHE_INSTAGRAM_MEDIA,
  METRICHE_PAGINA,
  METRICHE_POST_FACEBOOK,
  classificaErroreMeta,
  elencoGiorni,
  esitoAccount,
  giorniDaSincronizzare,
  giornoDaEndTime,
  numero,
  seguitiEPersi,
  unisciFollower,
  valoriGiornoFacebook,
  valoriGiornoInstagram,
  valoriPaginaPerGiorno,
  valoriPostFacebook,
  valoriPostInstagram,
  valoriTotali,
} from "../../../supabase/functions/_shared/statisticheSocialLogica";
import {
  etichettaUltimaSync,
  intervalloPeriodo,
  miglioriPost,
  riepilogaStatistiche,
  variazionePercentuale,
  type RigaStatisticaGiornaliera,
  type RigaStatisticaPost,
} from "@/lib/social/statisticheSocial";

describe("metriche scelte", () => {
  it("nessuna metrica di Pagina deprecata (impressions / reach)", () => {
    for (const m of [...METRICHE_PAGINA, ...METRICHE_POST_FACEBOOK]) {
      expect(m).not.toMatch(/impressions|reach/);
    }
  });
  it("Instagram senza impressions né profile_views", () => {
    for (const m of [...METRICHE_INSTAGRAM_GIORNO, ...METRICHE_INSTAGRAM_MEDIA]) {
      expect(["impressions", "profile_views", "website_clicks", "plays", "video_views"]).not.toContain(m);
    }
  });
});

describe("classificaErroreMeta", () => {
  it("permessi e token", () => {
    expect(classificaErroreMeta({ code: 10, message: "(#10) Application does not have permission" })).toBe("permesso");
    expect(classificaErroreMeta({ code: 200, message: "(#200) read_insights" })).toBe("permesso");
    expect(classificaErroreMeta({ code: 190, message: "Error validating access token" })).toBe("permesso");
    expect(classificaErroreMeta({ code: 100, message: "Object does not exist, cannot be loaded due to missing permissions" })).toBe("permesso");
  });
  it("metrica non valida, limite, altro", () => {
    expect(classificaErroreMeta({ code: 100, message: "(#100) The value must be a valid insights metric" })).toBe("metrica_non_valida");
    expect(classificaErroreMeta({ code: 4, message: "Application request limit reached" })).toBe("limite");
    expect(classificaErroreMeta({ code: 80001 })).toBe("limite");
    expect(classificaErroreMeta(null)).toBe("altro");
    expect(classificaErroreMeta({ message: "HTTP 500" })).toBe("altro");
  });
});

describe("date", () => {
  it("end_time di Pagina → giorno precedente", () => {
    expect(giornoDaEndTime("2026-09-13T07:00:00+0000")).toBe("2026-09-12");
    expect(giornoDaEndTime("non una data")).toBeNull();
  });
  it("giorni da riscrivere", () => {
    expect(giorniDaSincronizzare(undefined, true, 90)).toBe(3);
    expect(giorniDaSincronizzare(undefined, false, 30)).toBe(30);
    expect(giorniDaSincronizzare(90, true, 30)).toBe(30);
    expect(giorniDaSincronizzare(7, false, 90)).toBe(7);
  });
  it("elenco fino a ieri", () => {
    expect(elencoGiorni(3, new Date("2026-09-14T10:00:00Z"))).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
  });
});

describe("lettura risposte Meta", () => {
  it("numero da oggetti e stringhe", () => {
    expect(numero({ like: 3, love: 2 })).toBe(5);
    expect(numero("12")).toBe(12);
    expect(numero(undefined)).toBeNull();
    expect(numero({})).toBeNull();
  });

  it("insights di Pagina per giorno", () => {
    const m = valoriPaginaPerGiorno({
      data: [
        { name: "page_media_view", period: "day", values: [{ value: 40, end_time: "2026-09-12T07:00:00+0000" }, { value: 55, end_time: "2026-09-13T07:00:00+0000" }] },
        { name: "page_total_media_view_unique", period: "day", values: [{ value: 30, end_time: "2026-09-13T07:00:00+0000" }] },
        { name: "page_media_view", period: "week", values: [{ value: 999, end_time: "2026-09-13T07:00:00+0000" }] },
      ],
    });
    expect(m.get("2026-09-11")).toEqual({ page_media_view: 40 });
    expect(m.get("2026-09-12")).toEqual({ page_media_view: 55, page_total_media_view_unique: 30 });
    const g = valoriGiornoFacebook(m.get("2026-09-12")!);
    expect(g.visualizzazioni).toBe(55);
    expect(g.copertura).toBe(30);
    expect(g.follower).toBeNull();
    expect(g.interazioni).toBeNull();
  });

  it("Instagram total_value e follow/unfollow", () => {
    const valori = valoriTotali({
      data: [
        { name: "reach", total_value: { value: 120 } },
        { name: "views", total_value: { value: 300 } },
        { name: "total_interactions", total_value: { value: 18 } },
      ],
    });
    const seguiti = seguitiEPersi({
      data: [{
        name: "follows_and_unfollows",
        total_value: { breakdowns: [{ dimension_keys: ["follow_type"], results: [
          { dimension_values: ["FOLLOWER"], value: 7 },
          { dimension_values: ["NON_FOLLOWER"], value: 2 },
        ] }] },
      }],
    });
    expect(seguiti).toEqual({ nuovi: 7, persi: 2 });
    const g = valoriGiornoInstagram(valori, seguiti);
    expect(g).toMatchObject({ copertura: 120, visualizzazioni: 300, interazioni: 18, nuovi_follower: 7, follower_persi: 2, click_link: null });
    expect(g.metriche.follows).toBe(7);
  });

  it("post Facebook", () => {
    const p = valoriPostFacebook({
      id: "1_2",
      message: "Cantiere finito",
      created_time: "2026-09-10T08:00:00+0000",
      status_type: "added_photos",
      reactions: { summary: { total_count: 10 } },
      comments: { summary: { total_count: 3 } },
      insights: { data: [{ name: "post_total_media_view_unique", values: [{ value: 400 }] }, { name: "post_media_view", values: [{ value: 650 }] }] },
    })!;
    expect(p).toMatchObject({ tipo: "foto", reazioni: 10, commenti: 3, condivisioni: 0, interazioni: 13, copertura: 400, visualizzazioni: 650, clic: null });
    expect(valoriPostFacebook({})).toBeNull();
  });

  it("contenuto Instagram", () => {
    const reel = valoriPostInstagram(
      { id: "9", media_type: "VIDEO", media_product_type: "REELS", like_count: 20, comments_count: 4, thumbnail_url: "t.jpg", media_url: "v.mp4" },
      { reach: 900, views: 1500, total_interactions: 31, saved: 5, shares: 2 },
    )!;
    expect(reel).toMatchObject({ tipo: "reel", immagine_url: "t.jpg", copertura: 900, visualizzazioni: 1500, interazioni: 31, salvataggi: 5 });
    const senzaInsights = valoriPostInstagram({ id: "8", media_type: "CAROUSEL_ALBUM", like_count: 5, comments_count: 1 }, {})!;
    expect(senzaInsights).toMatchObject({ tipo: "carosello", copertura: null, interazioni: 6 });
  });

  it("follower ed esito", () => {
    expect(unisciFollower(null, 120)).toBe(120);
    expect(unisciFollower(130, 120)).toBe(130);
    expect(unisciFollower(null, undefined)).toBeNull();
    expect(esitoAccount({ permesso: true, errore: true, nonDisponibili: ["x"] })).toBe("permesso_mancante");
    expect(esitoAccount({ permesso: false, errore: false, nonDisponibili: ["x"] })).toBe("parziale");
    expect(esitoAccount({ permesso: false, errore: false, nonDisponibili: [] })).toBe("ok");
  });
});

const riga = (giorno: string, v: Partial<RigaStatisticaGiornaliera> = {}): RigaStatisticaGiornaliera => ({
  piattaforma: "facebook",
  account_esterno_id: "p1",
  giorno,
  follower: null,
  nuovi_follower: null,
  follower_persi: null,
  copertura: null,
  visualizzazioni: null,
  interazioni: null,
  visite_profilo: null,
  click_link: null,
  ...v,
});

describe("riepilogo della scheda", () => {
  const adesso = new Date("2026-09-14T10:00:00Z");

  it("periodo chiuso a ieri e periodo precedente", () => {
    expect(intervalloPeriodo(7, adesso)).toEqual({ da: "2026-09-07", a: "2026-09-13", daPrecedente: "2026-08-31", aPrecedente: "2026-09-06" });
  });

  it("somme, crescita, variazione e serie con i buchi", () => {
    const r = riepilogaStatistiche(
      [
        riga("2026-09-01", { copertura: 100, visualizzazioni: 200 }),
        riga("2026-09-08", { copertura: 60, visualizzazioni: 90, interazioni: 5, nuovi_follower: 4, follower_persi: 1 }),
        riga("2026-09-10", { copertura: 90, visualizzazioni: 110, interazioni: 7, nuovi_follower: 2 }),
        riga("2026-09-14", { follower: 1234 }),
      ],
      7,
      null,
      adesso,
    );
    expect(r.follower).toBe(1234);
    expect(r.crescitaFollower).toBe(5);
    expect(r.copertura).toBe(150);
    expect(r.visualizzazioni).toBe(200);
    expect(r.variazioni.copertura).toBe(50);
    expect(r.variazioni.visualizzazioni).toBe(0);
    expect(r.variazioni.interazioni).toBeNull();
    expect(r.visiteProfilo).toBeNull();
    expect(r.serie).toHaveLength(7);
    expect(r.serie[0]).toEqual({ giorno: "2026-09-07", visualizzazioni: null, copertura: null, interazioni: null });
    expect(r.giorniConDati).toBe(2);
  });

  it("crescita dai follower registrati se Meta non dà i nuovi", () => {
    const r = riepilogaStatistiche(
      [riga("2026-09-06", { follower: 100 }), riga("2026-09-10", { follower: 104 }), riga("2026-09-14", { follower: 107 })],
      7,
      110,
      adesso,
    );
    expect(r.follower).toBe(110);
    expect(r.crescitaFollower).toBe(7);
  });

  it("nessun dato = nessun numero", () => {
    const r = riepilogaStatistiche([], 30, null, adesso);
    expect(r.follower).toBeNull();
    expect(r.crescitaFollower).toBeNull();
    expect(r.copertura).toBeNull();
    expect(r.giorniConDati).toBe(0);
  });

  it("variazione percentuale", () => {
    expect(variazionePercentuale(120, 100)).toBe(20);
    expect(variazionePercentuale(120, 0)).toBeNull();
    expect(variazionePercentuale(null, 10)).toBeNull();
  });

  it("migliori post del periodo", () => {
    const post = (id: string, data: string, v: Partial<RigaStatisticaPost>): RigaStatisticaPost => ({
      piattaforma: "instagram", account_esterno_id: "ig", post_id: id, pubblicato_il: data, tipo: null, testo: null,
      permalink: null, immagine_url: null, copertura: null, visualizzazioni: null, reazioni: null, commenti: null,
      condivisioni: null, salvataggi: null, clic: null, interazioni: null, ...v,
    });
    const top = miglioriPost(
      [
        post("vecchio", "2026-08-01T10:00:00Z", { interazioni: 500 }),
        post("a", "2026-09-09T10:00:00Z", { reazioni: 3, commenti: 1 }),
        post("b", "2026-09-12T10:00:00Z", { interazioni: 20 }),
        post("c", "2026-09-14T08:00:00Z", {}),
      ],
      7,
      adesso,
    );
    expect(top.map((p) => p.post_id)).toEqual(["b", "a", "c"]);
  });

  it("etichetta ultimo aggiornamento", () => {
    expect(etichettaUltimaSync(null, adesso)).toBe("mai");
    expect(etichettaUltimaSync("2026-09-14T09:58:00Z", adesso)).toBe("pochi minuti fa");
    expect(etichettaUltimaSync("2026-09-14T07:00:00Z", adesso)).toBe("3 ore fa");
  });
});
