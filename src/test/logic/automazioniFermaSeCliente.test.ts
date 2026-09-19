import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 19/09/2026 — nurturing di Marketing Edile: «non si deve mai fermare, si ferma
// solo se diventa cliente». Il flusso ignora risposte e schede spostate e si
// chiude appena il contatto ha un'opportunità vinta nella pipeline scelta.
describe("fermarsi solo quando diventa cliente", () => {
  const motore = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");
  const impostazioni = readFileSync(join(__dirname, "../../components/flow-builder/tabs/WorkflowImpostazioni.tsx"), "utf8");
  const migrazione = readFileSync(join(__dirname, "../../../supabase/migrations/20280919341500_automazioni_ferma_se_cliente.sql"), "utf8");

  it("la colonna esiste ed è legata alle pipeline", () => {
    expect(migrazione).toMatch(/add column if not exists stop_on_won_pipeline_id uuid\s+references public\.marketing_pipelines\(id\) on delete set null/);
  });

  it("il motore legge l'impostazione e cerca una vinta in quella pipeline", () => {
    expect(motore).toContain('.select("stop_on_reply, stop_on_won_pipeline_id")');
    expect(motore).toMatch(/\.eq\("pipeline_id", imp\.pipelineCliente\)\.not\("won_at", "is", null\)/);
    expect(motore).toContain('motivo = "il contatto è diventato cliente"');
  });

  it("senza «Interrompi su risposta» né risposte né schede spostate fermano il flusso", () => {
    expect(motore).toMatch(/const \{ data: contatto \} = imp\.stopOnReply && !motivo/);
    expect(motore).toMatch(/if \(!motivo && imp\.stopOnReply && item\.company_id === OPENWA_PLATFORM_COMPANY_ID\)/);
    expect(motore).toMatch(/if \(!motivo && imp\.stopOnReply\) \{\s*const \{ data: opps \}/);
  });

  it("le impostazioni del flusso la mostrano e la salvano", () => {
    expect(impostazioni).toContain("stop_on_won_pipeline_id");
    expect(impostazioni).toContain("Fermati quando diventa cliente");
  });
});
