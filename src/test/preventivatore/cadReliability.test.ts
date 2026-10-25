import { describe, expect, it } from 'vitest';
import { affidabilitaDisegno, fattoreScalaCad, misureCadPronte } from '@/lib/distinta/cad/affidabilitaDisegno';
import type { DisegnoCad } from '@/lib/distinta/cad/leggiDxf';

const drawing = (patch: Partial<DisegnoCad> = {}): DisegnoCad => ({ versione:'AC1032', insunits:4, layer:['CAVI'],
  testi:[], blocchi:[], contorni:[], tratti:[], cerchi:[], entita:{}, ...patch });
const text = (s: string) => ({s,layer:'PDF_Text',x:0,y:0,h:1});
describe('CAD quantities require source and scope verification', () => {
  it('keeps native drawing units without treating every empty block list as PDF', () => {
    expect(affidabilitaDisegno(drawing())).toEqual({pdfImportato:false,statiSovrapposti:false,richiedeCalibrazione:false});
    expect(misureCadPronte(drawing(),'1',false)).toBe(true);
  });
  it.each(['PDF_Text','PDF3_Strutturale - Portante','xref|PDF2_CAVI'])('requires calibration for imported-PDF layer %s even if the header declares mm', layer => {
    const d=drawing({layer:[layer]});
    expect(affidabilitaDisegno(d).pdfImportato).toBe(true);
    expect(misureCadPronte(d,'200',false)).toBe(false);
    expect(misureCadPronte(d,'200',true)).toBe(true);
  });
  it('requires explicit unit verification if the header omits a supported unit', () => {
    expect(misureCadPronte(drawing({insunits:0}),'1',false)).toBe(false);
    expect(misureCadPronte(drawing({insunits:0}),'1',true)).toBe(true);
  });
  it('does not sum existing and proposed states even after scale confirmation', () => {
    const d=drawing({layer:['PDF3_Text'],testi:[text(' Stato   di fatto '),text('STATO DI PROGETTO')]});
    expect(affidabilitaDisegno(d).statiSovrapposti).toBe(true);
    expect(misureCadPronte(d,'200',true)).toBe(false);
  });
  it.each(['',' ','0','-2','NaN','Infinity','1e309','1e3','0x10','200x','1,2,3'])('does not silently replace invalid scale %s with 1', value => {
    expect(fattoreScalaCad(value)).toBeNull(); expect(misureCadPronte(drawing(),value,true)).toBe(false);
  });
  it.each([['1',1],['200',200],[' 2,5 ',2.5],['.5',0.5]] as const)('accepts a finite decimal scale %s', (value,expected) => expect(fattoreScalaCad(value)).toBe(expected));
});
