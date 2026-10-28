import { describe, expect, it } from 'vitest';
import { assignmentCompanyOptions, type AssignmentTeam, type AssignmentSubcontractor } from '@/lib/orders/assignmentCompanies';
const sub = (id: string, extra: Partial<AssignmentSubcontractor> = {}): AssignmentSubcontractor => ({ id, company_id:'company',ragione_sociale:`Ditta ${id}`,is_active:true,...extra });
const team = (id: string, extra: Partial<AssignmentTeam> = {}): AssignmentTeam => ({id,company_id:'company',name:`Squadra ${id}`,kind:'esterna',is_active:true,subappaltatore_id:null,...extra});
describe('elenco unico ditte e subappaltatori', () => {
  it('rende visibili 18 anagrafiche anche senza nessuna squadra legacy', () => {
    const result=assignmentCompanyOptions('company',[],Array.from({length:18},(_,i)=>sub(String(i))));
    expect(result).toHaveLength(18); expect(result[0].subappaltatoreId).toBeDefined();
  });
  it('non duplica un collegamento esplicito e non fonde omonimi', () => {
    const result=assignmentCompanyOptions('company',[team('linked',{subappaltatore_id:'s1'}),team('homonym',{name:'Ditta s2'})],[sub('s1'),sub('s2')]);
    expect(result.map(option=>option.id)).toEqual(expect.arrayContaining(['linked','homonym','subappaltatore:s2'])); expect(result).toHaveLength(3);
  });
  it('esclude altre aziende, squadre interne e subappaltatori disattivati', () => {
    expect(assignmentCompanyOptions('company',[team('foreign',{company_id:'other'}),team('internal',{kind:'interna'}),team('inactive-sub',{subappaltatore_id:'off'})],[sub('foreign',{company_id:'other'}),sub('off',{is_active:false})])).toEqual([]);
  });
  it('non riattiva implicitamente una ditta disattivata', () => {
    expect(assignmentCompanyOptions('company',[team('off',{subappaltatore_id:'sub',is_active:false})],[sub('sub')])[0].unavailableReason).toContain('disattivata');
  });
});
