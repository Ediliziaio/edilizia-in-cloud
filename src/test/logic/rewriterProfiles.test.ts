import { describe, expect, it } from "vitest";
import { FLOOR_REWRITER_PROFILE } from "../../../supabase/functions/_shared/ai-provider/floorRewriterProfile.ts";
import { POOL_REWRITER_PROFILE } from "../../../supabase/functions/_shared/ai-provider/poolRewriterProfile.ts";
import { TECHNICAL_REWRITER_PROFILE } from "../../../supabase/functions/_shared/ai-provider/technicalRewriterProfile.ts";
import { buildFloorPrompt } from "../../../shared/render-floor/floorPromptBuilder.ts";
import { buildPoolPrompt } from "../../../supabase/functions/generate-pool-render/poolPrompt.ts";
import { configPerAmbito } from "../../../shared/render-piscine/piscineOperationScope.ts";
import { DEFAULT_PAVIMENTO_CONFIG } from "@/components/render-pavimento/defaultPavimentoConfig";

/**
 * Il rewriter riscrive in prosa quello che il compattatore del profilo gli passa. Se il compattatore
 * legge una chiave che il manifest non ha, la regola sparisce senza errori: la prosa esce lo stesso,
 * solo senza le regole di conservazione. Questi test fissano che le chiavi coincidano.
 */
const lista = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

describe("profili del rewriter: le regole del builder arrivano davvero", () => {
  it("pavimento: la lista `preservation` del manifest arriva come preserve_exactly", () => {
    const built = buildFloorPrompt({ ...DEFAULT_PAVIMENTO_CONFIG }, undefined, null);
    const compact = FLOOR_REWRITER_PROFILE.compact(built.normalizedConfig) as Record<string, unknown>;
    const attese = built.normalizedConfig.replacement_manifest.preservation;
    expect(attese.length).toBeGreaterThan(0);
    expect(lista(compact.preserve_exactly)).toEqual(attese);
  });

  describe("piscine: il payload dell'edge scrive `preserve`, `recolors` e `conversions`", () => {
    const rewriterInput = (operazione: string) => {
      const config = {
        operazione,
        piscina: { tipo: "interrata_rettangolare", colore_acqua: "turchese" },
        finiture: { rivestimento_interno: "mosaico_azzurro", coping: "pietra_chiara" },
        comfort: {},
        inserimento: {},
      };
      const { promptPayload } = buildPoolPrompt({ config }, {});
      return { legacy_config: configPerAmbito(config), ...promptPayload };
    };

    it("la conservazione del builder arriva come preserve_exactly", () => {
      const input = rewriterInput("add_new_pool");
      const compact = POOL_REWRITER_PROFILE.compact(input) as Record<string, unknown>;
      const attese = lista((input as { replacement_manifest: { preserve?: unknown } }).replacement_manifest.preserve);
      expect(attese.length).toBeGreaterThan(0);
      expect(lista(compact.preserve_exactly)).toEqual(attese);
    });

    it("«solo colore dell'acqua»: l'istruzione e i limiti di ambito arrivano al rewriter", () => {
      const compact = POOL_REWRITER_PROFILE.compact(rewriterInput("recolor_waterlook_or_liner_only")) as Record<string, unknown>;
      expect(lista(compact.recolors).join(" ")).toMatch(/Change only the perceived interior finish\/water look/);
      expect(lista(compact.conversions).join(" ")).toMatch(/Strict scope: do not add or modify steps/);
    });
  });

  it("moduli tecnici: le scelte strutturate arrivano alla lettera tra le parole del cliente", () => {
    const opzioni = { finitura_anta: "rovere", lato_foto: "esterno" };
    const compact = TECHNICAL_REWRITER_PROFILE.compact({
      module_type: "porte-interne",
      config: { interventionPreset: "battente_liscia", targetArea: "corridoio", opzioni },
    }) as { richiesta_cliente: Record<string, unknown> };
    expect(compact.richiesta_cliente.scelte_strutturate).toEqual(opzioni);
  });

  it("moduli tecnici: senza scelte strutturate (sessioni vecchie) il JSON per il rewriter non cambia", () => {
    const compact = TECHNICAL_REWRITER_PROFILE.compact({
      module_type: "giardini",
      config: { interventionPreset: "prato_e_aiuole" },
    });
    expect(JSON.stringify(compact)).not.toContain("scelte_strutturate");
  });
});
