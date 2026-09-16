import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIALOG = readFileSync(join(__dirname, "../../components/opportunities/OpportunityDetailDialog.tsx"), "utf8");
const SALVA = DIALOG.split("const handleSave = async () => {")[1].split("updateOpp.mutate(")[0];

describe("Opportunità persa: «Aggiorna» e il motivo", () => {
  it("senza motivo apre la finestra del motivo invece dell'errore", () => {
    expect(SALVA).toMatch(/status === "lost" && !motivoCategoria && !motivoDettaglio[\s\S]*?setShowLostDialog\(true\)/);
  });

  it("il motivo già scritto (finestra o opportunità) viaggia nel salvataggio", () => {
    expect(SALVA).toMatch(/lostCategory \|\| opportunity\.lost_reason_category/);
    expect(DIALOG).toMatch(/status === "lost" \? \{ lost_reason_category: motivoCategoria, lost_reason: motivoDettaglio \}/);
  });

  it("confermato il motivo, il salvataggio riparte da solo", () => {
    expect(DIALOG).toMatch(/if \(riprendiSalvataggio\.current\) \{[\s\S]*?void handleSave\(\);/);
  });
});
