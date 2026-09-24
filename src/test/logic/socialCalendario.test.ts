/**
 * Calendario social: stati veri, azioni, orari, approvazioni (24/09/2026).
 *
 * Prima: un post mai uscito restava «Programmato», uno uscito su Facebook e
 * non su Instagram era «Pubblicato», la settimana nascondeva i post prima
 * delle 8 e dopo le 21, le bozze stavano su «domani», chiunque approvava.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  azioniPost,
  contaPerGruppo,
  dataPerNuovoPost,
  destinazioniPronte,
  fasceOrarie,
  postEsterniNuovi,
  RITARDO_DOPO_MS,
  statoCalendario,
  type PostEsterno,
} from "@/lib/social/calendario";
import { leggiStatoPubblicazione } from "@/lib/social/statoPubblicazione";
import { socialPostChangesToPatch, socialPostFromRow, socialPostToInsert } from "@/lib/social/storage";
import type { SocialScheduledPost } from "@/lib/social/types";

const ADESSO = new Date("2026-09-24T17:44:00+02:00").getTime();

const post = (extra: Partial<SocialScheduledPost>): SocialScheduledPost => ({
  id: "p",
  platforms: ["facebook", "instagram"],
  contentType: "post",
  text: "Finestre posate a Monza",
  hashtags: [],
  scheduled_at: new Date(ADESSO + 3_600_000).toISOString(),
  status: "scheduled",
  created_at: "2026-09-20T08:00:00Z",
  ...extra,
});

describe("lo stato che vede la persona", () => {
  it("un programmato passato da più di un quarto d'ora è in ritardo", () => {
    expect(statoCalendario(post({ scheduled_at: new Date(ADESSO - RITARDO_DOPO_MS - 60_000).toISOString() }), ADESSO).stato).toBe("in_ritardo");
    expect(statoCalendario(post({ scheduled_at: new Date(ADESSO - 5 * 60_000).toISOString() }), ADESSO).stato).toBe("programmato");
    expect(statoCalendario(post({}), ADESSO)).toEqual({ stato: "programmato", etichetta: "Programmato", problema: false });
  });

  it("uscito su Facebook ma non su Instagram è «Uscito in parte», e un problema", () => {
    const parziale = post({
      status: "published",
      publishResult: { facebook: { ok: true, id: "1_2" }, instagram: { ok: false, error: "JPEG non valido" } },
    });
    expect(statoCalendario(parziale, ADESSO)).toEqual({ stato: "uscito_in_parte", etichetta: "Uscito in parte", problema: true });
    const inCorso = post({ status: "published", publishResult: { facebook: { ok: true }, instagram: { ok: false, pending: true } } });
    expect(statoCalendario(inCorso, ADESSO).stato).toBe("pubblicato");
  });

  it("fallito, bozza, da approvare, in pubblicazione", () => {
    expect(statoCalendario(post({ status: "failed" }), ADESSO).etichetta).toBe("Non uscito");
    expect(statoCalendario(post({ status: "draft", scheduled_at: "" }), ADESSO).stato).toBe("bozza");
    expect(statoCalendario(post({ status: "review" }), ADESSO).etichetta).toBe("Da approvare");
    expect(statoCalendario(post({ status: "processing" }), ADESSO).stato).toBe("in_pubblicazione");
  });

  it("i contatori: le bozze non contano, i problemi finiscono in «Da sistemare»", () => {
    const conti = contaPerGruppo([
      post({}),
      post({ status: "processing" }),
      post({ status: "review" }),
      post({ status: "published" }),
      post({ status: "failed" }),
      post({ scheduled_at: new Date(ADESSO - 3_600_000).toISOString() }),
      post({ status: "draft", scheduled_at: "" }),
    ], ADESSO);
    expect(conti).toEqual({ programmati: 2, da_approvare: 1, pubblicati: 1, da_sistemare: 2 });
  });
});

describe("la settimana e i post nuovi", () => {
  it("le ore si allargano ai post: 7:00 e 21:30 si vedono", () => {
    expect(fasceOrarie([])).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const ore = fasceOrarie([7, 21, 9]);
    expect(ore[0]).toBe(7);
    expect(ore[ore.length - 1]).toBe(21);
  });

  it("un post nuovo dal calendario: domani alle 9, oggi la prossima ora utile, mai nel passato", () => {
    // Date locali: il calendario ragiona nell'ora di chi lo guarda, qualunque sia il fuso della CI.
    const adesso = new Date(2026, 8, 24, 17, 44);
    expect(dataPerNuovoPost(new Date(2026, 8, 25), null, adesso)).toEqual({ data: "2026-09-25", ora: "09:00" });
    expect(dataPerNuovoPost(new Date(2026, 8, 24), null, adesso)).toEqual({ data: "2026-09-24", ora: "19:00" });
    expect(dataPerNuovoPost(new Date(2026, 8, 23), null, adesso)).toBeNull();
    expect(dataPerNuovoPost(new Date(2026, 8, 24), 17, adesso)).toBeNull();
    expect(dataPerNuovoPost(new Date(2026, 8, 24), 21, adesso)).toEqual({ data: "2026-09-24", ora: "21:00" });
    expect(dataPerNuovoPost(new Date(2026, 8, 24), null, new Date(2026, 8, 24, 23, 40))).toBeNull();
  });
});

describe("le azioni sul post", () => {
  it("approva e rimanda solo chi può approvare", () => {
    expect(azioniPost(post({ status: "review" }), { puoApprovare: false, adesso: ADESSO })).not.toContain("approva");
    expect(azioniPost(post({ status: "review" }), { puoApprovare: true, adesso: ADESSO }).slice(0, 2)).toEqual(["approva", "rimanda"]);
  });

  it("in ritardo si pubblica subito; fallito e uscito in parte si riprovano; il pubblicato si duplica", () => {
    const ritardo = post({ scheduled_at: new Date(ADESSO - 3_600_000).toISOString() });
    expect(azioniPost(ritardo, { puoApprovare: false, adesso: ADESSO })[0]).toBe("pubblica_ora");
    expect(azioniPost(post({ status: "failed" }), { puoApprovare: false, adesso: ADESSO })[0]).toBe("riprova");
    const parziale = post({ status: "published", publishResult: { instagram: { ok: false, error: "x" } } });
    expect(azioniPost(parziale, { puoApprovare: false, adesso: ADESSO })).toEqual(["riprova", "duplica", "elimina"]);
    expect(azioniPost(post({ status: "published" }), { puoApprovare: false, adesso: ADESSO })).toEqual(["duplica", "elimina"]);
    expect(azioniPost(post({ status: "processing" }), { puoApprovare: true, adesso: ADESSO })).toEqual(["duplica"]);
  });
});

describe("dove può uscire un post adesso", () => {
  const stato = leggiStatoPubblicazione({
    modalita_post: "revisione",
    integrazione: { id: "i", stato: "connected", scaduta: false, permessi_noti: true },
    pagine: [
      { id: "a", nome: "Bemade.", motivo: "ok", page_id: "107", piattaforma: "facebook", puo_pubblicare: true },
      { id: "b", nome: "bemade.salotti", motivo: "in_approvazione_meta", page_id: "107", piattaforma: "instagram", puo_pubblicare: false },
    ],
  });

  it("solo le piattaforme pronte, con la pagina esplicita, e dice cosa ha tolto", () => {
    expect(destinazioniPronte(post({ platforms: ["facebook", "instagram", "linkedin"] }), stato)).toEqual({
      platforms: ["facebook"],
      targetPageIds: { facebook: "107" },
      tolte: ["instagram", "linkedin"],
    });
  });

  it("se nessuna è pronta, il motivo vero", () => {
    const esito = destinazioniPronte(post({ platforms: ["instagram"] }), stato);
    expect("errore" in esito && esito.errore).toContain("in attesa dell'approvazione di Meta");
    const linkedin = destinazioniPronte(post({ platforms: ["linkedin"] }), stato);
    expect("errore" in linkedin && linkedin.errore).toContain("LinkedIn non è collegato");
    expect("errore" in destinazioniPronte(post({}), null)).toBe(true);
  });

  it("con due pagine pronte si sceglie, non si indovina", () => {
    const due = leggiStatoPubblicazione({
      pagine: [
        { id: "a", nome: "Edilizia in Cloud", motivo: "ok", page_id: "1", piattaforma: "facebook", puo_pubblicare: true },
        { id: "b", nome: "Flo", motivo: "ok", page_id: "2", piattaforma: "facebook", puo_pubblicare: true },
      ],
    });
    expect("errore" in destinazioniPronte(post({ platforms: ["facebook"] }), due)).toBe(true);
    expect(destinazioniPronte(post({ platforms: ["facebook"], targetPageIds: { facebook: "2" } }), due))
      .toMatchObject({ targetPageIds: { facebook: "2" } });
  });
});

describe("i post di Facebook fatti fuori dall'app", () => {
  it("non si mostrano due volte quelli pubblicati dall'app", () => {
    const app = [post({
      status: "published",
      text: "Finestre posate a Monza, prima e dopo",
      scheduled_at: "2026-09-02T07:00:00Z",
      publishResult: { facebook: { ok: true, id: "999" } },
    })];
    const esterni: PostEsterno[] = [
      { id: "107_999", pageId: "107", pagina: "Bemade.", testo: "altro", quando: "2026-09-02T07:00:05Z", link: null, immagine: null },
      { id: "107_555", pageId: "107", pagina: "Bemade.", testo: "Finestre posate a Monza, prima e dopo", quando: "2026-09-02T07:30:00Z", link: null, immagine: null },
      { id: "107_777", pageId: "107", pagina: "Bemade.", testo: "Serata porte aperte", quando: "2026-09-10T18:00:00Z", link: null, immagine: null },
    ];
    expect(postEsterniNuovi(esterni, app).map((e) => e.id)).toEqual(["107_777"]);
  });
});

describe("le bozze senza data restano senza data", () => {
  it("nel database vanno a null, e tornano vuote", () => {
    expect(socialPostToInsert("azienda", post({ status: "draft", scheduled_at: "" })).scheduled_at).toBeNull();
    expect(socialPostChangesToPatch({ scheduled_at: "" }).scheduled_at).toBeNull();
    expect(socialPostFromRow({ id: "x", status: "draft", scheduled_at: null, created_at: "2026-09-24T10:00:00Z" }).scheduled_at).toBe("");
    // Un programmato senza data (dati vecchi) resta leggibile: prende la creazione.
    expect(socialPostFromRow({ id: "y", status: "scheduled", scheduled_at: null, created_at: "2026-09-24T10:00:00Z" }).scheduled_at)
      .toBe("2026-09-24T10:00:00Z");
    expect(socialPostFromRow({ id: "z", status: "review", created_by: "u1", approvato_da: "u2", approvato_il: "2026-09-24T11:00:00Z" }))
      .toMatchObject({ createdBy: "u1", approvatoDa: "u2", approvatoIl: "2026-09-24T11:00:00Z" });
  });
});

describe("lato server", () => {
  const migrazione = (() => {
    const cartella = resolve(process.cwd(), "supabase/migrations");
    const nome = readdirSync(cartella).find((f) => f.endsWith("_calendario_social_approvazioni.sql"));
    return nome ? readFileSync(resolve(cartella, nome), "utf8") : "";
  })();

  it("approva solo titolare, amministratore o super admin, e il database lo impone", () => {
    expect(migrazione).toContain("CREATE OR REPLACE FUNCTION public.puo_approvare_post_social(p_company_id uuid)");
    expect(migrazione).toContain("c.titolare_user_id = (SELECT auth.uid())");
    expect(migrazione).toContain("'company_admin'::public.app_role");
    expect(migrazione).toContain("m.access_role = 'company_admin'");
    expect(migrazione).toContain("REVOKE ALL ON FUNCTION public.puo_approvare_post_social(uuid) FROM PUBLIC, anon;");
    expect(migrazione).toContain("BEFORE UPDATE OF status ON public.social_posts");
    expect(migrazione).toContain("Solo il titolare o un amministratore può approvare o rimandare un post.");
    expect(migrazione).toContain("NEW.approvato_da := (SELECT auth.uid());");
  });

  it("gli avvisi: agli amministratori il post da approvare, all'autore l'esito con la nota", () => {
    expect(migrazione).toContain("'social_post_da_approvare'");
    expect(migrazione).toContain("'social_post_approvato'");
    expect(migrazione).toContain("'social_post_rimandato'");
    expect(migrazione).toContain("coalesce(nullif(trim(NEW.review_note), ''), 'Rimandato in bozza.')");
    // Un avviso che non parte non ferma il salvataggio.
    expect(migrazione.match(/EXCEPTION WHEN others THEN\s+RAISE WARNING/g)?.length).toBe(2);
  });

  it("social-publish: un post da approvare lo pubblica solo chi approva; «Riprova» solo dove è fallito", () => {
    const funzione = leggi("supabase/functions/social-publish/index.ts");
    expect(funzione).toContain('userClient.rpc("puo_approvare_post_social", { p_company_id: companyId })');
    expect(funzione).toContain("const riprova = body?.riprova === true;");
    expect(funzione).toContain('esito?.ok === true');
    expect(funzione).toContain('status: "processing",');
  });

  it("meta-api-proxy legge i post della pagina per periodo", () => {
    const proxy = leggi("supabase/functions/meta-api-proxy/index.ts");
    const blocco = proxy.slice(proxy.indexOf('case "get-page-posts"'), proxy.indexOf('case "sincronizza-statistiche-social"'));
    expect(blocco).toContain("const da = secondi(body.since);");
    expect(blocco).toContain("Math.min(Math.max(Number(body.limit) || 10, 1), 100)");
    expect(blocco).toContain("&since=${da}");
  });
});

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}
