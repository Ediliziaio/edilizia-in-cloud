/**
 * Nuova sequenza: anche da una già esistente (22/09/2026).
 *
 * Il dialog "Nuova sequenza" partiva solo da tre modelli fissi. Il founder ha
 * chiesto la possibilità di copiare le fasi di una sequenza che l'azienda ha
 * già, invece di ricostruirla a mano fase per fase.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync(resolve(process.cwd(), "src/components/settings/PipelinesConfig.tsx"), "utf8");

describe("copiare le fasi di una sequenza esistente", () => {
  it("la query delle sequenze legge anche l'esito di ogni fase, non solo nome e posizione", () => {
    expect(sorgente).toContain('.select("*, marketing_pipeline_stages(id, name, position, auto_status)")');
  });

  it("il costruttore copia nome ed esito nell'ordine delle fasi, con id nuovi", () => {
    const blocco = sorgente.slice(
      sorgente.indexOf("function buildStagesFromExistingPipeline"),
      sorgente.indexOf("function getErrorMessage"),
    );
    expect(blocco).toContain(".sort((a, b) => a.position - b.position)");
    expect(blocco).toContain("name: stage.name");
    expect(blocco).toContain("auto_status: stage.auto_status");
    // id nuovo per ogni fase copiata: non deve riusare l'id della fase originale
    expect(blocco).not.toContain("id: stage.id");
  });

  it("solo le sequenze con almeno una fase si possono copiare", () => {
    expect(sorgente).toContain("const pipelineCopiabili = pipelines.filter((p) => (p.marketing_pipeline_stages?.length ?? 0) > 0);");
  });

  it("il selettore mostra un gruppo a parte, solo se c'è qualcosa da copiare", () => {
    expect(sorgente).toContain("Copia una sequenza esistente");
    expect(sorgente).toContain("{pipelineCopiabili.length > 0 && (");
  });

  it("scegliere una sequenza esistente ricostruisce le fasi e propone un nome derivato", () => {
    const blocco = sorgente.slice(sorgente.indexOf("function applyTemplate"), sorgente.indexOf("function handleAddCreateStage"));
    expect(blocco).toContain("id.startsWith(PREFISSO_SEQUENZA_ESISTENTE)");
    expect(blocco).toContain("buildStagesFromExistingPipeline(pipeline)");
    expect(blocco).toContain("suggerisciNome(`${pipeline.name} (copia)`)");
  });

  it("il nome scritto dall'utente non viene mai sovrascritto in automatico", () => {
    const blocco = sorgente.slice(sorgente.indexOf("function suggerisciNome"), sorgente.indexOf("function applyTemplate"));
    expect(blocco).toContain("current === normalizeName(lastSuggestedName)");
  });

  it("la sequenza copiata è nuova e indipendente: nessun riferimento diretto all'id di quella originale nell'insert", () => {
    const inserimento = sorgente.slice(sorgente.indexOf("const createPipeline = useMutation"), sorgente.indexOf("const updatePipeline = useMutation"));
    expect(inserimento).not.toContain("copyingFromPipelineId");
    expect(inserimento).not.toContain("copyingFromPipeline.id");
  });
});
