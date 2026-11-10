/** Candidati statici: non sostituisce la navigazione UI, non risolve espressioni dinamiche. */
import ts from 'typescript';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const routes = JSON.parse(fs.readFileSync('docs/ux/revisione-azienda/percorsi.json', 'utf8'));
const unique = [...new Set(routes.map(r => r.path.split('?')[0]))];
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function pattern(path) {
  let re = '^';
  for (const segment of path.split('/').filter(Boolean)) {
    if (segment === '*') { re += '(?:/.*)?'; continue; }
    const optional = segment.endsWith('?');
    const value = segment.startsWith(':') ? '[^/]+' : escape(optional ? segment.slice(0, -1) : segment);
    re += optional ? `(?:/${value})?` : `/${value}`;
  }
  return new RegExp(re + '/?$');
}

const direct = unique.filter(p => !p.includes('*')).map(p => ({ path: p, re: pattern(p) }));
const wildcard = unique.filter(p => p.includes('*') && p !== '/azienda/*').map(p => ({ path: p, re: pattern(p) }));
const files = execFileSync('rg', ['-l', '<(Link|NavLink|Navigate)', 'src', '--glob', '*.tsx'], { encoding: 'utf8' }).trim().split('\n').filter(p => p && !p.startsWith('src/test/'));
const links = [];
let dynamic = 0;
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(source);
      if (['Link', 'NavLink', 'Navigate'].includes(tag)) {
        const to = node.attributes.properties.find(a => a.name?.getText(source) === 'to')?.initializer;
        let value = ts.isStringLiteral(to ?? {}) ? to.text : undefined;
        if (to && ts.isJsxExpression(to) && to.expression && (ts.isStringLiteral(to.expression) || ts.isNoSubstitutionTemplateLiteral(to.expression))) value = to.expression.text;
        if (value?.startsWith('/azienda')) {
          const path = value.split(/[?#]/)[0];
          const matched = direct.find(r => r.re.test(path));
          const fallback = !matched && wildcard.find(r => r.re.test(path));
          links.push({ source: file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind: tag, target: value, match: matched?.path ?? fallback?.path ?? null, status: matched ? 'DICHIARATO' : fallback ? 'WILDCARD_DA_APPROFONDIRE' : 'CANDIDATO_DA_VERIFICARE' });
        } else if (!value && to) dynamic++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
fs.writeFileSync('docs/ux/revisione-azienda/collegamenti-statici.json', JSON.stringify({ limitations: 'Solo destinazioni letterali assolute Link/NavLink/Navigate. Non verifica permessi, caricamento, query, frammenti, link HTML o destinazioni dinamiche. Candidati non equivalgono a bug.', dynamicExpressionsSkipped: dynamic, links }, null, 2) + '\n');
console.log(JSON.stringify({ literalLinks: links.length, dynamicExpressionsSkipped: dynamic, candidates: links.filter(l => l.status === 'CANDIDATO_DA_VERIFICARE') }));
