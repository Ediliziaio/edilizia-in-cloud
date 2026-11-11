/** Inventario statico: NON sostituisce il collaudo UI. Non legge .env o dati aziendali. */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const out = path.join(root, 'docs/ux/revisione-azienda');
fs.mkdirSync(out, { recursive: true });
const file = 'src/routes/companyRoutes.tsx';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const previous = fs.existsSync(path.join(out, 'percorsi.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'percorsi.json'), 'utf8')) : [];
const rows = [];
function visit(node, parent = '/azienda') {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (opening.tagName.getText(source) === 'Route') {
      const attrs = opening.attributes.properties;
      const attr = attrs.find(a => a.name?.getText(source) === 'path');
      const index = attrs.some(a => a.name?.getText(source) === 'index');
      const value = attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : '';
      const full = value.startsWith('/') ? value : parent + (value ? '/' + value : '');
      const element = attrs.find(a => a.name?.getText(source) === 'element')?.initializer?.getText(source) || '';
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const old = previous.find(r => r.path === full && r.index === index);
      rows.push({ path: full, index, source: file, line, type: element.includes('Navigate') || /Rimando|Redirect/.test(element) ? 'Reindirizzamento' : 'Pagina', element: element.slice(0,250), status: old?.status ?? 'DA VERIFICARE', notes: old?.notes ?? '' });
      if (ts.isJsxElement(node)) for (const child of node.children) visit(child, full);
      return;
    }
  }
  ts.forEachChild(node, n => visit(n, parent));
}
visit(source);
// Il modulo usa segmenti propri sotto una route wildcard.
const cgFile = 'src/pages/azienda/ControlloGestione.tsx';
const cg = ts.createSourceFile(cgFile, fs.readFileSync(cgFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function cgVisit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(cg) === 'URL_TO_TAB' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const prop of node.initializer.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const segment = ts.isStringLiteral(prop.name) ? prop.name.text : prop.name.getText(cg);
      const full = '/azienda/controllo-gestione/' + segment;
      const old = previous.find(r => r.path === full);
      rows.push({ path: full, index: false, source: cgFile, line: cg.getLineAndCharacterOfPosition(prop.getStart(cg)).line + 1, type: 'Scheda con URL', status: old?.status ?? 'DA VERIFICARE', notes: old?.notes ?? '' });
    }
  }
  ts.forEachChild(node, cgVisit);
}
cgVisit(cg);
// Le aree della commessa hanno sottoviste in query, non nuove Route JSX.
const orderFile = 'src/lib/orders/detailNavigation.ts';
const orderSource = ts.createSourceFile(orderFile, fs.readFileSync(orderFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const queryViews = {
  ORDER_DETAIL_TABS: { tab: null, parameter: null },
  CANTIERE_VIEWS: { tab: 'cantiere', parameter: 'vista_cantiere' },
  MATERIALI_VIEWS: { tab: 'articoli', parameter: 'vista_materiali' },
  COSTI_VIEWS: { tab: 'costi', parameter: 'vista_costi' },
  ECONOMIA_VIEWS: { tab: 'finanza', parameter: 'vista_economia' },
};
function orderVisit(node) {
  if (ts.isVariableDeclaration(node) && queryViews[node.name.getText(orderSource)] && node.initializer) {
    const config = queryViews[node.name.getText(orderSource)];
    let array = node.initializer;
    while (ts.isAsExpression(array) || ts.isSatisfiesExpression(array)) array = array.expression;
    if (ts.isArrayLiteralExpression(array)) for (const entry of array.elements) {
      if (!ts.isObjectLiteralExpression(entry)) continue;
      const stringProp = key => {
        const p = entry.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(orderSource) === key);
        return p && ts.isStringLiteral(p.initializer) ? p.initializer.text : '';
      };
      const value = stringProp('value');
      const full = '/azienda/ordini/:id?tab=' + (config.tab ?? value) + (config.parameter ? '&' + config.parameter + '=' + value : '');
      const old = previous.find(r => r.path === full);
      rows.push({ path: full, index: false, source: orderFile, line: orderSource.getLineAndCharacterOfPosition(entry.getStart(orderSource)).line + 1, type: 'Scheda con query', element: stringProp('label'), status: old?.status ?? 'DA VERIFICARE', notes: old?.notes ?? '' });
    }
  }
  ts.forEachChild(node, orderVisit);
}
orderVisit(orderSource);
fs.writeFileSync(path.join(out, 'percorsi.json'), JSON.stringify(rows, null, 2)+'\n');
const intro = '# Revisione area Azienda\n\nBase: 033e0b7dd (sincronizzazione del 10/11; verifiche precedenti conservate come parziali). Ambiente UI: localhost:8096, Demo Azienda 2.\n\nInventario statico riproducibile con `node scripts/ux/mappa-area-azienda.mjs`. Include layout, alias e schede con URL/query: il numero di righe non equivale al numero di pagine distinte. Gli stati DA VERIFICARE non indicano un collaudo. Invii reali, pagamenti, firme, permessi e cancellazioni non vengono eseguiti.\n\n';
fs.writeFileSync(path.join(out, 'checklist.md'), intro + '| Percorso | Tipo | Sorgente:riga | Stato UI | Flussi / limiti |\n|---|---|---|---|---|\n' + rows.map(r=>`| \`${r.path}${r.index?' (index)':''}\` | ${r.type} | ${r.source}:${r.line} | ${r.status} | ${r.notes || '—'} |`).join('\n')+'\n');
console.log(`${rows.length} voci inventariate; ${rows.filter(r=>r.status === 'DA VERIFICARE').length} ancora da verificare.`);
