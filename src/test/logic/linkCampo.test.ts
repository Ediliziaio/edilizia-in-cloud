import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { linkPerCampo } from "@/lib/notifiche/linkCampo";

const leggi = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

describe("link degli avvisi per operai e subappaltatori", () => {
  const commessa = "7402d5f0-d20d-d5ac-728b-f2e757a865bd";

  it("una commessa dell'ufficio diventa il lavoro nel campo", () => {
    expect(linkPerCampo(`/azienda/ordini/${commessa}`)).toBe(`/campo/lavoro/${commessa}`);
    expect(linkPerCampo(`/azienda/ordini/${commessa}?tab=note`)).toBe(`/campo/lavoro/${commessa}`);
  });

  it("attività e documenti hanno la loro pagina; il resto porta alla home del campo", () => {
    expect(linkPerCampo("/azienda/attivita?task=1")).toBe("/campo/attivita");
    expect(linkPerCampo("/azienda/personale?tab=documenti")).toBe("/campo/documenti");
    expect(linkPerCampo("/azienda/preventivi")).toBe("/campo");
    expect(linkPerCampo(null)).toBe("/campo");
    expect(linkPerCampo("")).toBe("/campo");
  });

  it("un link già del campo resta com'è", () => {
    expect(linkPerCampo("/campo/chat/abc")).toBe("/campo/chat/abc");
  });

  it("è la stessa traduzione che il database applica alle push", () => {
    const migrazione = leggi("supabase/migrations/20280926140000_push_per_gli_avvisi_che_contano.sql");
    expect(migrazione).toContain("THEN '/campo/lavoro/' || substring(p_url FROM '^/azienda/ordini/([0-9a-f-]{36})')");
    expect(migrazione).toContain("WHEN p_url LIKE '/azienda/attivita%' THEN '/campo/attivita'");
    expect(migrazione).toContain("WHEN p_url LIKE '/azienda/personale%' THEN '/campo/documenti'");
  });
});
