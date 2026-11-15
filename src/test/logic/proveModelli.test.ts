import { describe, expect, it } from "vitest";
import { compitiFermi, segnaliDaGuardare, type CompitoAI, type ModelloDelCompito, type ProveModelli } from "@/lib/ai/proveModelli";

const modello = (m: Partial<ModelloDelCompito> & Pick<ModelloDelCompito, "modello" | "ruolo">): ModelloDelCompito => ({
  chiamate: 10, riuscite: 10, errori: 0, da_riserva: 0, costo: 0.1, costo_medio: 0.01, p50_ms: 2000, p95_ms: 5000,
  cache_pct: 50, token_in: 1000, token_out: 100, aziende: 1, ultima: "2026-11-15T10:00:00Z", ultimo_errore: null, ...m,
});
const compito = (c: Partial<CompitoAI> & Pick<CompitoAI, "task_key" | "modelli">): CompitoAI => ({
  etichetta: null, categoria: null, configurato: true, abilitato: true, principale: "anthropic/claude-sonnet-5.5", riserve: [],
  chiamate: c.modelli.reduce((s, m) => s + m.chiamate, 0), costo: c.modelli.reduce((s, m) => s + m.costo, 0), ...c,
});
const dati = (compiti: CompitoAI[], extra: Partial<ProveModelli> = {}): ProveModelli => ({
  dal: "2026-10-16T00:00:00Z", giorni: 30, totali: { chiamate: 0, errori: 0, da_riserva: 0, costo: 0, cache_pct: null },
  compiti, diretti: [], allarmi_aperti: [], ...extra,
});

describe("Prove modelli: cosa guardare", () => {
  it("un modello che fallisce sempre è rosso, e prima di tutto il resto", () => {
    const s = segnaliDaGuardare(dati([
      compito({ task_key: "planimetria_genera", modelli: [
        modello({ modello: "google/gemini-2.5-pro", ruolo: "riserva", chiamate: 26, riuscite: 0, errori: 26, costo: 0, ultimo_errore: "Signal timed out." }),
        modello({ modello: "anthropic/claude-sonnet-4.5", ruolo: "principale", chiamate: 104, riuscite: 104, da_riserva: 0, p95_ms: 70_000, costo: 6 }),
      ] }),
    ]));
    expect(s[0]).toMatchObject({ gravita: "rosso", titolo: "gemini-2.5-pro fallisce in «planimetria_genera»" });
    expect(s[0].dettaglio).toContain("26 errori su 26");
    expect(s.some((x) => x.gravita === "giallo" && x.titolo.includes("lento"))).toBe(true);
  });

  it("riserva usata spesso, principale scavalcato, spesa fuori catena", () => {
    const s = segnaliDaGuardare(dati([
      compito({ task_key: "a", principale: "openai/gpt-4o-mini", modelli: [
        modello({ modello: "anthropic/claude-haiku-4.5", ruolo: "riserva", chiamate: 20, riuscite: 20, da_riserva: 20 }),
      ] }),
      compito({ task_key: "preventivo_genera", principale: "anthropic/claude-haiku-4.5", modelli: [
        modello({ modello: "anthropic/claude-sonnet-5.5", ruolo: "fuori_catena", costo: 10 }),
        modello({ modello: "anthropic/claude-haiku-4.5", ruolo: "principale", costo: 1 }),
      ] }),
    ]));
    const titoli = s.map((x) => x.titolo);
    expect(titoli).toContain("«a» va spesso sulla riserva");
    expect(titoli).toContain("Il modello principale di «a» non lavora mai");
    expect(titoli).toContain("«preventivo_genera» spende soprattutto fuori dalla catena");
  });

  it("poca cache solo dove i modelli Anthropic costano davvero", () => {
    const poca = segnaliDaGuardare(dati([compito({ task_key: "t", modelli: [modello({ modello: "anthropic/claude-sonnet-5.5", ruolo: "principale", costo: 3, cache_pct: 5 })] })]));
    expect(poca.map((x) => x.titolo)).toContain("Poca cache in «t»");
    const pochiSoldi = segnaliDaGuardare(dati([compito({ task_key: "t", modelli: [modello({ modello: "anthropic/claude-sonnet-5.5", ruolo: "principale", costo: 0.2, cache_pct: 5 })] })]));
    expect(pochiSoldi).toEqual([]);
  });

  it("allarmi aperti, compiti senza configurazione e compiti fermi", () => {
    const d = dati([
      compito({ task_key: "email_triage", configurato: false, principale: null, modelli: [modello({ modello: "openai/gpt-4o-mini", ruolo: "fuori_catena", chiamate: 700, costo: 0.18 })] }),
      compito({ task_key: "template_tetti", modelli: [] }),
    ], { allarmi_aperti: [{ provider: "openrouter", motivo: "credito_esaurito", aperto_il: "2026-11-15T08:00:00Z", conteggio: 3, dettaglio: null }] });
    const s = segnaliDaGuardare(d);
    expect(s[0].titolo).toBe("Allarme aperto: openrouter, credito esaurito");
    expect(s.map((x) => x.titolo)).toContain("«email_triage» non ha una configurazione");
    expect(compitiFermi(d).map((c) => c.task_key)).toEqual(["template_tetti"]);
  });
});
