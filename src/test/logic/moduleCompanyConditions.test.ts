import { describe, expect, it } from 'vitest';
import { ereditaCondizioniModello } from '@/lib/moduli-vendita/condizioniModello';
import { createFullRstTemplate, FULL_RST_MODULES, FULL_PARETI_SOFFITTI_MODULES, FULL_PERGOLE_MODULES, FULL_FACCIATE_MODULES } from '@/lib/moduli-vendita/fullRstModules';
import { createFullBgnTemplate, FULL_BGN_MODULES } from '@/lib/moduli-vendita/fullBgnModules';
import { createFullTettiTemplate, FULL_TETTI_MODULES } from '@/lib/moduli-vendita/fullTettiModules';
import { createFullFvTemplate, FULL_FV_MODULES } from '@/lib/moduli-vendita/fullFvModules';
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES } from '@/lib/moduli-vendita/fullSerramentiModules';
import { createFullClmTemplate, FULL_CLM_MODULES } from '@/lib/moduli-vendita/fullClmModules';
import { createFullEltTemplate, FULL_ELT_MODULES } from '@/lib/moduli-vendita/fullEltModules';
import { createFullIdrTemplate, FULL_IDR_MODULES } from '@/lib/moduli-vendita/fullIdrModules';
import { createFullPavTemplate, FULL_PAV_MODULES, FULL_GIARDINI_MODULES } from '@/lib/moduli-vendita/fullPavModules';
import { createFullPscTemplate, FULL_PSC_MODULES } from '@/lib/moduli-vendita/fullPscModules';

const text = '<h2>ART. 1 OGGETTO</h2><p>Condizioni aziendali configurate</p>';
const base = { id: 'online', company_id: 'qa', condizioni_legali_testo: text, condizioni_legali_attivo: true,
  modulo_recesso_attivo: false, default_iva_pct: 22 };
const check = (model: Parameters<typeof ereditaCondizioniModello>[0]) => {
  expect(model.condizioni_legali_testo).toBe(text);
  expect(model.condizioni_legali_attivo).toBe(true);
  expect(model.modulo_recesso_attivo).toBe(false);
};
describe('Condizioni aziendali nei moduli grafici', () => {
  it('non introduce condizioni o consensi quando non sono configurati', () => {
    expect(ereditaCondizioniModello({})).toEqual({ condizioni_legali_testo: null, condizioni_legali_attivo: false, modulo_recesso_attivo: false });
    expect(ereditaCondizioniModello({ ...base, condizioni_legali_attivo: false }).condizioni_legali_attivo).toBe(false);
  });
  it('le mantiene in tutte le edizioni Ristrutturazioni, Pareti, Pergole e Facciate', () => {
    for (const id of [...FULL_RST_MODULES, ...FULL_PARETI_SOFFITTI_MODULES, ...FULL_PERGOLE_MODULES, ...FULL_FACCIATE_MODULES]) check(createFullRstTemplate(base as never, id));
  });
  it('le mantiene in tutti i Bagni', () => { for (const id of FULL_BGN_MODULES) check(createFullBgnTemplate(base as never,id)); });
  it('le mantiene in tutti i Tetti, compreso il rifacimento', () => { for (const id of FULL_TETTI_MODULES) check(createFullTettiTemplate(base as never,id)); });
  it('le mantiene nel Fotovoltaico', () => { for (const id of FULL_FV_MODULES) check(createFullFvTemplate(base as never,'qa',id)); });
  it('le mantiene nei Serramenti', () => { for (const id of FULL_SERRAMENTI_MODULES) check(createFullSerramentiTemplate(base as never,id) as ReturnType<typeof ereditaCondizioniModello>); });
  it('le mantiene in Climatizzazione', () => { for (const id of FULL_CLM_MODULES) check(createFullClmTemplate(base as never,id)); });
  it('le mantiene in Elettrico', () => { for (const id of FULL_ELT_MODULES) check(createFullEltTemplate(base as never,id)); });
  it('le mantiene in Termoidraulica', () => { for (const id of FULL_IDR_MODULES) check(createFullIdrTemplate(base as never,id)); });
  it('le mantiene nei Pavimenti e nei Giardini', () => { for (const id of [...FULL_PAV_MODULES, ...FULL_GIARDINI_MODULES]) check(createFullPavTemplate(base as never,id)); });
  it('le mantiene nelle Piscine', () => { for (const id of FULL_PSC_MODULES) check(createFullPscTemplate(base as never,id)); });
});
