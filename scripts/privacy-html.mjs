// Esporta il contenuto della pagina React come sorgente del PDF, senza duplicare il testo legale.
import fs from "node:fs";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = fs.readFileSync("src/pages/PrivacyPolicy.tsx", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const exports = {};
const sandbox = { exports, React, require(name) {
  if (name !== "@/components/legal/LegalLayout") throw new Error(`Import inatteso: ${name}`);
  return { __esModule: true, default: (props) => React.createElement("article", null,
    React.createElement("h1", null, "Edilizia in Cloud — Privacy Policy"), props.children) };
} };
vm.runInNewContext(js, sandbox, { filename: "PrivacyPolicy.js" });
fs.mkdirSync("tmp/pdfs", { recursive: true });
fs.writeFileSync("tmp/pdfs/privacy.html", `<!doctype html><html lang="it"><meta charset="utf-8"><body>${renderToStaticMarkup(React.createElement(exports.default))}</body></html>`);
