/** Lavorazioni senza forniture e senza prezzi suggeriti: base da personalizzare. */
export interface LavorazioneStandard {
  area: string;
  nome: string;
  unita: "pz" | "mq" | "ml" | "mc" | "h" | "a_corpo";
  descrizione: string;
}
function lavori(area: string, descrizione: string, elenco: string): LavorazioneStandard[] {
  return elenco.split(";").map(r => {
    const [nome, unita = "pz"] = r.split("|");
    return { area, nome, unita: unita as LavorazioneStandard["unita"], descrizione };
  });
}
export const MANODOPERA_STANDARD: LavorazioneStandard[] = [
  ...lavori("serramenti", "Sola lavorazione. Definire dimensioni, accessibilità e fissaggi; fornitura, opere murarie e smaltimento conteggiati separatamente.", "Rilievo misure serramenti|a_corpo;Smontaggio infisso esistente;Installazione nuovo serramento;Installazione oscurante;Registrazione ferramenta;Sigillatura giunto serramento|ml"),
  ...lavori("fotovoltaico", "Sola lavorazione, su configurazione di progetto. Componenti, mezzi di accesso, opere edili e pratiche esclusi salvo voce distinta.", "Rilievo installazione fotovoltaico|a_corpo;Montaggio strutture fotovoltaiche|mq;Montaggio modulo fotovoltaico;Installazione inverter;Installazione accumulo;Verifiche e avviamento fotovoltaico|a_corpo"),
  ...lavori("bagni", "Sola lavorazione, con quantità e perimetro da confermare. Materiali, sanitari, smaltimento e opere impiantistiche non descritte sono separati.", "Rimozione sanitario;Demolizione rivestimento bagno|mq;Impermeabilizzazione zona doccia|mq;Installazione lavabo;Installazione box doccia;Installazione piatto doccia;Montaggio mobile bagno;Sigillature bagno|ml"),
  ...lavori("tetti", "Sola lavorazione. Materiali, ponteggi, sollevamenti, smaltimenti e prestazioni professionali sono voci separate.", "Rimozione manto di copertura|mq;Ripasso tegole esistenti|mq;Posa telo sottotegola|mq;Posa isolamento copertura|mq;Montaggio canale di gronda|ml;Verifica raccordi copertura|a_corpo"),
  ...lavori("ristrutturazione", "Sola lavorazione. Definire quantità, supporti e condizioni del cantiere. Materiali, trasporti, smaltimenti e opere specialistiche sono separati.", "Demolizione divisorio interno|mq;Realizzazione divisorio interno|mq;Montaggio parete a secco|mq;Stesura massetto|mq;Rasatura parete interna|mq;Tinteggiatura interna|mq;Protezione locali di cantiere|mq"),
  ...lavori("climatizzazione", "Sola lavorazione su impianto dimensionato. Apparecchi, tubazioni, accessori, opere murarie e mezzi di accesso sono separati.", "Installazione unità interna climatizzazione;Installazione unità esterna climatizzazione;Posa linea frigorifera|ml;Montaggio canalizzazione aria|ml;Pulizia unità climatizzazione;Verifiche e avviamento climatizzazione|a_corpo"),
  ...lavori("termoidraulico", "Sola lavorazione, secondo progetto e compatibilità rilevata. Generatori, componenti, opere edili e smaltimento esclusi.", "Rimozione generatore esistente;Installazione caldaia;Installazione pompa di calore;Installazione bollitore;Posa circuito radiante|mq;Installazione radiatore;Posa tubazione idrica|ml;Verifiche e avviamento termoidraulico|a_corpo"),
  ...lavori("elettrico", "Sola lavorazione secondo schema e progetto. Componenti, cavi, apparecchi e ripristini edili sono conteggiati separatamente.", "Posa canalizzazione elettrica|ml;Stesura cavi elettrici|ml;Montaggio punto presa;Montaggio punto luce;Cablaggio quadro elettrico|a_corpo;Configurazione domotica|h;Verifiche impianto elettrico|a_corpo"),
  ...lavori("pavimenti", "Sola lavorazione. Materiali, collanti, profili, smaltimento e preparazioni non descritte sono separati.", "Rimozione pavimentazione|mq;Preparazione fondo di posa|mq;Posa pavimento in gres|mq;Posa pavimento flottante|mq;Levigatura parquet|mq;Applicazione ciclo resina|mq;Montaggio profili pavimento|ml"),
  ...lavori("piscine", "Sola lavorazione su progetto confermato. Componenti, opere strutturali, mezzi d'opera, scavi e forniture non descritte sono separati.", "Montaggio struttura piscina|a_corpo;Posa rivestimento piscina|mq;Installazione filtrazione piscina|a_corpo;Posa rete idraulica piscina|ml;Montaggio copertura piscina|a_corpo;Verifiche e avviamento piscina|a_corpo"),
  ...lavori("cappotto", "Sola lavorazione su ciclo di sistema definito. Isolanti, collanti, tasselli, finiture, ponteggi e opere non descritte sono separati.", "Preparazione supporto facciata|mq;Posa pannelli isolanti facciata|mq;Tassellatura isolamento|mq;Rasatura armata facciata|mq;Applicazione finitura facciata|mq;Posa isolamento interno|mq;Ripristino localizzato facciata|mq"),
];
