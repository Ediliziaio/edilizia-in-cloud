import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseSocialBulkCsv,
  SOCIAL_LIVE_PUBLISHING_ENABLED,
  validateSocialDraft,
  type SocialPlatformRule,
} from "@/lib/social/publishing";

const rules: SocialPlatformRule[] = [
  {
    id: "facebook",
    name: "Facebook",
    maxChars: 63206,
    hashtagsMax: 10,
    contentTypes: ["post", "story", "reel", "carosello"],
    schedulingSupport: "native",
    videoOnly: false,
  },
  {
    id: "instagram",
    name: "Instagram",
    maxChars: 2200,
    hashtagsMax: 30,
    contentTypes: ["post", "story", "reel", "carosello"],
    schedulingSupport: "native",
    videoOnly: false,
    minScheduleDelayMinutes: 10,
    maxScheduleDays: 75,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    maxChars: 3000,
    hashtagsMax: 5,
    contentTypes: ["post", "carosello", "video"],
    schedulingSupport: "draft_only",
    videoOnly: false,
  },
  {
    id: "youtube",
    name: "YouTube",
    maxChars: 5000,
    hashtagsMax: 15,
    contentTypes: ["video"],
    schedulingSupport: "video_only",
    videoOnly: true,
  },
];

describe("social publishing safety", () => {
  it("does not allow live publish when no selected platform is connected", () => {
    const result = validateSocialDraft(
      {
        selectedPlatforms: ["facebook", "instagram"],
        connectedPlatformIds: [],
        contentType: "post",
        fallbackText: "Post di prova",
        textByPlatform: {},
        hashtags: ["#cantiere"],
        mediaUrl: "https://example.com/image.jpg",
        publishNow: true,
        scheduledAt: new Date("2026-05-23T09:00:00.000Z"),
        now: new Date("2026-05-23T08:00:00.000Z"),
        livePublishingEnabled: true,
      },
      rules,
    );

    expect(result.canPublishLive).toBe(false);
    expect(result.canSaveDraft).toBe(true);
    expect(result.errors).toContain("Collega almeno una piattaforma reale prima di pubblicare o programmare.");
    expect(result.demoSelectedPlatforms).toEqual(["facebook", "instagram"]);
  });

  it("blocks platform limit violations before saving a publishable post", () => {
    const result = validateSocialDraft(
      {
        selectedPlatforms: ["linkedin", "youtube"],
        connectedPlatformIds: ["linkedin", "youtube"],
        contentType: "video",
        fallbackText: "A".repeat(3200),
        textByPlatform: {},
        hashtags: ["#uno", "#due", "#tre", "#quattro", "#cinque", "#sei"],
        mediaUrl: "",
        publishNow: false,
        scheduledAt: new Date("2026-05-23T10:00:00.000Z"),
        now: new Date("2026-05-23T08:00:00.000Z"),
        livePublishingEnabled: true,
      },
      rules,
    );

    expect(result.canPublishLive).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "LinkedIn supera il limite testo di 3000 caratteri.",
        "LinkedIn permette al massimo 5 hashtag.",
        "YouTube richiede un file video prima della pubblicazione.",
      ]),
    );
    expect(result.warnings).toContain("LinkedIn non supporta scheduling nativo: salva come bozza e pubblica dal reminder.");
  });

  it("marks invalid CSV dates as row errors instead of throwing", () => {
    expect(() =>
      parseSocialBulkCsv(
        "piattaforme,testo,hashtag,data_ora,immagine_url\ninstagram,\"Post con data errata\",#test,not-a-date,",
        rules,
      ),
    ).not.toThrow();

    const [row] = parseSocialBulkCsv(
      "piattaforme,testo,hashtag,data_ora,immagine_url\ninstagram,\"Post con data errata\",#test,not-a-date,",
      rules,
      new Date("2026-05-23T08:00:00.000Z"),
    );

    expect(row.status).toBe("error");
    expect(row.errorMsg).toBe("Data non valida (formato: YYYY-MM-DDTHH:MM)");
    expect(row.scheduled_at).toBe("2026-05-24T08:00:00.000Z");
  });

  it("keeps live publishing explicitly disabled until a backend publisher exists", () => {
    expect(SOCIAL_LIVE_PUBLISHING_ENABLED).toBe(false);
  });

  it("keeps the social manager honest about local/demo-only surfaces", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/azienda/marketing/SocialManagerBeta.tsx"),
      "utf8",
    );

    expect(source).toContain("Publisher live non attivo");
    expect(source).toContain("Salva bozza locale");
    expect(source).toContain("Galleria demo");
    expect(source).toContain("Inbox demo locale");
    expect(source).toContain("Grid planner dimostrativo");
    expect(source).toContain("/azienda/marketing/pubblicita?tab=creativita");
    expect(source).not.toContain("Visibile sulle tue pagine.");
  });
});
