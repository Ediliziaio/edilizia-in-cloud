export interface RigaRiepilogo { aliquota: string | number; natura?: string; imponibile: number; iva: number }
/** Group in cents; preserve exemptions/reverse charge instead of folding every zero rate together. */
export function riepilogoPerTrattamentoIva(rows: RigaRiepilogo[]) {
  const groups = new Map<string, { aliquota: string; natura: string; imponibile: number; iva: number }>();
  for (const r of rows) {
    const aliquota = String(r.aliquota || '0'), natura = r.natura || '';
    const key = JSON.stringify([aliquota,natura]);
    const group = groups.get(key) ?? { aliquota,natura,imponibile:0,iva:0 };
    group.imponibile += Math.round(r.imponibile * 100);
    group.iva += Math.round(r.iva * 100);
    groups.set(key,group);
  }
  return [...groups.values()].map(r=>({...r,imponibile:r.imponibile/100,iva:r.iva/100}));
}
