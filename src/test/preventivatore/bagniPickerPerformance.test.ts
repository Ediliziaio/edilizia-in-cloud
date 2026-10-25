import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
const source = ts.createSourceFile('useBagniListino.ts', readFileSync('src/hooks/useBagniListino.ts', 'utf8'), ts.ScriptTarget.Latest, true);
describe('Le ricerche Bagni non partono per selettori chiusi', () => {
  it.each(['usePrefillFromArticolo', 'usePrefillFromTariffa', 'useListinoVociSearch'])('%s rispetta enabled e mantiene il default degli altri chiamanti', name => {
    const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
    const code = declaration.getText(source).replace(/^export /, '');
    const context = vm.createContext({ useEffectiveCompanyId: () => 'demo2', useQuery: (options: unknown) => options,
      K: { articoliSearch: (): string[] => [], tariffeSearch: (): string[] => [], vociSearch: (): string[] => [] } });
    vm.runInContext(ts.transpileModule(`${code}\nglobalThis.runHook = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    const args = name === 'useListinoVociSearch' ? ['', null] : [''];
    expect(context.runHook(...args, false).enabled).toBe(false);
    expect(context.runHook(...args, true).enabled).toBe(true);
    expect(context.runHook('').enabled).toBe(true);
  });
  it('mantiene il filtro per capitolo introdotto su main insieme al caricamento su richiesta', async () => {
    const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useListinoVociSearch')!;
    const filters: [string, unknown][] = [];
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      order: () => chain,
      limit: async () => ({ data: [] as never[], error: null as null }),
    };
    const context = vm.createContext({ useEffectiveCompanyId: () => 'demo2', useQuery: (options: unknown) => options,
      K: { vociSearch: (...args: unknown[]) => args }, sb: () => ({ from: () => chain }), termineDiRicerca: () => '' });
    vm.runInContext(ts.transpileModule(`${declaration.getText(source).replace(/^export /, '')}\nglobalThis.runHook = useListinoVociSearch;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    const query = context.runHook('', 'capitolo-posa', true);
    expect(query.queryKey).toEqual(['demo2', '', 'capitolo-posa']);
    await query.queryFn();
    expect(filters).toContainEqual(['company_id', 'demo2']);
    expect(filters).toContainEqual(['capitolo_id', 'capitolo-posa']);
  });
});
