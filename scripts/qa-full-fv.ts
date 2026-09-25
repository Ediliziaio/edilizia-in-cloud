/** Render the original FV document with intervention fixtures, without company/network access. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createFullFvTemplate, isFullFvModuleId } from "../src/lib/moduli-vendita/fullFvModules";
import { buildFvPreviewBase } from "../src/lib/moduli-vendita/fvPreviewData";
import { renderFvPdfHtml, getFvPdfRenderedPagesCount, fotoBlocchiDalSito, fotoPagineDalSito, badgeGaranzieDalSito } from "../supabase/functions/_shared/fvHtmlTemplate";
const output = path.resolve(process.argv[2] || "../full-module-qa");
await mkdir(output, { recursive: true });
const moduleId = process.argv[3] || "accumulo";
if (!isFullFvModuleId(moduleId)) throw new Error("Modulo sconosciuto");
const template = createFullFvTemplate({ ragione_sociale: "Impresa esempio", presentazione_impresa_html: "<p>Presentazione dimostrativa dell'impresa. Prima dell'invio, inserire i dati verificati della propria azienda, i riferimenti del team e i recapiti del referente.</p>" }, "qa-company", moduleId);
for (const variant of ["base", "prezzo-zero", "molti-componenti", "faq-lunghe"] as const) {
  const data = buildFvPreviewBase(structuredClone(template));
  if (variant === "prezzo-zero") data.costi.prezzo_vendita_iva_inclusa = 0;
  if (variant === "molti-componenti") data.componenti = Array.from({ length: 12 }, (_, i) => ({ ...data.componenti[0], categoria: i === 0 ? "accumulo" : "altro", descrizione: `Componente dimostrativo ${i + 1} · ${"Specifiche e compatibilità da confermare con il progetto. ".repeat(3)}`, quantita: i + 1 }));
  if (variant === "faq-lunghe") data.template!.faq_items = data.template!.faq_items!.map(f => ({ ...f, risposta: `${f.risposta} ${"Ulteriori dettagli si verificano con il referente in base alla configurazione. ".repeat(4)}` }));
  data.blocchi_foto = fotoBlocchiDalSito("http://127.0.0.1:8081", data.template);
  data.foto_pagine = fotoPagineDalSito("http://127.0.0.1:8081", data.template);
  data.badge_garanzie = badgeGaranzieDalSito("http://127.0.0.1:8081");
  let html = renderFvPdfHtml(data);
  const urls = [...new Set([...html.matchAll(/(?:https?:\/\/127\.0\.0\.1:8081)?\/(?:module-art|pdf-stock|cover-stock)\/[^"'<>\s]+/g)].map(m => m[0]))];
  for (const url of urls.sort((a, b) => b.length - a.length)) {
    const file = path.resolve("public", url.replace("http://127.0.0.1:8081", "").slice(1));
    const bytes = await readFile(file);
    html = html.replaceAll(url, `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`);
  }
  await writeFile(path.join(output, `${moduleId}-${variant}.html`), html);
  // Screen-only QA pager: original print styles and all printed pages remain unchanged.
  let pageIndex = 0;
  const screenHtml = html.replaceAll('<div class="page">', () => `<div class="page" id="qa-page-${++pageIndex}">`)
    .replace("</head>", `<style>@media screen { body { padding:32px 0 0; } .pdf-action-bar { display:none; } .page { display:none; zoom:.57; margin:0 auto; } .page:target { display:block; } .qa-nav { position:fixed; top:0; left:0; right:0; padding:8px; background:white; z-index:99999; font:12px sans-serif; text-align:center; } .qa-nav a { margin:0 7px; } } @media print { .qa-nav {display:none} }</style></head>`)
    .replace("<body>", `<body><nav class="qa-nav">Verifica visiva · ${Array.from({ length: getFvPdfRenderedPagesCount(data) }, (_, i) => `<a href="#qa-page-${i + 1}">${i + 1}</a>`).join(" ")}</nav>`);
  await writeFile(path.join(output, `${moduleId}-${variant}-screen.html`), screenHtml);
  console.log(variant, getFvPdfRenderedPagesCount(data), "pagine dichiarate");
}
