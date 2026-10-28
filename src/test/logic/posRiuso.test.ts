import { describe, expect, it } from "vitest";
import { applicaRiusoPos, lavorazioniRiutilizzabili } from "../../../supabase/functions/_shared/posRiuso";
import { posVuoto, lavorazioneVuota, normalizzaPos, vociMancanti } from "../../../supabase/functions/_shared/posModello";

function sorgente() {
  const p=posVuoto();
  p.opera.cantiere.via="Vecchio indirizzo";
  p.impresa.datore_lavoro="Datore precedente";
  p.formazione=[{nominativo:"Operaio vecchio",qualifica:"Operaio",base:true,verificata:true,rischi_specifici:true,rischi_cantiere:true,dpi_terza_categoria:true,altro:"",attestati:"Privato"}];
  p.allegati=[{tipo:"altro",nome:"Riservato",file_path:"vecchio/privato.pdf"}];
  p.lavorazioni=[{...lavorazioneVuota("old"),titolo:"Posa",rischi:"Taglio",misure:"Protezione",verificata:true,turni:"08-17",durata_giorni:20,svolgimento:"subappalto",svolgimento_con:"Impresa precedente"}];
  return p;
}
describe("riuso POS senza trascinare il cantiere precedente",()=>{
  it("costruisce uno standard con i soli contenuti tecnici ammessi",()=>{
    const righe=lavorazioniRiutilizzabili({...sorgente(),iter:{firma_datore_il:"2026-01-01"},approvato_il:"ieri"});
    expect(righe[0]).toMatchObject({titolo:"Posa",rischi:"Taglio",misure:"Protezione",origine:"modello",verificata:false,turni:"",durata_giorni:null,svolgimento:"diretto",svolgimento_con:""});
    expect(JSON.stringify(righe)).not.toMatch(/Vecchio indirizzo|Datore precedente|Operaio vecchio|privato.pdf|Impresa precedente|firma_datore/);
  });
  it("mantiene autorevoli i dati correnti della destinazione senza modificare le sorgenti",()=>{
    const da=sorgente(); const a=posVuoto(); a.opera.cantiere.via="Nuovo cantiere";a.impresa.datore_lavoro="Nuovo datore";
    const prima=JSON.stringify(da); const destinazionePrima=JSON.stringify(a);
    const copia=applicaRiusoPos(a,da);
    expect(copia.opera.cantiere.via).toBe("Nuovo cantiere");expect(copia.impresa.datore_lavoro).toBe("Nuovo datore");
    expect(copia.formazione).toEqual([]);expect(copia.allegati).toEqual([]);expect(copia.versione_controlli).toBe(2);
    copia.lavorazioni[0].titolo="Cambiato";
    expect(JSON.stringify(da)).toBe(prima);expect(JSON.stringify(a)).toBe(destinazionePrima);
  });
  it("dopo normalizzazione conserva l'origine e richiede una nuova conferma",()=>{
    const p=normalizzaPos(applicaRiusoPos(posVuoto(),sorgente()));
    expect(p.lavorazioni[0].origine).toBe("modello");
    expect(vociMancanti(p).some(v=>v.testo.includes("ripresa da POS o modello"))).toBe(true);
    p.lavorazioni[0].verificata=true;
    expect(vociMancanti(p).some(v=>v.testo.includes("ripresa da POS o modello"))).toBe(false);
  });
  it("non crea lavorazioni fantasma da un vecchio documento non strutturato",()=>{
    expect(lavorazioniRiutilizzabili({html:"vecchio POS",contenuto_pdf:"private"})).toEqual([]);
  });
});
