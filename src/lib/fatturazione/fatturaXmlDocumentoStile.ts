// Stile del documento isolato, condiviso tra l’iframe di anteprima e la stampa.
export const stileFatturaXml = `
:root {
  color-scheme: light;
  --inchiostro: #182941;
  --blu: #183558;
  --secondario: #50627a;
  --contorno: #d9e3ee;
  --pannello: #edf3fa;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px;
  background: #f0f3f7;
  color: var(--inchiostro);
  font: 13px/1.42 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
}

.foglio {
  max-width: 1120px;
  margin: 0 auto 22px;
  padding: 30px clamp(18px, 4.2vw, 48px);
  border: 1px solid var(--contorno);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 3px 12px #1835580c;
}

.testata {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 24px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--blu);
  overflow-wrap: anywhere;
}

.testata h1 { margin: 0; color: var(--blu); font-size: clamp(24px, 3.2vw, 32px); line-height: 1.12; letter-spacing: -.035em; }
.testata p { margin: 5px 0 0; color: var(--secondario); }
.numero { min-width: min(37%, 160px); text-align: right; color: var(--blu); }
.numero strong { font-size: 16px; }

.parti { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.parte { padding: 13px 15px; border: 1px solid var(--contorno); border-radius: 8px; overflow-wrap: anywhere; }
.parte p { margin: 2px 0; color: var(--secondario); white-space: pre-wrap; }
.parte .etichetta, .dati-testata dt {
  color: var(--secondario);
  font-weight: 650;
  font-size: 10px;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.parte h2 { margin: 3px 0 4px; color: var(--inchiostro); font-size: 16px; }
.dati-testata { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 10px 0 18px; padding: 0 2px; }
.dati-testata dd { margin: 1px 0 0; overflow-wrap: anywhere; }
.sezioni-documento {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0 0 10px;
  padding: 6px;
  border: 1px solid var(--contorno);
  border-radius: 8px;
  background: #f7f9fc;
}
.sezioni-documento a {
  padding: 5px 9px;
  border-radius: 5px;
  color: var(--blu);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}
.sezioni-documento a:hover, .sezioni-documento a:focus-visible { background: var(--pannello); text-decoration: underline; }

.blocco { margin: 16px 0; }
.blocco[id] { scroll-margin-top: 58px; }
.blocco h2 { margin: 0 0 6px; color: var(--blu); font-size: 14px; font-weight: 700; break-after: avoid; }
.scorri { width: 100%; overflow-x: auto; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; }
thead { display: table-header-group; }
th, td { padding: 6px 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
th { border-block: 1px solid var(--contorno); background: var(--pannello); color: var(--blu); font-size: 10.5px; font-weight: 700; }
td { border-bottom: 1px solid #e5ecf3; }
tbody tr:nth-child(even) { background: #f9fbfd; }
.n { text-align: right; }
.righe td:first-child, .altri td:first-child, .riferimenti td:first-child { color: var(--secondario); }
.righe td:nth-child(6) { color: var(--inchiostro); font-weight: 650; }
.dettagli-riga { margin: 4px 0 0; color: var(--secondario); font-size: .86em; }
.dettagli-riga div { margin: 2px 0; }
.dettagli-riga dt, .dettagli-riga dd { display: inline; margin: 0; }
.dettagli-riga dt { font-weight: 650; }
.altri td { font-size: .88em; }
.elenco-rate { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 255px), 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.rata { min-width: 0; padding: 11px 13px; border: 1px solid var(--contorno); border-radius: 8px; overflow-wrap: anywhere; }
.rata-sintesi { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.rata-sintesi strong { color: var(--blu); font-size: 14px; }
.rata-sintesi p { margin: 3px 0 0; color: var(--secondario); }
.rata-sintesi b { max-width: 48%; color: var(--blu); font-size: 16px; text-align: right; }
.rata-dettagli { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 8px 0 0; padding: 6px 0 0; border-top: 1px solid var(--contorno); }
.rata-dettagli div { min-width: 0; }
.rata-dettagli dt { color: var(--secondario); font-size: 11px; }
.rata-dettagli dd { margin: 1px 0 0; white-space: pre-wrap; }

.totale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 10px 14px;
  color: var(--blu);
  background: var(--pannello);
  border-left: 3px solid var(--blu);
  border-radius: 4px;
  overflow-wrap: anywhere;
  break-inside: avoid;
}
.totale small { display: block; color: var(--secondario); }
.totale b { max-width: 60%; text-align: right; font-size: 19px; line-height: 1.2; }
.causali { padding: 9px 12px; background: #f7f9fc; border-left: 2px solid var(--contorno); }
.causali p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--contorno); color: var(--secondario); font-size: 10px; }

@media screen and (max-width: 690px) {
  body { padding: 8px; }
  .foglio { padding: 16px 12px; }
  .tabella-ampia table { min-width: 620px; }
  .blocco[id] { scroll-margin-top: 90px; }
  .righe .scorri { overflow: visible; }
  .righe table { display: block; min-width: 0; }
  .righe colgroup { display: none; }
  .righe thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .righe tbody { display: grid; gap: 9px; }
  .righe tbody tr {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 11px 13px;
    border: 1px solid var(--contorno);
    border-radius: 8px;
    background: #fff;
    gap: 8px 12px;
  }
  .righe td { display: block; padding: 0; border: 0; text-align: left; }
  .righe td:is(:first-child, :nth-child(2), :nth-child(7)) { grid-column: 1 / -1; }
  .righe td:first-child { margin-bottom: -4px; font-size: 11px; font-weight: 650; }
  .righe td:first-child::before { content: "Riga "; }
  .righe td:nth-child(2) { padding-bottom: 8px; border-bottom: 1px solid var(--contorno); }
  .righe td:nth-child(6) { color: var(--blu); font-size: 16px; }
  .righe td:nth-child(7)[data-vuoto] { display: none; }
  .righe td[data-etichetta]::before { display: block; content: attr(data-etichetta); color: var(--secondario); font-size: 11px; font-weight: 600; }
}
@media screen and (max-width: 460px) {
  .testata { flex-wrap: wrap; }
  .numero { text-align: left; }
  .parti { grid-template-columns: minmax(0, 1fr); }
  th, td { padding-inline: 4px; }
}

@media print {
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { padding: 0; background: #fff; font-size: 8.5pt; }
  .foglio { max-width: none; margin: 0; padding: 0; border: none; border-radius: 0; box-shadow: none; }
  .foglio + .foglio { break-before: page; }
  .testata { break-inside: avoid; }
  .testata h1 { font-size: 21pt; }
  .numero strong, .parte h2 { font-size: 11pt; }
  .parti { gap: 9pt; margin-top: 9pt; }
  .parte { padding: 7pt; break-inside: avoid; }
  .parte .etichetta, .dati-testata dt, footer { font-size: 7pt; }
  .dati-testata { margin: 7pt 0; }
  .sezioni-documento { display: none; }
  .blocco { margin: 8pt 0; }
  .blocco h2 { font-size: 10pt; }
  .scorri { overflow: visible; }
  th, td { padding: 3pt 4pt; }
  th { font-size: 7.5pt; }
  .totale { padding: 6pt 8pt; }
  .totale b { font-size: 14pt; }
  .elenco-rate { display: block; }
  .rata { margin-bottom: 4pt; padding: 5pt 7pt; break-inside: avoid; }
  .rata-sintesi strong, .rata-sintesi b { font-size: 9pt; }
  .rata-dettagli dt { font-size: 7pt; }
}
`;
