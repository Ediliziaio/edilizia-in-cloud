import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataInSecondi, inizioFinestra } from "../../../supabase/functions/_shared/metaFinestraRecupero";

// 19/09/2026: «importa i contatti delle ultime 2 settimane di quel modulo,
// fallo tu». Il recupero dal server non andava mai prima del collegamento del
// modulo: lo storico si riprendeva solo dal pannello, col clic del titolare.
const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("da quando si recuperano i lead di un modulo", () => {
  const cfg = {
    sync_mode: "new_only",
    since_date: "2026-09-19",
    created_at: "2026-09-19T10:17:00Z",
    last_pull_at: "2026-09-19T11:45:00Z",
  };
  const cinqueGiorniFa = s("2026-09-14T10:00:00Z");

  it("giro automatico: mai prima del collegamento, e dal segnalibro", () => {
    expect(inizioFinestra({ sinceTs: cinqueGiorniFa, cfg })).toBe(s("2026-09-19T11:45:00Z"));
  });

  it("recupero per giorni: senza segnalibro, ma sempre non prima del collegamento", () => {
    expect(inizioFinestra({ sinceTs: cinqueGiorniFa, cfg, ignoraSegnalibro: true })).toBe(s("2026-09-19T10:17:00Z"));
  });

  it("modulo mai configurato: vale solo la finestra chiesta", () => {
    expect(inizioFinestra({ sinceTs: cinqueGiorniFa, cfg: null })).toBe(cinqueGiorniFa);
  });

  it("recupero esplicito di un modulo da una data: vale la data, anche prima del collegamento", () => {
    const da = dataInSecondi("2026-09-05");
    expect(da).toBe(s("2026-09-05T00:00:00Z"));
    expect(inizioFinestra({ sinceTs: cinqueGiorniFa, cfg, daEsplicita: da })).toBe(s("2026-09-05T00:00:00Z"));
  });

  it("una data scritta male non diventa una finestra", () => {
    expect(dataInSecondi("05/09/2026")).toBeNull();
    expect(dataInSecondi(undefined)).toBeNull();
    expect(inizioFinestra({ sinceTs: cinqueGiorniFa, cfg, daEsplicita: null })).toBe(s("2026-09-19T11:45:00Z"));
  });
});

describe("chi può lanciare il recupero", () => {
  const fonte = readFileSync(join(__dirname, "../../../supabase/functions/meta-leads-backfill/index.ts"), "utf8");

  it("non basta più un «Bearer» qualsiasi: segreto del cron o chiave di servizio", () => {
    expect(fonte).not.toContain('authHeader?.startsWith("Bearer ")');
    expect(fonte).toContain("reqSecret === cronSecret");
    expect(fonte).toContain("bearer === serviceKey");
  });

  it("il recupero da una data vale per un modulo e un'azienda sola", () => {
    expect(fonte).toContain("serve form_id");
    expect(fonte).toContain("(giorniChiesti !== null || soloModulo) && !onlyCompany");
  });
});
