import { describe, expect, it } from "vitest";
import { leggiDiagnosiRenderAi, leggiProvaRipiego, riassuntoRenderAi } from "@/lib/render/diagnosiRenderAi";

// la risposta vera del 02/11/2026 (chiavi OpenAI e OpenRouter ok, Gemini senza quota, ripiego senza immagine)
const rispostaVera = {
  chain: [
    { provider: "gemini_direct", api_key_present: true, ok: false, status: 429, response_excerpt: '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing"}}' },
    { provider: "openrouter_gemini", api_key_present: true, ok: true, status: 200 },
    { provider: "openrouter_openai", api_key_present: true, ok: false, status: 200, error: "200 OK ma nessuna immagine in choices[0].message.images" },
    { provider: "openai_direct", api_key_present: true, ok: true, status: 200 },
  ],
};

describe("diagnosi delle chiavi dei render", () => {
  const righe = leggiDiagnosiRenderAi(rispostaVera);
  it("mette per primo il principale, poi il ripiego, poi i non usati", () => {
    expect(righe.map((r) => r.ruolo)).toEqual(["principale", "ripiego", "non usato", "non usato"]);
    expect(righe[0].chiave).toBe("openai_direct");
    expect(righe[1].chiave).toBe("openrouter_openai");
  });
  it("spiega ogni caso: ok, quota esaurita, nessuna immagine", () => {
    const per = (k: string) => righe.find((r) => r.chiave === k)!;
    expect(per("openai_direct")).toMatchObject({ stato: "ok" });
    expect(per("gemini_direct")).toMatchObject({ stato: "guasto" });
    expect(per("gemini_direct").frase).toMatch(/Quota o credito esauriti/);
    expect(per("openrouter_openai")).toMatchObject({ stato: "attenzione" });
    expect(per("openrouter_openai").frase).toMatch(/non restituisce l'immagine/);
  });
  it("il riassunto dice che il ripiego non è verificato", () => {
    const r = riassuntoRenderAi(righe);
    expect(r.stato).toBe("attenzione");
    expect(r.frase).toMatch(/ripiego OpenRouter non è verificato/);
  });
  it("principale rotto: il ripiego buono salva, altrimenti i render non partono", () => {
    const rotto = (ripiegoOk: boolean) => leggiDiagnosiRenderAi({ chain: [
      { provider: "openai_direct", api_key_present: true, ok: false, status: 401 },
      { provider: "openrouter_openai", api_key_present: true, ok: ripiegoOk, status: 200 },
    ] });
    expect(riassuntoRenderAi(rotto(true)).stato).toBe("attenzione");
    expect(riassuntoRenderAi(rotto(false)).stato).toBe("guasto");
  });
  it("chiave assente o risposta vuota", () => {
    expect(leggiDiagnosiRenderAi({ chain: [{ provider: "openai_direct", api_key_present: false, ok: false }] })[0].frase).toMatch(/non è configurata/);
    expect(leggiDiagnosiRenderAi(null)).toEqual([]);
  });
});

describe("leggiProvaRipiego", () => {
  it("dice che il ripiego funziona con i secondi", () => {
    const r = leggiProvaRipiego({ ok: true, latencyMs: 41000 });
    expect(r.stato).toBe("ok");
    expect(r.frase).toContain("41 s");
  });
  it("riconosce credito finito", () => {
    expect(leggiProvaRipiego({ ok: false, error: "402 insufficient credits" }).stato).toBe("guasto");
  });
  it("riconosce chiave rifiutata", () => {
    expect(leggiProvaRipiego({ ok: false, error: "401 Unauthorized" }).frase).toContain("chiave");
  });
  it("risposta vuota = attenzione", () => {
    expect(leggiProvaRipiego(null).stato).toBe("attenzione");
  });
});
