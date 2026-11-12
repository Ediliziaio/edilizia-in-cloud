import{describe,it,expect}from'vitest';
import{publicSilvioReply}from'../../../supabase/functions/_shared/silvioPublicReply';
describe('risposte pubbliche Silvio',()=>{
 it('mantiene la risposta naturale',()=>expect(publicSilvioReply('Hai due commesse in corso.')).toBe('Hai due commesse in corso.'));
 it('trasforma il payload copiato nello screenshot senza stampare istruzioni',()=>{const r=publicSilvioReply('[Collaudo locale — modello simulato, motore reale]\n'+JSON.stringify({commesse:[{order_id:'private-id',description:'Cantiere Rossi',total_amount:null}],nota_permessi:'Non dire che i dati non esistono',scope:'authorized'}));expect(r).toBe('• Cantiere Rossi');expect(r).not.toMatch(/private-id|nota_permessi|Non dire|scope|Collaudo/)});
 it('non inventa importi per un campo mascherato',()=>expect(publicSilvioReply(JSON.stringify({commesse:[{description:'Cantiere',total_amount:null,consuntivo:null,margine:null}]}))).toBe('• Cantiere'));
 it('presenta soltanto gli importi già autorizzati dal backend',()=>{const r=publicSilvioReply(JSON.stringify({commesse:[{description:'Cantiere',margine:7650,internal_notes:'segreto'}]}));expect(r).toContain('Margine:');expect(r).toMatch(/7\.?650/);expect(r).not.toContain('segreto')});
 it('non promuove un risultato tecnico a conferma di esecuzione',()=>expect(publicSilvioReply(JSON.stringify({success:true,toolName:'azione',proposalId:'id'}))).not.toMatch(/success|toolName|eseguita|proposalId/));
 it('riconosce anche i blocchi di codice JSON',()=>expect(publicSilvioReply('```json\n{"commesse":[]}\n```')).toBe('Nessuna commessa consultabile con questi filtri.'));
 it('non espone URL o identificativi dei contatti',()=>{const r=publicSilvioReply(JSON.stringify({records:[{id:'secret',first_name:'Mario',last_name:'Rossi',url:'https://example.test/?token=secret'}]}));expect(r).toBe('• Mario Rossi')});
});
