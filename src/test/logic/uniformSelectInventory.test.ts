import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("i menu nativi restano confinati al controllo nascosto del componente condiviso", () => {
  const unexpected: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "test") visit(path); continue; }
      if (!path.endsWith(".tsx") || path.endsWith("/ui/uniform-select.tsx")) continue;
      const text = readFileSync(path,"utf8");
      if (!text.includes("<select")) continue;
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function inspect(node: ts.Node) {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "select") unexpected.push(relative(process.cwd(),path));
        ts.forEachChild(node,inspect);
      }
      inspect(source);
    }
  }
  visit(join(process.cwd(),"src"));
  expect(unexpected).toEqual([]);
});
