import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import {
  prepareWindowImport,
  windowImportSql,
  DEMO_COMPANY,
  IMPORT_SURVEY,
} from "../../../work/sopralluoghi-campo-20261028/prepareWindowImport";

describe("Importazione dimostrativa serramenti autorizzata", () => {
  it("mantiene tutte le 16 schede e i 6 ambienti senza link o approvazioni inventati", async () => {
    const p = prepareWindowImport();
    expect(p.survey.company_id).toBe(DEMO_COMPANY);
    expect(p.survey.status).toBe("draft");
    expect(p.areas).toHaveLength(6);
    expect(p.elements).toHaveLength(16);
    expect(new Set(p.areas.map((a) => a.id)).size).toBe(6);
    expect(new Set(p.elements.map((e) => e.id)).size).toBe(16);
    expect(
      p.elements.every(
        (e) =>
          e.survey_id === IMPORT_SURVEY &&
          p.areas.some((a) => a.id === e.area_id),
      ),
    ).toBe(true);
    expect(
      p.elements.every(
        (e) => !e.is_complete && e.values.rv_order_checked === false,
      ),
    ).toBe(true);
    expect(p.survey).not.toHaveProperty("client_id");
    expect(p.survey).not.toHaveProperty("order_id");
    expect(p.survey).not.toHaveProperty("technician_id");
    const sql = windowImportSql(p);
    expect(sql).not.toMatch(/\b(delete|update|alter|grant)\s/i);
    expect(sql).toContain("rollback completo");
    if (process.env.PREPARE_DEMO_WINDOW_IMPORT === "1") {
      await mkdir("work/sopralluoghi-campo-20261028/importazione", {
        recursive: true,
      });
      await writeFile(
        "work/sopralluoghi-campo-20261028/importazione/payload.json",
        JSON.stringify(p, null, 2),
      );
      await writeFile(
        "work/sopralluoghi-campo-20261028/importazione/import.sql",
        sql,
      );
    }
  });
});
