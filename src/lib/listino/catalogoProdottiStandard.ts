/**
 * Basi merceologiche riutilizzabili, non listini commerciali di un produttore.
 * Solo forniture fisiche. Nessun prezzo, marchio, prestazione certificata o foto
 * inventati. Le schede nascono disattivate e vanno completate dall'azienda.
 */
export interface ProdottoStandard {
  nome: string;
  unita: "pz" | "mq" | "ml" | "kg" | "mc";
}
export interface GruppoProdottiStandard {
  area: string;
  tipologia: string;
  verifiche: string;
  prodotti: ProdottoStandard[];
}
function gruppo(area: string, tipologia: string, verifiche: string, elenco: string): GruppoProdottiStandard {
  return { area, tipologia, verifiche, prodotti: elenco.split(";").map(voce => {
    const [nome, unita = "pz"] = voce.split("|");
    return { nome, unita: unita as ProdottoStandard["unita"] };
  }) };
}
export const CATALOGO_PRODOTTI_STANDARD: GruppoProdottiStandard[] = [
  gruppo("serramenti", "Accessori", "Compatibilità con serramento, attacchi e finitura", "Maniglia per serramento;Motore tubolare per avvolgibile;Controtelaio per serramento;Kit guarnizioni per serramento"),
  gruppo("bagni", "Vasche", "Ingombro, materiale, scarico e accessibilità", "Vasca rettangolare da incasso;Vasca freestanding;Vasca con sportello di accesso"),
  gruppo("bagni", "Box doccia", "Misure del vano, apertura, spessore vetro e finitura profili", "Parete doccia walk-in;Box doccia angolare scorrevole;Porta doccia per nicchia;Box doccia pieghevole"),
  gruppo("bagni", "Piatti doccia", "Misure, quota di posa, antiscivolo dichiarato e posizione scarico", "Piatto doccia filo pavimento;Piatto doccia in ceramica;Piatto doccia in resina;Pannello doccia piastrellabile"),
  gruppo("bagni", "Sanitari", "Ingombri, attacchi, scarico e compatibilità dei supporti", "WC sospeso;WC a terra;Bidet sospeso;Bidet a terra;Telaio e cassetta da incasso;Sedile WC"),
  gruppo("bagni", "Lavabi", "Misure, fori rubinetteria, troppo pieno e sostegno", "Lavabo da appoggio;Lavabo sospeso;Lavabo da incasso;Lavatoio"),
  gruppo("bagni", "Mobili bagno", "Larghezza, profondità, finitura, ferramenta e compatibilità lavabo", "Mobile bagno sospeso;Mobile bagno a terra;Colonna contenitore bagno;Piano per lavabo"),
  gruppo("bagni", "Rubinetteria", "Attacchi, portata dichiarata, finitura e corpo da incasso", "Miscelatore lavabo;Miscelatore bidet;Miscelatore doccia esterno;Miscelatore doccia da incasso;Rubinetto vasca"),
  gruppo("bagni", "Rivestimenti", "Formato, spessore, finitura, lotto e superficie da rivestire", "Rivestimento ceramico bagno|mq;Rivestimento gres bagno|mq;Mosaico per bagno|mq;Grande lastra per parete bagno|mq"),
  gruppo("bagni", "Pavimenti", "Formato, finitura, idoneità all'acqua dichiarata e compatibilità del fondo", "Pavimento bagno in gres|mq;Pavimento bagno in pietra|mq;Pavimento bagno SPC|mq;Laminato idoneo al bagno|mq"),
  gruppo("bagni", "Sistemi doccia", "Compatibilità impianto, portata di scarico e tenuta dei raccordi", "Colonna doccia;Soffione doccia;Canalina doccia;Piletta e sifone doccia"),
  gruppo("bagni", "Specchi e illuminazione", "Ingombri, alimentazione, protezione e posizione di installazione", "Specchio bagno;Specchiera con illuminazione;Applique bagno;Lampada per specchio"),
  gruppo("bagni", "Termoarredi", "Dimensioni, attacchi, alimentazione e resa dichiarata", "Scaldasalviette idraulico;Scaldasalviette elettrico;Scaldasalviette misto"),
  gruppo("bagni", "Materiali di posa", "Supporto, ciclo compatibile, consumo e confezione", "Collante per rivestimenti bagno|kg;Stucco per fughe bagno|kg;Impermeabilizzante bagno|kg;Banda impermeabile per raccordi|ml"),
  gruppo("bagni", "Accessori", "Materiale, finitura, fissaggi e posizione di utilizzo", "Portasciugamani;Portarotolo;Maniglione di sostegno;Sedile ribaltabile doccia"),
  gruppo("tetti", "Manti di copertura", "Geometria, peso, pendenza e compatibilità con il supporto", "Tegola in laterizio;Coppo;Lastra metallica di copertura|mq;Pannello sandwich per tetto|mq"),
  gruppo("tetti", "Isolanti per coperture", "Spessore e prestazioni dichiarate, carichi e stratigrafia", "Pannello isolante in lana minerale per tetto|mq;Pannello in fibra di legno per tetto|mq;Pannello sintetico per copertura|mq"),
  gruppo("tetti", "Membrane e teli", "Supporto, sovrapposizioni e comportamento al vapore previsto", "Membrana impermeabile per copertura|mq;Freno al vapore per tetto|mq;Telo traspirante sottotegola|mq"),
  gruppo("tetti", "Orditure e supporti", "Sezione, lunghezze, materiale e specifiche del progetto", "Trave per copertura|ml;Tavolato per tetto|mq;Listello sottotegola|ml;Pannello di supporto copertura|mq"),
  gruppo("tetti", "Lattoneria", "Materiale, sviluppo, spessore, colore e raccordi", "Canale di gronda|ml;Pluviale|ml;Scossalina|ml;Bocchettone di scarico tetto"),
  gruppo("tetti", "Finestre da tetto", "Dimensioni del foro, pendenza, apertura e raccordo al manto", "Finestra da tetto;Lucernario;Raccordo di posa per finestra da tetto;Oscurante per finestra da tetto"),
  gruppo("tetti", "Sicurezza in copertura", "Configurazione e documentazione da verificare con il progettista", "Kit linea vita;Dispositivo di ancoraggio;Accesso di ispezione copertura"),
  gruppo("tetti", "Accessori copertura", "Compatibilità con manto e sistema di fissaggio", "Colmo per copertura;Fermaneve;Aeratore per tetto;Fissaggio per manto di copertura"),
  gruppo("ristrutturazione", "Murature e divisori", "Spessore, formato, destinazione e quantità di progetto", "Laterizio per tramezzo;Blocco alleggerito per divisorio;Blocco per muratura"),
  gruppo("ristrutturazione", "Sistemi a secco", "Tipo di lastra, spessore e composizione del sistema", "Lastra in gesso rivestito|mq;Lastra per ambiente umido|mq;Profilo per parete a secco|ml;Pannello isolante per divisorio|mq"),
  gruppo("ristrutturazione", "Leganti e sottofondi", "Supporto, spessore, tempi dichiarati e consumo", "Malta premiscelata|kg;Massetto premiscelato|kg;Autolivellante per sottofondo|kg;Aggregato per impasto|mc"),
  gruppo("ristrutturazione", "Intonaci e rasanti", "Supporto, granulometria, ciclo e spessore", "Intonaco di fondo|kg;Rasante per interni|kg;Rete di armatura intonaco|mq;Paraspigolo per intonaco|ml"),
  gruppo("ristrutturazione", "Pitture e finiture", "Supporto, colore, resa dichiarata e ciclo applicativo", "Primer per interni|kg;Idropittura per interni|kg;Smalto per finiture|kg;Finitura decorativa per interni|kg"),
  gruppo("ristrutturazione", "Materiali di protezione", "Superficie da proteggere, durata e compatibilità degli adesivi", "Telo di protezione cantiere|mq;Nastro di mascheratura|ml;Protezione per pavimenti|mq"),
  gruppo("climatizzazione", "Climatizzatori monosplit", "Abbinamento delle unità, potenza di progetto e alimentazione", "Kit climatizzatore monosplit a parete;Kit monosplit a pavimento"),
  gruppo("climatizzazione", "Sistemi multisplit", "Compatibilità e combinazioni ammesse dal produttore", "Unità esterna multisplit;Unità interna a parete multisplit;Unità interna a cassetta multisplit"),
  gruppo("climatizzazione", "Sistemi canalizzati", "Portata, prevalenza, ingombri e dimensionamento dei canali", "Unità interna canalizzata;Plenum per canalizzato;Bocchetta di mandata aria;Canale di distribuzione aria|ml"),
  gruppo("climatizzazione", "Ventilazione meccanica", "Portata, recupero dichiarato, filtrazione e manutenzione", "VMC puntuale;VMC centralizzata;Filtro di ricambio VMC;Griglia aria esterna"),
  gruppo("climatizzazione", "Linee e scarichi", "Diametri, isolamento, tracciato e dislivelli", "Tubazione frigorifera coibentata|ml;Tubo scarico condensa|ml;Pompa scarico condensa;Coibentazione tubazioni clima|ml"),
  gruppo("climatizzazione", "Regolazione clima", "Protocollo, alimentazione e compatibilità degli apparecchi", "Comando ambiente climatizzazione;Sonda temperatura clima;Gateway climatizzazione"),
  gruppo("climatizzazione", "Accessori climatizzazione", "Carico, supporto e dimensioni dell'unità", "Staffa per unità esterna;Supporto a pavimento climatizzatore;Kit antivibranti;Canalina climatizzazione|ml"),
  gruppo("termoidraulico", "Caldaie", "Potenza di progetto, combustibile, attacchi e sistema fumario", "Caldaia murale;Caldaia a basamento;Kit fumario per caldaia"),
  gruppo("termoidraulico", "Pompe di calore", "Potenza, temperature di progetto, alimentazione e ingombri", "Pompa di calore monoblocco;Pompa di calore split;Modulo idraulico per pompa di calore"),
  gruppo("termoidraulico", "Sistemi ibridi", "Abbinamento approvato, regolazione e integrazione all'impianto", "Sistema ibrido abbinato;Modulo di integrazione ibrido;Regolatore per sistema ibrido"),
  gruppo("termoidraulico", "Acqua calda sanitaria", "Capacità, fonte energetica, ingombro e fabbisogno", "Scaldacqua elettrico;Scaldacqua a pompa di calore;Bollitore sanitario;Circolatore di ricircolo sanitario"),
  gruppo("termoidraulico", "Sistemi radianti", "Passo, diametri, stratigrafia e progetto dei circuiti", "Pannello per riscaldamento radiante|mq;Tubo per impianto radiante|ml;Collettore radiante;Testina elettrotermica"),
  gruppo("termoidraulico", "Radiatori e terminali", "Resa alle condizioni di progetto, ingombro e attacchi", "Radiatore;Termoarredo riscaldamento;Ventilconvettore;Valvola termostatica"),
  gruppo("termoidraulico", "Reti idrico-sanitarie", "Materiali, diametri, pressioni ammesse e attacchi", "Tubo multistrato idrico|ml;Raccordo idrico;Tubo scarico sanitario|ml;Collettore idrico"),
  gruppo("termoidraulico", "Trattamento acqua", "Caratteristiche dell'acqua, portata e manutenzione prevista", "Filtro acqua;Addolcitore;Dosatore trattamento acqua"),
  gruppo("termoidraulico", "Regolazione e sicurezza", "Compatibilità, campo di funzionamento e progetto impiantistico", "Cronotermostato;Circolatore impianto;Vaso di espansione;Valvola di sicurezza"),
  gruppo("elettrico", "Serie civili", "Serie, moduli, colore e compatibilità dei supporti", "Presa elettrica;Interruttore serie civile;Placca serie civile;Supporto serie civile"),
  gruppo("elettrico", "Cavi e canalizzazioni", "Sezioni, caratteristiche dichiarate, diametri e percorsi", "Cavo elettrico|ml;Tubo corrugato elettrico|ml;Canalina elettrica|ml;Scatola di derivazione"),
  gruppo("elettrico", "Quadri e protezioni", "Schema elettrico, poli, correnti e coordinamento delle protezioni", "Centralino elettrico;Interruttore magnetotermico;Interruttore differenziale;Scaricatore di sovratensione"),
  gruppo("elettrico", "Illuminazione", "Potenza, flusso dichiarato, tonalità e grado di protezione", "Apparecchio LED;Alimentatore LED;Lampada di emergenza;Profilo per strip LED|ml"),
  gruppo("elettrico", "Domotica e automazioni", "Protocollo, alimentazione, carichi e compatibilità", "Attuatore domotico;Sensore domotico;Gateway domotico;Motore per automazione"),
  gruppo("elettrico", "Videocitofonia", "Numero utenze, protocollo, alimentazione e installazione", "Postazione videocitofonica esterna;Monitor videocitofonico interno;Alimentatore videocitofonia"),
  gruppo("elettrico", "Ricarica veicoli", "Potenza disponibile, connettore, protezioni e gestione carichi", "Wallbox per veicolo elettrico;Colonnina ricarica veicoli;Dispositivo gestione carichi"),
  gruppo("elettrico", "Reti dati e sicurezza", "Cablaggio, protocollo, alimentazione e compatibilità", "Presa dati;Armadio di rete;Centrale allarme;Telecamera di sicurezza"),
  gruppo("pavimenti", "Ceramica e gres", "Formato, spessore, finitura, lotto e destinazione d'uso", "Piastrella in gres porcellanato|mq;Piastrella ceramica|mq;Mosaico per rivestimento|mq;Grande lastra in gres|mq"),
  gruppo("pavimenti", "Parquet", "Essenza, struttura, finitura e metodo di posa previsto", "Parquet massello|mq;Parquet prefinito|mq;Protettivo per parquet|kg"),
  gruppo("pavimenti", "Laminati e vinilici", "Spessore, sistema di posa e idoneità all'ambiente", "Pavimento laminato|mq;Pavimento LVT|mq;Pavimento SPC|mq"),
  gruppo("pavimenti", "Resine e microcementi", "Supporto, ciclo completo, spessore e consumo", "Primer per resina|kg;Resina di fondo|kg;Microcemento|kg;Protettivo per resina|kg"),
  gruppo("pavimenti", "Pietre e pavimenti esterni", "Spessore, finitura, gelo dichiarato e supporto", "Pietra naturale per pavimento|mq;Massello autobloccante|mq;Gres da esterno|mq;Decking per esterni|mq"),
  gruppo("pavimenti", "Sottofondi e posa", "Tipo di supporto, compatibilità, consumo e confezione", "Massetto per pavimento|kg;Autolivellante per pavimento|kg;Materassino sottopavimento|mq;Collante per pavimento|kg"),
  gruppo("pavimenti", "Profili e finiture", "Materiale, sezione, colore e compatibilità pavimento", "Battiscopa|ml;Soglia di raccordo|ml;Giunto per pavimento|ml;Stucco per pavimenti|kg"),
  gruppo("piscine", "Strutture piscina", "Dimensioni, sistema costruttivo, supporto e progetto", "Vasca prefabbricata piscina;Pannello strutturale piscina|mq;Cassero per piscina"),
  gruppo("piscine", "Rivestimenti piscina", "Supporto, compatibilità immersione e ciclo previsto", "Liner per piscina|mq;Membrana armata piscina|mq;Mosaico per piscina|mq;Impermeabilizzante per piscina|kg"),
  gruppo("piscine", "Filtrazione e circolazione", "Portata, prevalenza, volume vasca e compatibilità circuito", "Pompa piscina;Filtro piscina;Skimmer;Bocchetta piscina"),
  gruppo("piscine", "Trattamento acqua piscina", "Volume vasca, compatibilità e modalità di dosaggio", "Dosatore piscina;Elettrolizzatore piscina;Centralina trattamento piscina;Prodotto trattamento acqua piscina|kg"),
  gruppo("piscine", "Riscaldamento piscina", "Volume, uso stagionale, potenza e collegamenti", "Pompa di calore piscina;Scambiatore per piscina"),
  gruppo("piscine", "Coperture piscina", "Misure vasca, sistema di movimentazione e ancoraggi", "Copertura estiva piscina|mq;Copertura invernale piscina|mq;Copertura automatica piscina"),
  gruppo("piscine", "Bordi e dotazioni", "Materiale, ingombro, fissaggi e compatibilità vasca", "Bordo piscina|ml;Scala piscina;Faro piscina;Robot pulitore piscina"),
  gruppo("cappotto", "Sistemi a cappotto", "Componenti compatibili di sistema, spessore e supporto", "Pannello isolante per cappotto|mq;Collante di sistema cappotto|kg;Tassello per cappotto;Rete di armatura cappotto|mq;Rasante di sistema cappotto|kg"),
  gruppo("cappotto", "Isolamento interno", "Stratigrafia, umidità, raccordi e progetto termico", "Pannello isolante interno|mq;Lastra per controparete isolante|mq;Membrana per isolamento interno|mq"),
  gruppo("cappotto", "Finiture per facciate", "Supporto, colore, ciclo e consumo dichiarato", "Primer per facciate|kg;Rivestimento di finitura facciata|kg;Pittura per esterni|kg"),
  gruppo("cappotto", "Ripristini e balconi", "Stato del supporto, ciclo compatibile e spessore", "Malta da ripristino|kg;Passivante per armature|kg;Impermeabilizzante per balconi|kg"),
  gruppo("cappotto", "Profili e raccordi facciata", "Geometria, materiale, raccordi e compatibilità di sistema", "Profilo di partenza cappotto|ml;Gocciolatoio facciata|ml;Angolare con rete|ml;Giunto per facciata|ml"),
];

/** Prodotti specialistici utilizzabili anche in un intervento più ampio, senza copiarli. */
export function verticaliProdottoStandard(area: string): string[] {
  const principale = area === "bagni" ? "bagno" : area === "serramenti" ? "serramentista" : area;
  const verticali = [principale];
  if (area !== "ristrutturazione" && area !== "piscine") verticali.push("ristrutturazione");
  if (["pavimenti", "termoidraulico", "elettrico"].includes(area)) verticali.push("bagno");
  return verticali;
}
