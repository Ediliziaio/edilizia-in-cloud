import { describe, expect, it } from "vitest";

import {
  IG_POLL_DELAY_MS,
  MAX_RETRY_ATTEMPTS,
  checkMediaUrl,
  interpretContainerStatus,
  normalizePostMedia,
  planPostStatus,
  platformAction,
  resolveTargetPage,
  translateMetaError,
} from "../../../supabase/functions/_shared/socialPublishLogic";
import { describePublishResult, validateMetaPublishTargets } from "@/lib/social/publishing";
import { socialPostFromRow, socialPostToInsert } from "@/lib/social/storage";

const igByPage = new Map([
  ["page-a", "ig-a"],
  ["page-b", "ig-b"],
]);

describe("publisher social: pagina di destinazione", () => {
  it("usa l'unica pagina collegata se il post non ne sceglie una", () => {
    const accounts = [{ platform_id: "facebook", page_id: "page-a" }];
    expect(resolveTargetPage("facebook", accounts, {}, igByPage)).toEqual({ pageId: "page-a" });
  });

  it("con più pagine e nessuna scelta si ferma invece di pubblicare a caso", () => {
    const accounts = [
      { platform_id: "facebook", page_id: "page-a" },
      { platform_id: "facebook", page_id: "page-b" },
    ];
    const out = resolveTargetPage("facebook", accounts, null, igByPage);
    expect("error" in out && out.error).toContain("scegli nel post");
  });

  it("rispetta la pagina scelta e rifiuta una pagina non più collegata", () => {
    const accounts = [
      { platform_id: "facebook", page_id: "page-a" },
      { platform_id: "facebook", page_id: "page-b" },
    ];
    expect(resolveTargetPage("facebook", accounts, { facebook: "page-b" }, igByPage)).toEqual({ pageId: "page-b" });
    const gone = resolveTargetPage("facebook", accounts, { facebook: "page-z" }, igByPage);
    expect("error" in gone && gone.error).toContain("non è più collegata");
  });

  it("Instagram: senza righe instagram ripiega sull'unica pagina FB con account IG", () => {
    const accounts = [
      { platform_id: "facebook", page_id: "page-a" },
      { platform_id: "facebook", page_id: "page-senza-ig" },
    ];
    expect(resolveTargetPage("instagram", accounts, {}, igByPage)).toEqual({ pageId: "page-a" });
  });
});

describe("publisher social: file", () => {
  it("rifiuta i data: URL con un motivo chiaro", () => {
    expect(checkMediaUrl("data:image/png;base64,iVBORw0KGgo=")).toContain("ricaricalo dal composer");
    expect(checkMediaUrl("http://example.com/a.jpg")).toContain("https");
    expect(checkMediaUrl("https://cdn.example.com/a.jpg")).toBeNull();
  });

  it("preferisce media a image_url e riconosce i video", () => {
    expect(normalizePostMedia({ image_url: "https://x/a.jpg", content_type: "post" })).toEqual([
      { url: "https://x/a.jpg", type: "image" },
    ]);
    const media = normalizePostMedia({
      image_url: "https://x/cover.jpg",
      content_type: "carosello",
      media: [{ bucket: "social-media", path: "c/2028-09/a.jpg" }, { url: "https://x/b.mp4" }, { url: "" }],
    });
    expect(media.map((m) => m.type)).toEqual(["image", "video"]);
  });
});

describe("publisher social: errori Meta", () => {
  it("permesso mancante → ricollegare e concedere la pubblicazione, senza retry", () => {
    const t = translateMetaError({ code: 200, message: "(#200) Requires pages_manage_posts permission" });
    expect(t.message).toContain("Ricollega Meta e concedi la pubblicazione");
    expect(t.retryable).toBe(false);
    expect(t.reconnect).toBe(true);
  });

  it("token scaduto → ricollegare Meta", () => {
    expect(translateMetaError({ code: 190, error_subcode: 463 }).reconnect).toBe(true);
  });

  it("limiti, errori temporanei e rete si ritentano", () => {
    expect(translateMetaError({ code: 4 }).retryable).toBe(true);
    expect(translateMetaError({ code: 2 }).retryable).toBe(true);
    expect(translateMetaError({ network: true, message: "fetch failed" }).retryable).toBe(true);
    expect(translateMetaError({ http_status: 503 }).retryable).toBe(true);
    expect(translateMetaError({ code: 100, message: "Invalid parameter" }).retryable).toBe(false);
  });

  it("per il primo commento parla di commenti, non di pubblicazione", () => {
    expect(translateMetaError({ code: 10 }, "comment").message).toContain("commenti");
  });
});

describe("publisher social: stato del post dopo un giro", () => {
  const now = Date.parse("2028-09-16T10:00:00.000Z");

  it("contenitore Instagram in elaborazione → processing, ricontrollo tra un minuto", () => {
    const plan = planPostStatus(
      ["facebook", "instagram"],
      { facebook: { ok: true, id: "1" }, instagram: { ok: false, pending: true, creation_id: "c" } },
      "scheduled",
      now,
    );
    expect(plan.status).toBe("processing");
    expect(plan.nextAttemptAt).toBe(new Date(now + IG_POLL_DELAY_MS).toISOString());
  });

  it("errore temporaneo con tentativi rimasti → processing; esauriti → failed", () => {
    expect(planPostStatus(["facebook"], { facebook: { ok: false, retryable: true, attempts: 1 } }, "scheduled", now).status)
      .toBe("processing");
    expect(planPostStatus(["facebook"], { facebook: { ok: false, retryable: true, attempts: MAX_RETRY_ATTEMPTS } }, "scheduled", now).status)
      .toBe("failed");
  });

  it("una piattaforma uscita basta per published", () => {
    expect(planPostStatus(
      ["facebook", "instagram"],
      { facebook: { ok: true }, instagram: { ok: false, error: "x" } },
      "processing",
      now,
    ).status).toBe("published");
  });

  it("nei giri successivi non ripubblica ciò che è già uscito né ciò che è fallito per sempre", () => {
    expect(platformAction({ ok: true })).toBe("keep");
    expect(platformAction({ ok: false, error: "permesso" })).toBe("keep");
    expect(platformAction({ ok: false, pending: true })).toBe("run");
    expect(platformAction({ ok: false, retryable: true, attempts: 1, retry_at: new Date(now + 60_000).toISOString() }, now)).toBe("keep");
    expect(platformAction({ ok: false, retryable: true, attempts: 1, retry_at: new Date(now - 1).toISOString() }, now)).toBe("run");
  });

  it("legge gli status_code del contenitore", () => {
    expect(interpretContainerStatus("FINISHED")).toBe("ready");
    expect(interpretContainerStatus("IN_PROGRESS")).toBe("wait");
    expect(interpretContainerStatus("EXPIRED")).toBe("error");
    expect(interpretContainerStatus("PUBLISHED")).toBe("published");
  });
});

describe("composer social: controlli prima di salvare", () => {
  const accounts = [
    { platform_id: "facebook", page_id: "page-a" },
    { platform_id: "facebook", page_id: "page-b" },
    { platform_id: "instagram", page_id: "page-a" },
  ];

  it("chiede la pagina Facebook quando ce n'è più d'una", () => {
    const errors = validateMetaPublishTargets({
      selectedPlatforms: ["facebook", "instagram"],
      contentType: "post",
      accounts,
      targetPageIds: {},
      media: [{ url: "https://x/a.jpg", type: "image" }],
    });
    expect(errors).toEqual(["Scegli su quale pagina Facebook pubblicare."]);
  });

  it("carosello: almeno 2 file, e su Facebook niente video", () => {
    const errors = validateMetaPublishTargets({
      selectedPlatforms: ["facebook"],
      contentType: "carosello",
      accounts,
      targetPageIds: { facebook: "page-a" },
      media: [{ url: "https://x/a.mp4", type: "video" }],
    });
    expect(errors).toEqual(expect.arrayContaining([
      "Il carosello richiede almeno 2 file.",
      "Su Facebook il carosello accetta solo immagini.",
    ]));
  });

  it("il Reel senza video non si programma", () => {
    expect(validateMetaPublishTargets({
      selectedPlatforms: ["instagram"],
      contentType: "reel",
      accounts,
      targetPageIds: {},
      media: [{ url: "https://x/a.jpg", type: "image" }],
    })).toContain("Il Reel richiede un video (MP4 o MOV).");
  });

  it("descrive l'esito del publisher in righe leggibili", () => {
    expect(describePublishResult({
      facebook: { ok: true, warnings: ["Primo commento non pubblicato: permesso"] },
      instagram: { ok: false, pending: true },
    })).toEqual([
      { tone: "warning", text: "Facebook: Primo commento non pubblicato: permesso" },
      { tone: "info", text: "Instagram: in elaborazione, esce appena Meta ha finito." },
    ]);
  });
});

describe("social_posts: colonne nuove retrocompatibili", () => {
  const basePost = {
    id: "p1",
    platforms: ["facebook"],
    contentType: "post",
    text: "Ciao",
    hashtags: [] as string[],
    scheduled_at: "2028-09-16T10:00:00.000Z",
    status: "scheduled" as const,
    created_at: "2028-09-16T09:00:00.000Z",
  };

  it("un post a immagine singola senza scelta pagina non tocca le colonne nuove", () => {
    const insert = socialPostToInsert("c1", { ...basePost, image_url: "https://x/a.jpg", media: [{ url: "https://x/a.jpg", type: "image" }] });
    expect(insert).not.toHaveProperty("media");
    expect(insert).not.toHaveProperty("target_page_ids");
  });

  it("carosello e pagina scelta finiscono nelle colonne nuove, senza data: URL", () => {
    const insert = socialPostToInsert("c1", {
      ...basePost,
      targetPageIds: { facebook: "page-b" },
      media: [
        { bucket: "social-media", path: "c1/2028-09/a.jpg", url: "https://signed/a", type: "image" },
        { url: "data:image/png;base64,iVBORw0KGgo=", type: "image" },
      ],
    });
    expect(insert).toMatchObject({ target_page_ids: { facebook: "page-b" } });
    expect((insert as { media?: Array<{ url: string | null }> }).media?.[1].url).toBeNull();
  });

  it("legge lo stato processing e l'esito del publisher", () => {
    const post = socialPostFromRow({
      id: "p1",
      status: "processing",
      platforms: ["instagram"],
      target_page_ids: { instagram: "page-a" },
      publish_result: { instagram: { ok: false, pending: true } },
    });
    expect(post.status).toBe("processing");
    expect(post.targetPageIds).toEqual({ instagram: "page-a" });
    expect(post.publishResult?.instagram?.pending).toBe(true);
  });
});
