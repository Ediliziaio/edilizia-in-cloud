import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leggi = (f: string) => readFileSync(join(__dirname, "../../components/opportunities", f), "utf8");

describe("spostare verso una fase persa chiede sempre il motivo", () => {
  it("kanban, lista e modifica in blocco: nessuna perdita senza motivo", () => {
    const kanban = leggi("OpportunityKanbanView.tsx");
    const lista = leggi("OpportunityListView.tsx");
    const blocco = leggi("BulkEditSheet.tsx");
    expect(kanban).toContain("setPerditaInSospeso({");
    expect(blocco).toContain("serve il motivo");
    // Lista: «Sposta» verso una fase persa apre la finestra del motivo e lo passa allo spostamento.
    const veloce = lista.split("const handleQuickMove")[1].split("const stageMap")[0];
    expect(veloce).toMatch(/nextStatus === "lost" \|\| nextStatus === "abandoned"[\s\S]*?setPerditaInSospeso\(/);
    expect(lista).toContain("<LossReasonDialog");
    expect(lista).toMatch(/perdita: esito/);
  });

  it("anche «abbandonata» vale come perdita: modifica in blocco e fase scelta nel dettaglio", () => {
    const blocco = leggi("BulkEditSheet.tsx");
    expect(blocco).toContain('fieldValue === "lost" || fieldValue === "abandoned"');
    expect(blocco).toContain('targetStage?.auto_status === "lost" || targetStage?.auto_status === "abandoned"');
    const dettaglio = leggi("OpportunityDetailDialog.tsx");
    expect(dettaglio).toMatch(/statoDellaFase === "lost" \|\| statoDellaFase === "abandoned"\) \{\s*apriMotivoPerdita\(statoDellaFase\)/);
  });
});
