/**
 * Test della logica condivisa di generazione grafiche (brandCreativeRules).
 *
 * Il modulo vive in supabase/functions/_shared perché lo usano le edge
 * function, ma è TypeScript puro senza import Deno: si testa da qui.
 *
 * Copre i due bug di fatturazione trovati nell'audit creatività del 01/08:
 *  - la qualità "hd" che veniva addebitata senza essere applicata;
 *  - il formato 9:16 che non è generabile nativamente e va ritagliato.
 */
import { describe, it, expect } from "vitest";
import {
  aspectToOpenAiSize,
  buildBrandedImagePrompt,
  costoImmagineUsd,
  costoImmagineCentesimiEur,
  cropCoverBox,
  isHexColor,
  messaggioQuotaSuperata,
  qualityPerModello,
  quotaCreativitaSuperata,
  richiedeRitaglio,
  SOCIAL_TARGET_SIZE,
  type CreativeAspect,
} from "../../../../supabase/functions/_shared/brandCreativeRules";

describe("aspectToOpenAiSize", () => {
  it("usa solo size accettate da gpt-image-1", () => {
    const valide = new Set(["1024x1024", "1024x1536", "1536x1024"]);
    for (const ar of ["1:1", "4:5", "9:16", "16:9"] as CreativeAspect[]) {
      expect(valide.has(aspectToOpenAiSize(ar))).toBe(true);
    }
  });

  it("ripiega sul quadrato per valori sconosciuti o mancanti", () => {
    expect(aspectToOpenAiSize(undefined)).toBe("1024x1024");
    expect(aspectToOpenAiSize("21:9")).toBe("1024x1024");
  });
});

describe("richiedeRitaglio", () => {
  it("segnala il ritaglio per 9:16 (1024x1536 non è 9:16)", () => {
    expect(richiedeRitaglio("9:16")).toBe(true);
  });

  it("non chiede ritaglio per il quadrato", () => {
    expect(richiedeRitaglio("1:1")).toBe(false);
  });

  it("segnala il ritaglio per 16:9 (1536x1024 è 3:2)", () => {
    expect(richiedeRitaglio("16:9")).toBe(true);
  });
});

describe("cropCoverBox", () => {
  it("da 2:3 a 9:16 taglia sui lati e restituisce proporzioni esatte", () => {
    // 1024x1536 (2:3 = 0.667) → 1080x1920 (9:16 = 0.5625): il target è più
    // STRETTO, quindi si tagliano i lati e l'altezza resta piena.
    const box = cropCoverBox({ w: 1024, h: 1536 }, SOCIAL_TARGET_SIZE["9:16"]);
    expect(box.sh).toBe(1536); // altezza piena
    expect(box.sw).toBeLessThan(1024); // larghezza ridotta
    expect(box.sy).toBe(0);
    expect(box.sx).toBeGreaterThan(0); // centrato sui lati
    // la finestra ritagliata deve avere ESATTAMENTE le proporzioni del target
    expect(box.sw / box.sh).toBeCloseTo(1080 / 1920, 3);
  });

  it("da 3:2 a 16:9 taglia sopra e sotto", () => {
    // 1536x1024 (1.5) → 1200x628 (1.91): il target è più largo, si taglia in altezza
    const box = cropCoverBox({ w: 1536, h: 1024 }, SOCIAL_TARGET_SIZE["16:9"]);
    expect(box.sw).toBe(1536); // larghezza piena
    expect(box.sh).toBeLessThan(1024); // altezza ridotta
    expect(box.sw / box.sh).toBeCloseTo(1200 / 628, 2);
  });

  it("mantiene il centro dell'immagine", () => {
    const src = { w: 1000, h: 1000 };
    const box = cropCoverBox(src, { w: 100, h: 200 });
    // il ritaglio deve essere simmetrico rispetto al centro
    expect(box.sx + box.sw / 2).toBeCloseTo(src.w / 2, 0);
    expect(box.sy + box.sh / 2).toBeCloseTo(src.h / 2, 0);
  });

  it("non esce mai dai bordi della sorgente", () => {
    for (const target of Object.values(SOCIAL_TARGET_SIZE)) {
      const src = { w: 1024, h: 1536 };
      const box = cropCoverBox(src, target);
      expect(box.sx).toBeGreaterThanOrEqual(0);
      expect(box.sy).toBeGreaterThanOrEqual(0);
      expect(box.sx + box.sw).toBeLessThanOrEqual(src.w);
      expect(box.sy + box.sh).toBeLessThanOrEqual(src.h);
    }
  });

  it("non ritaglia nulla se le proporzioni già coincidono", () => {
    const box = cropCoverBox({ w: 1024, h: 1024 }, { w: 1080, h: 1080 });
    expect(box).toEqual({ sx: 0, sy: 0, sw: 1024, sh: 1024 });
  });
});

describe("qualityPerModello", () => {
  it("traduce nella scala di gpt-image-1 (standard/hd non sono valori validi)", () => {
    expect(qualityPerModello("gpt-image-1", "standard")).toBe("medium");
    expect(qualityPerModello("gpt-image-1", "hd")).toBe("high");
  });

  it("lascia i valori storici a DALL·E", () => {
    expect(qualityPerModello("dall-e-3", "hd")).toBe("hd");
    expect(qualityPerModello("dall-e-3", "standard")).toBe("standard");
  });

  it("non inventa parametri per modelli sconosciuti", () => {
    expect(qualityPerModello("modello-misterioso", "hd")).toBeNull();
  });
});

describe("costoImmagineUsd — il bug 'paghi hd, ricevi standard'", () => {
  it("fa pagare di più solo quando la qualità alta è davvero applicabile", () => {
    const standard = costoImmagineUsd({ model: "gpt-image-1", size: "1024x1024", quality: "standard" });
    const hd = costoImmagineUsd({ model: "gpt-image-1", size: "1024x1024", quality: "hd" });
    expect(hd).toBeGreaterThan(standard);
  });

  it("su un modello che NON accetta la qualità non addebita il sovrapprezzo", () => {
    // qualityPerModello → null: nulla viene inviato, quindi si paga standard
    const hd = costoImmagineUsd({ model: "modello-misterioso", size: "1024x1024", quality: "hd" });
    const standard = costoImmagineUsd({ model: "modello-misterioso", size: "1024x1024", quality: "standard" });
    expect(hd).toBe(standard);
  });

  it("il verticale costa più del quadrato (più pixel)", () => {
    const quadrata = costoImmagineUsd({ model: "gpt-image-1", size: "1024x1024", quality: "standard" });
    const verticale = costoImmagineUsd({ model: "gpt-image-1", size: "1024x1536", quality: "standard" });
    expect(verticale).toBeGreaterThan(quadrata);
  });
});

describe("costoImmagineCentesimiEur", () => {
  it("resta sopra il costo reale (il ricarico non può essere negativo)", () => {
    const usd = costoImmagineUsd({ model: "gpt-image-1", size: "1024x1536", quality: "hd" });
    const cent = costoImmagineCentesimiEur({ model: "gpt-image-1", size: "1024x1536", quality: "hd" });
    expect(cent).toBeGreaterThanOrEqual(Math.round(usd * 0.92 * 100));
  });

  it("non arriva mai a zero centesimi", () => {
    expect(costoImmagineCentesimiEur({ model: "gpt-image-1", size: "1024x1024", quality: "standard" })).toBeGreaterThan(0);
  });

  it("è un intero (i centesimi non sono frazionabili)", () => {
    const cent = costoImmagineCentesimiEur({ model: "gpt-image-1", size: "1024x1536", quality: "standard" });
    expect(Number.isInteger(cent)).toBe(true);
  });
});

describe("isHexColor", () => {
  it("accetta le forme valide", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#EA580C")).toBe(true);
  });

  it("rifiuta ciò che confonderebbe il modello", () => {
    expect(isHexColor("arancione")).toBe(false);
    expect(isHexColor("rgb(1,2,3)")).toBe(false);
    expect(isHexColor("#12345")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe("buildBrandedImagePrompt", () => {
  it("conserva il brief dell'utente e i vincoli di brand", () => {
    const p = buildBrandedImagePrompt("post ristrutturazione bagno");
    expect(p).toContain("post ristrutturazione bagno");
    expect(p).toContain("VINCOLI:");
  });

  it("senza brand resta il canone generico (nessuna regressione)", () => {
    const p = buildBrandedImagePrompt("brief", null);
    expect(p).not.toContain("PALETTE");
    expect(p).not.toContain("CONTESTO DI MESTIERE");
  });

  it("inserisce i colori aziendali validi", () => {
    const p = buildBrandedImagePrompt("brief", { colorePrimario: "#123456", coloreSecondario: "#abcdef" });
    expect(p).toContain("PALETTE");
    expect(p).toContain("#123456");
    expect(p).toContain("#abcdef");
  });

  it("ignora i colori sporchi invece di passarli al modello", () => {
    const p = buildBrandedImagePrompt("brief", { colorePrimario: "arancione", coloreSecondario: "#123456" });
    expect(p).not.toContain("arancione");
    expect(p).toContain("#123456");
  });

  it("aggiunge la scena tipica del mestiere quando il vertical è noto", () => {
    const p = buildBrandedImagePrompt("brief", { vertical: "serramenti" });
    expect(p).toContain("CONTESTO DI MESTIERE");
    expect(p).toContain("finestre");
  });

  it("non inventa una scena per un vertical sconosciuto", () => {
    const p = buildBrandedImagePrompt("brief", { vertical: "astronavi" });
    expect(p).not.toContain("CONTESTO DI MESTIERE");
  });

  it("chiede sempre spazio libero per titolo e logo", () => {
    expect(buildBrandedImagePrompt("brief")).toContain("COMPOSIZIONE");
  });
});

describe("quota giornaliera", () => {
  it("blocca al raggiungimento del tetto", () => {
    expect(quotaCreativitaSuperata(40, 40)).toBe(true);
    expect(quotaCreativitaSuperata(41, 40)).toBe(true);
  });

  it("consente sotto il tetto", () => {
    expect(quotaCreativitaSuperata(39, 40)).toBe(false);
    expect(quotaCreativitaSuperata(0, 40)).toBe(false);
  });

  it("un cap non valido disattiva il limite invece di bloccare tutto", () => {
    expect(quotaCreativitaSuperata(999, 0)).toBe(false);
    expect(quotaCreativitaSuperata(999, Number.NaN)).toBe(false);
  });

  it("il messaggio è in italiano e dice il numero", () => {
    const m = messaggioQuotaSuperata(40);
    expect(m).toContain("40");
    expect(m.toLowerCase()).toContain("limite");
  });
});

describe("SOCIAL_TARGET_SIZE", () => {
  it("copre tutti i formati offerti nella UI", () => {
    for (const ar of ["1:1", "4:5", "9:16", "16:9"] as CreativeAspect[]) {
      expect(SOCIAL_TARGET_SIZE[ar]).toBeDefined();
      expect(SOCIAL_TARGET_SIZE[ar].w).toBeGreaterThan(0);
      expect(SOCIAL_TARGET_SIZE[ar].h).toBeGreaterThan(0);
    }
  });

  it("usa le dimensioni reali dei social (9:16 = 1080x1920)", () => {
    expect(SOCIAL_TARGET_SIZE["9:16"]).toEqual({ w: 1080, h: 1920 });
    expect(SOCIAL_TARGET_SIZE["1:1"]).toEqual({ w: 1080, h: 1080 });
  });
});
