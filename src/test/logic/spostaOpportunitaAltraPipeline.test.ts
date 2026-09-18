/**
 * Spostare un'opportunità in un'ALTRA pipeline (Il Bagno Group, 18/09/2026).
 *
 * Il pannello «Sposta» elencava solo le fasi della pipeline aperta: da «DVS
 * Pipeline» non c'era modo di passare a «2° Fase - Showroom». Il database lo
 * permetteva già (provato come titolare): mancava la scelta nella pagina.
 * Cambiare la sola fase non basta — l'opportunità resterebbe agganciata alla
 * pipeline vecchia e sparirebbe da entrambe le viste.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

describe("sposta opportunità in un'altra pipeline", () => {
  const lista = leggi("src/components/opportunities/OpportunityListView.tsx");
  const hook = leggi("src/hooks/useOpportunitiesData.ts");

  it("il pannello «Sposta» fa scegliere la pipeline", () => {
    expect(lista).toContain("usePipelines");
    expect(lista).toMatch(/Pipeline<\/Label>/);
    expect(lista).toContain("setMovePipelineId");
    // Le fasi mostrate sono quelle della pipeline scelta, non solo di quella aperta.
    expect(lista).toContain("fasiDaMostrare.map");
  });

  it("lo spostamento porta con sé la pipeline, non solo la fase", () => {
    expect(lista).toMatch(/cambiaPipeline \? \{ pipeline_id: pipelineScelta\.id \}/);
    expect(hook).toMatch(/if \(pipeline_id\) updateData\.pipeline_id = pipeline_id;/);
  });

  it("la scheda si sposta anche nelle liste già caricate", () => {
    expect(hook).toMatch(/\.\.\.\(pipeline_id \? \{ pipeline_id \} : \{\}\)/);
  });
});

describe("scheda opportunità: cambio pipeline", () => {
  const scheda = leggi("src/components/opportunities/OpportunityDetailDialog.tsx");

  it("«Sequenza» è una scelta, non più una casella grigia", () => {
    // Il popup della scheda è la strada che usano davvero: lì la pipeline era
    // solo scritta, e non c'era modo di spostare l'opportunità (Il Bagno
    // Group, 18/09/2026).
    expect(scheda).toContain("const [pipelineId, setPipelineId]");
    expect(scheda).toMatch(/Sequenza<\/Label>\s*\n\s*\{canEditOpportunity && pipelines\.length > 1 \?/);
  });

  it("cambiando pipeline le fasi diventano quelle nuove", () => {
    expect(scheda).toContain("fasiDisponibili.map");
    expect(scheda).toContain("const prima = fasi[0]");
  });

  it("il salvataggio porta con sé la pipeline", () => {
    expect(scheda).toMatch(/pipelineId !== opportunity\.pipeline_id \? \{ pipeline_id: pipelineId \}/);
  });
});

describe("kanban: trascinare in un'altra pipeline", () => {
  const kanban = leggi("src/components/opportunities/OpportunityKanbanView.tsx");

  it("mentre si trascina compaiono le altre pipeline come zona di rilascio", () => {
    expect(kanban).toContain("function ZonaPipeline");
    expect(kanban).toContain('id: `pipeline:${pipeline.id}`');
    expect(kanban).toContain("Lascia qui per spostare in un'altra pipeline");
    // Solo mentre una scheda è in volo, e solo se ci sono altre pipeline.
    expect(kanban).toContain("{activeItem && canEdit && altrePipeline.length > 0 && (");
  });

  it("il rilascio porta pipeline e prima fase insieme", () => {
    expect(kanban).toContain("pipelineDestinazione");
    expect(kanban).toMatch(/stage_id: primaFase\.id,\s*\n\s*pipeline_id: pipelineDestinazione,/);
  });

  it("una pipeline senza fasi lo dice invece di fallire in silenzio", () => {
    expect(kanban).toContain("non ha nessuna fase");
  });
});

