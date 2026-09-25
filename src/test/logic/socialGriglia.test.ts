/**
 * Griglia Instagram: il profilo vero, nell'ordine del cliente (25/09/2026).
 *
 * Prima: i programmati stavano SOTTO i pubblicati (su Instagram il più nuovo
 * è in alto a sinistra), le storie entravano nel profilo, un post uscito solo
 * su Facebook finiva nella griglia di Instagram, gli account si mischiavano.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  accountInstagramDelPost,
  costruisciGriglia,
  formatoDaTipo,
  immagineDelPost,
  numeroIntero,
  scambiabile,
  type PostInstagramReale,
} from "@/lib/social/griglia";
import type { SocialScheduledPost } from "@/lib/social/types";

const ADESSO = Date.parse("2026-09-25T10:00:00Z");
const BEMADE = "107319265374665";

const post = (id: string, extra: Partial<SocialScheduledPost>): SocialScheduledPost => ({
  id,
  platforms: ["instagram"],
  contentType: "post",
  text: `Post ${id}`,
  hashtags: [],
  scheduled_at: "2026-09-28T09:00:00Z",
  status: "scheduled",
  created_at: "2026-09-20T08:00:00Z",
  ...extra,
});

const reale = (postId: string, quando: string, extra: Partial<PostInstagramReale> = {}): PostInstagramReale => ({
  postId,
  pageId: BEMADE,
  quando,
  formato: "foto",
  testo: `Reale ${postId}`,
  link: `https://www.instagram.com/p/${postId}/`,
  immagine: `https://scontent.cdninstagram.com/${postId}.jpg`,
  numeri: { reazioni: 10, commenti: 0, copertura: 1630, salvataggi: 1, visualizzazioni: null },
  sincronizzatoIl: "2026-09-25T04:14:00Z",
  ...extra,
});

const griglia = (posts: SocialScheduledPost[], reali: PostInstagramReale[] = [], mostraBozze = false, accountIds = [BEMADE]) =>
  costruisciGriglia({ posts, reali, pageId: BEMADE, accountIds, mostraBozze, adesso: ADESSO });

describe("l'ordine è quello di Instagram", () => {
  it("in alto i non ancora usciti, il più lontano per primo; poi i già pubblicati, dal più nuovo", () => {
    const { celle } = griglia(
      [
        post("vicino", { scheduled_at: "2026-09-26T09:00:00Z" }),
        post("lontano", { scheduled_at: "2026-10-02T09:00:00Z" }),
        post("attesa", { status: "review", scheduled_at: "2026-09-29T11:00:00Z" }),
      ],
      [reale("r-vecchio", "2026-08-21T08:00:00Z"), reale("r-nuovo", "2026-09-10T12:00:00Z")],
    );
    expect(celle.map((c) => c.id)).toEqual(["lontano", "attesa", "vicino", "ig-r-nuovo", "ig-r-vecchio"]);
    expect(celle[1].tipo === "app" && celle[1].info.etichetta).toBe("Da approvare");
  });

  it("le storie e i post solo Facebook non entrano nel profilo", () => {
    const { celle } = griglia([
      post("storia", { contentType: "story" }),
      post("facebook", { platforms: ["facebook"] }),
      post("ok", {}),
    ]);
    expect(celle.map((c) => c.id)).toEqual(["ok"]);
  });

  it("uscito solo su Facebook non è su Instagram; uscito su Instagram sì, una volta sola", () => {
    const { celle } = griglia(
      [
        post("solo-fb", { status: "published", platforms: ["facebook", "instagram"], publishResult: { facebook: { ok: true }, instagram: { ok: false, error: "JPEG" } } }),
        post("uscito", { status: "published", scheduled_at: "2026-09-24T09:00:00Z", publishResult: { instagram: { ok: true, id: "IG1" } } }),
        post("uscito-oggi", { status: "published", scheduled_at: "2026-09-25T08:00:00Z", publishResult: { instagram: { ok: true, id: "IG2" } } }),
      ],
      [reale("IG1", "2026-09-24T09:00:10Z")],
    );
    // IG1 c'è già tra i letti da Instagram (con i numeri); IG2 non ancora letto: resta quello dell'app.
    expect(celle.map((c) => c.id)).toEqual(["uscito-oggi", "ig-IG1"]);
  });

  it("le bozze solo a richiesta: senza data in cima", () => {
    const posts = [post("bozza", { status: "draft", scheduled_at: "" }), post("prog", {})];
    expect(griglia(posts).celle.map((c) => c.id)).toEqual(["prog"]);
    expect(griglia(posts, [], true).celle.map((c) => c.id)).toEqual(["bozza", "prog"]);
  });
});

describe("ogni account ha la sua griglia", () => {
  it("il post va sull'account scelto; con un solo account, su quello", () => {
    expect(accountInstagramDelPost({ targetPageIds: { instagram: "A" } }, ["A", "B"])).toBe("A");
    expect(accountInstagramDelPost({}, ["A"])).toBe("A");
    expect(accountInstagramDelPost({}, ["A", "B"])).toBeNull();
    expect(accountInstagramDelPost({ targetPageIds: { instagram: "Z" } }, ["A", "B"])).toBeNull();
  });

  it("con due account e nessuna scelta il post non finisce a caso: si conta e si dice", () => {
    const esito = costruisciGriglia({
      posts: [post("senza", {}), post("su-a", { targetPageIds: { instagram: "A" } }), post("su-b", { targetPageIds: { instagram: "B" } })],
      reali: [],
      pageId: "A",
      accountIds: ["A", "B"],
      mostraBozze: false,
      adesso: ADESSO,
    });
    expect(esito.celle.map((c) => c.id)).toEqual(["su-a"]);
    expect(esito.senzaAccount).toBe(1);
  });
});

describe("foto, formato, scambio", () => {
  it("mai l'indirizzo di un video al posto della foto", () => {
    expect(immagineDelPost({ contentType: "reel", media: [{ url: "https://x/v.mp4", type: "video" }] })).toBeNull();
    expect(immagineDelPost({ contentType: "reel", image_url: "https://x/v.mp4" })).toBeNull();
    expect(immagineDelPost({ contentType: "carosello", media: [{ url: "https://x/v.mp4", type: "video" }, { url: "https://x/f.jpg", type: "image" }] })).toBe("https://x/f.jpg");
    expect(immagineDelPost({ contentType: "post", image_url: "https://x/f.jpg" })).toBe("https://x/f.jpg");
    expect(formatoDaTipo("CAROUSEL_ALBUM")).toBe("carosello");
    expect(formatoDaTipo("reel")).toBe("reel");
    expect(formatoDaTipo(null)).toBe("foto");
  });

  it("si scambiano solo post non usciti con la data ad almeno 5 minuti", () => {
    const [futuro, vicino, uscito] = griglia([
      post("futuro", { scheduled_at: "2026-09-28T09:00:00Z" }),
      post("vicino", { scheduled_at: "2026-09-25T10:03:00Z" }),
      post("uscito", { status: "published", scheduled_at: "2026-09-20T09:00:00Z" }),
    ]).celle;
    expect(scambiabile(futuro, ADESSO)).toBe(true);
    expect(scambiabile(vicino, ADESSO)).toBe(false);
    expect(scambiabile(uscito, ADESSO)).toBe(false);
    expect(numeroIntero(15137)).toBe("15.137");
    expect(numeroIntero(null)).toBe("—");
  });
});

describe("la pagina e il database", () => {
  const pagina = readFileSync(resolve(process.cwd(), "src/pages/azienda/marketing/SocialManagerBeta.tsx"), "utf8");
  const migrazione = (() => {
    const cartella = resolve(process.cwd(), "supabase/migrations");
    const nome = readdirSync(cartella).find((f) => f.endsWith("_social_griglia_argomento_e_scambio.sql"));
    return nome ? readFileSync(resolve(cartella, nome), "utf8") : "";
  })();

  it("niente più profilo finto né argomento indovinato", () => {
    expect(pagina).not.toContain("tuaimpresaedile");
    expect(pagina).not.toContain("2.4K");
    expect(pagina).not.toContain("getCellPillar");
    expect(pagina).not.toContain("PILLAR_KEYWORDS");
    expect(pagina).toContain("aspect-[3/4]");
    expect(pagina).toContain("usePostInstagramReali(companyId)");
  });

  it("l'argomento si salva, e lo scambio è una transazione che rispetta le policy", () => {
    expect(pagina).toContain("argomento: activePillarId ?? undefined,");
    expect(migrazione).toContain("ADD COLUMN IF NOT EXISTS argomento text");
    expect(migrazione).toContain("social_posts_argomento_check");
    expect(migrazione).toContain("SECURITY INVOKER");
    expect(migrazione).toContain("FOR UPDATE");
    expect(migrazione).toContain("now() + interval '5 minutes'");
    expect(migrazione).toContain("REVOKE ALL ON FUNCTION public.scambia_orari_post_social(uuid, uuid) FROM PUBLIC, anon;");
  });
});
