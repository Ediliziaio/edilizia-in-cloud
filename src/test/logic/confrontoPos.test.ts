import { describe, expect, it } from 'vitest';
import { posVuoto, lavorazioneVuota } from '../../../supabase/functions/_shared/posModello';
import { applicaConfrontoPos, confrontaPos, testoConfrontoPos, type CampoConfrontoPos } from '@/lib/sicurezza/confrontoPos';

describe('Confronto consapevole delle fonti POS',()=>{
 it('non applica nessuna differenza senza selezione e conserva gli adattamenti tecnici',()=>{
  const a=posVuoto(),b=posVuoto();a.opera.turni_lavoro='8–17';a.opera.modalita_organizzative='Misure particolari';a.lavorazioni=[lavorazioneVuota('manuale')];a.rumore.esito='Valutato dal tecnico';a.allegati=[{nome:'Valutazione',tipo:'altro',file_path:'privato'}];b.impresa.ragione_sociale='Aggiornata';
  expect(confrontaPos(a,b).map(d=>d.campo)).toEqual(['impresa.ragione_sociale']);expect(applicaConfrontoPos(a,b,[])).toEqual(a);
  const nuovo=applicaConfrontoPos(a,b,['impresa.ragione_sociale']);expect(nuovo.impresa.ragione_sociale).toBe('Aggiornata');expect(nuovo.lavorazioni).toEqual(a.lavorazioni);expect(nuovo.rumore).toEqual(a.rumore);expect(nuovo.allegati).toEqual(a.allegati);expect(nuovo.opera.turni_lavoro).toBe('8–17');expect(nuovo.opera.modalita_organizzative).toBe('Misure particolari');expect(a.impresa.ragione_sociale).toBe('');
 });
 it('mostra figure e persone non più rilevate e le rimuove soltanto su scelta esplicita',()=>{
  const a=posVuoto(),b=posVuoto();a.preposti=[{nominativo:'Preposto precedente',mansioni_sicurezza:'Vigilanza',ruolo:'capocantiere',ruolo_altro:''}];a.lavoratori=[{qualifica:'Muratori',numero:2,note:''}];a.opera.responsabile_lavori={nominativo:'Responsabile',indirizzo:'',telefono:'',email:'',codice_fiscale:''};
  const diff=confrontaPos(a,b);expect(diff.filter(d=>d.nonRilevato).map(d=>d.campo)).toEqual(['opera.responsabile_lavori','preposti','lavoratori']);
  const nuovo=applicaConfrontoPos(a,b,['preposti']);expect(nuovo.preposti).toEqual([]);expect(nuovo.lavoratori).toEqual(a.lavoratori);expect(nuovo.opera.responsabile_lavori).toEqual(a.opera.responsabile_lavori);
 });
 it('revoca la verifica formazione dopo una modifica dei lavoratori anche se non si sostituiscono gli attestati',()=>{
  const a=posVuoto(),b=posVuoto();a.formazione=[{nominativo:'Mario',qualifica:'Operaio',base:true,rischi_specifici:true,rischi_cantiere:true,dpi_terza_categoria:false,altro:'',attestati:'Controllati',verificata:true}];b.lavoratori=[{qualifica:'Operai',numero:3,note:''}];
  expect(applicaConfrontoPos(a,b,['lavoratori']).formazione[0].verificata).toBe(false);expect(a.formazione[0].verificata).toBe(true);
 });
 it('non sostituisce campi non autorizzati né permette di introdurre percorsi arbitrari',()=>{
  expect(()=>applicaConfrontoPos(posVuoto(),posVuoto(),['allegati' as CampoConfrontoPos])).toThrow(/non consentito/);
  expect(()=>applicaConfrontoPos(posVuoto(),posVuoto(),['__proto__.x' as CampoConfrontoPos])).toThrow(/non consentito/);
 });
 it('confronta oggetti indipendentemente dall’ordine delle proprietà e rende i valori leggibili',()=>{
  const a=posVuoto(),b=posVuoto();b.opera.cantiere={provincia:'',localita:'',via:''};expect(confrontaPos(a,b)).toEqual([]);expect(testoConfrontoPos([{nominativo:'Mario',verificata:false}])).toContain('Formazione verificata: No');
 });
});
