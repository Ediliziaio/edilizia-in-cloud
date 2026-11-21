import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { expect, it } from "vitest";

const source = readFileSync("src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx", "utf8");
const page = ts.createSourceFile("DocumentiFiscaliList.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const statiDdt: ts.ConditionalExpression[] = [];
function visita(node: ts.Node) {
  if (
    ts.isConditionalExpression(node) && node.condition.getText(page) === "isDdt && !isTrash" &&
    node.whenTrue.getText(page).includes("Da fatturare")
  ) statiDdt.push(node);
  ts.forEachChild(node, visita);
}
visita(page);

function statoDdt(doc: { ddt_fattura_id: string | null; ddt_fatturato: boolean }): string[] {
  expect(statiDdt).toHaveLength(2);
  return statiDdt.map(nodo => {
    const compiled = ts.transpileModule(`globalThis.view = ${nodo.getText(page)};`, {
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const context = {
      view: createElement("span"),
      React: { createElement }, doc, isDdt: true, isTrash: false, ddtFatturato: doc.ddt_fatturato,
      cn: (...classi: string[]) => classi.join(" "),
      Badge: "span",
    };
    runInNewContext(compiled, context);
    return renderToStaticMarkup(context.view);
  });
}

it("il DDT collegato a una bozza resta da fatturare in entrambe le viste", () => {
  for (const html of statoDdt({ ddt_fattura_id: "bozza", ddt_fatturato: false })) {
    expect(html).toContain("Da fatturare");
    expect(html).not.toContain("emerald");
  }
});

it("il DDT emesso si vede fatturato e la rimozione del collegamento con la bozza non cambia lo stato", () => {
  for (const html of statoDdt({ ddt_fattura_id: "fattura", ddt_fatturato: true })) {
    expect(html).toContain("Fatturato");
    expect(html).toContain("emerald");
  }
  for (const html of statoDdt({ ddt_fattura_id: null, ddt_fatturato: false })) {
    expect(html).toContain("Da fatturare");
  }
});
