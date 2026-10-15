import { describe, expect, it } from 'vitest';
import { contrattoInHtml, leggiTestoRiccoContratto, separaFirmeContratto } from '../../../supabase/functions/_shared/testoRiccoContratto';

describe('Contratti visuali condivisi',()=>{
  it('mantiene dimensioni diverse, font, colore e decorazioni nella stessa riga',()=>{
    const [r]=leggiTestoRiccoContratto('<p style="text-align:justify;line-height:1.3;margin-bottom:8pt">Testo <span style="font-size:8pt;font-family:Georgia, serif;color:#123456"><em><u>piccolo</u></em></span> normale</p>');
    expect(r.testo).toBe('Testo piccolo normale');
    expect(r).toMatchObject({allineamento:'justify',interlinea:1.3,spazioDopo:8});
    expect(r.parti?.[1].stile).toMatchObject({dimensione:8,famiglia:'times',colore:'#123456',corsivo:true,sottolineato:true});
    expect(leggiTestoRiccoContratto(contrattoInHtml([r]))[0]).toMatchObject({testo:r.testo});
  });
  it('converte i modelli Markdown senza perdere articoli e campi',()=>{
    const rows=leggiTestoRiccoContratto('# Contratto\n## ART. 1\nCliente {{cliente.nome_completo}} **importante**\n- Garanzia');
    expect(rows.map(r=>r.tipo)).toEqual(['h1','h2','p','li']);
    expect(contrattoInHtml(rows)).toContain('{{cliente.nome_completo}}');
    expect(rows[2].parti?.some(p=>p.stile.grassetto)).toBe(true);
  });
  it('sposta solo le righe firma bianche riconoscibili, preservando il testo precedente',()=>{
    const rows=leggiTestoRiccoContratto('## ART. 25 ALLEGATI\nConferma e documenti. Luogo e data __________________ Firma del cliente (per approvazione) __________ Il Legale Rappresentante (Borgato Luigi) __________');
    const result=separaFirmeContratto(rows);
    expect(result.firmeRilevate).toBe(true);
    expect(result.righe.at(-1)?.testo).toBe('Conferma e documenti.');
    expect(separaFirmeContratto(leggiTestoRiccoContratto('Il cliente deve firmare i verbali.')).firmeRilevate).toBe(false);
  });
  it('ignora script e stili non supportati, limita le dimensioni',()=>{
    const rows=leggiTestoRiccoContratto('<script>secret()</script><p><span style="font-size:1000pt;position:fixed;color:url(x)">Visibile</span></p>');
    expect(rows[0].testo).toBe('Visibile');
    expect(rows[0].parti?.[0].stile).toEqual({dimensione:28});
  });
  it('mantiene gli elenchi numerati di Tiptap',()=>{
    expect(leggiTestoRiccoContratto('<ol><li><p>Uno</p></li><li><p>Due</p></li></ol>').map(r=>r.testo)).toEqual(['1. Uno','2. Due']);
  });
});
