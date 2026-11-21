import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

it.each(["useShipmentDDTPDF", "useRendicontoAppaltoPDF"])(
  "%s carica una volta per tentativo e riprova dopo un errore",
  async (file) => {
    const source = readFileSync(`src/hooks/${file}.ts`, "utf8");
    const module = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    const statements = module.statements.filter(statement =>
      statement.getText(module).startsWith("let pdfModulePromise") ||
      (ts.isFunctionDeclaration(statement) && statement.name?.text === "loadPdfModule")
    );
    const moduleText = statements.map(s => s.getText(module)).join("\n");
    const compiled = ts.transpileModule(moduleText, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/\bimport\(/g, "carica(");
    const carica = vi.fn()
      .mockRejectedValueOnce(new Error("rete"))
      .mockResolvedValue({});
    const load = runInNewContext(`${compiled}\nloadPdfModule;`, { carica }) as () => Promise<unknown>;
    const tentativo = load();
    expect(load()).toBe(tentativo);
    await expect(tentativo).rejects.toThrow();
    expect(carica).toHaveBeenCalledTimes(2);

    await expect(load()).resolves.toBeDefined();
    await expect(load()).resolves.toBeDefined();
    expect(carica).toHaveBeenCalledTimes(4);
  },
);
