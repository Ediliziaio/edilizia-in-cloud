import { SALES_AREAS, findSalesArea } from "./areas";

export const AREA_DESIGN: Record<
  string,
  { color: string; intro: string; checks: string; scope: string }
> = {
  serramenti: {
    color: "#244d49",
    intro: "Luce, comfort e aperture coordinate con la tua casa.",
    checks: "Misure, ingombri, aperture e compatibilità dei fissaggi.",
    scope:
      "Prodotti e accessori sono inclusi soltanto nei vani e nelle quantità indicati.",
  },
  tetti: {
    color: "#694535",
    intro: "Una copertura curata, dall'analisi ai dettagli finali.",
    checks: "Supporti, raccordi, accessi e condizioni del manto interessato.",
    scope:
      "Accessi, protezioni e smaltimenti devono essere definiti per l'intervento.",
  },
  ristrutturazioni: {
    color: "#555747",
    intro: "Spazi ripensati intorno al tuo modo di abitare.",
    checks:
      "Stato dei luoghi, interferenze tra lavorazioni e materiali da conservare.",
    scope:
      "Ogni ambiente e ogni lavorazione inclusa devono comparire nel computo.",
  },
  "pareti-soffitti": {
    color: "#4a4a52",
    intro: "Pareti e soffitti curati: colore, materia e superfici sane.",
    checks:
      "Stato del fondo, umidità visibile, superfici comprese e protezioni.",
    scope:
      "Le superfici e le lavorazioni comprese sono quelle indicate in metri quadri nel computo.",
  },
  pergole: {
    color: "#4d5b47",
    intro: "Ombra, riparo e spazi esterni vivibili tutto l'anno.",
    checks:
      "Spazio, appoggi, esposizione al vento e scarico dell'acqua.",
    scope:
      "Struttura, copertura e accessori sono quelli del computo. Pratiche e opere edili restano a parte se non elencate.",
  },
  bagni: {
    color: "#6b5546",
    intro: "Il tuo bagno, con scelte coordinate e un perimetro chiaro.",
    checks: "Ingombri, attacchi, scarichi e compatibilità dei supporti.",
    scope:
      "Modelli, finiture e opere accessorie vanno confermati prima dell'ordine.",
  },
  fotovoltaico: {
    color: "#264f68",
    intro: "Energia progettata sulle caratteristiche del tuo edificio.",
    checks:
      "Configurazione esistente, compatibilità dei componenti e condizioni del sito.",
    scope:
      "Produzione, autoconsumo e ritorno economico richiedono dati e ipotesi documentati.",
  },
  climatizzazione: {
    color: "#35636c",
    intro: "Il comfort giusto, ambiente per ambiente.",
    checks: "Fabbisogni, posizionamenti, percorsi delle linee e scarichi.",
    scope:
      "Dimensionamento e prestazioni dipendono dal progetto e dalle condizioni di utilizzo.",
  },
  termoidraulica: {
    color: "#655444",
    intro: "Una soluzione coordinata per il comfort e l'acqua di casa.",
    checks: "Fabbisogni, terminali, spazi tecnici e collegamenti disponibili.",
    scope:
      "Generatori, distribuzione e regolazione vanno verificati come un sistema unico.",
  },
  elettrico: {
    color: "#405370",
    intro: "Funzioni chiare, impianti organizzati, utilizzo semplice.",
    checks:
      "Carichi, circuiti, percorsi e compatibilità con l'impianto esistente.",
    scope:
      "La documentazione prevista va riferita alle opere effettivamente eseguite.",
  },
  pavimenti: {
    color: "#705942",
    intro: "Materiali da vivere, dettagli da guardare da vicino.",
    checks: "Stato, umidità e planarità del supporto, quote e raccordi.",
    scope:
      "Materiali, preparazione del fondo, tagli e finiture vanno esplicitati nell'offerta.",
  },
  piscine: {
    color: "#245d68",
    intro: "Uno spazio d'acqua da progettare e curare nel tempo.",
    checks:
      "Stato della vasca, accessi, componenti idraulici e finiture interessate.",
    scope:
      "Dimensioni, dotazioni e opere esterne devono essere descritte separatamente.",
  },
  facciate: {
    color: "#71604a",
    intro: "Protezione e carattere per l'involucro dell'edificio.",
    checks:
      "Supporto, degrado, raccordi, accessi e compatibilità del ciclo previsto.",
    scope:
      "Superfici e zone interessate devono essere misurabili e chiaramente delimitate.",
  },
};

/** Editorial boundaries are intervention-specific, not a copy of the parent area. */
export const INTERVENTION_LIMITS: Record<string, string> = {
  "ristrutturazioni/completa":
    "Opere strutturali, bonifiche e arredi mobili sono esclusi se non espressamente computati.",
  "ristrutturazioni/parziale":
    "Gli ambienti non indicati restano esclusi. I raccordi con le finiture conservate richiedono una verifica preventiva.",
  "ristrutturazioni/commerciale":
    "Arredi commerciali, insegne, impianti speciali e fasi fuori orario vanno quotati se richiesti.",
  "ristrutturazioni/spazi":
    "Non si presume che una parete sia demolibile: le verifiche sul progetto precedono la definizione delle opere.",
  "ristrutturazioni/computo":
    "Fa fede l'elenco delle voci con quantità e unità di misura. Le opere non descritte non sono automaticamente incluse.",
  "ristrutturazioni/cucina":
    "Mobili ed elettrodomestici sono esclusi se non elencati: si predispongono gli attacchi. Spostare finestre o muri è una valutazione separata.",
  "ristrutturazioni/sottotetto":
    "L'abitabilità dipende da altezze e regole del Comune, verificate prima. Incarico tecnico, calcoli sui carichi e pratiche sono a parte.",
  "ristrutturazioni/aperture-portanti":
    "Calcoli, progetto strutturale e pratica sono di un tecnico incaricato, a parte. L'esecuzione segue il progetto; infissi e finiture nell'apertura sono esclusi se non elencati.",
  "ristrutturazioni/condominio":
    "Delibere e ripartizione tra condòmini sono del condominio. Facciata esterna e impianti comuni sono a parte se non elencati.",
  "ristrutturazioni/montascale":
    "Opere edili (fosse, appoggi), pratiche e verifiche per le detrazioni sono a parte. La fattibilità dipende dalla scala reale, verificata al sopralluogo.",
  "pareti-soffitti/tinteggiatura-interna":
    "Il prezzo riguarda le superfici indicate in metri quadri. Stuccature, carteggiature e mani di fondo sono comprese solo dove elencate.",
  "pareti-soffitti/carta-da-parati":
    "La carta segue il fondo: rasature e preparazioni del muro sono comprese solo se computate. Metratura e sfrido dipendono dal disegno scelto.",
  "pareti-soffitti/cartongesso":
    "Il cablaggio elettrico, l'idraulica e la tinteggiatura sono esclusi se non elencati. I carichi da appendere vanno indicati per predisporre i rinforzi.",
  "pareti-soffitti/controsoffitti":
    "Corpi illuminanti e impianti a monte sono esclusi se non computati: qui si predispone la sede. L'abbassamento riduce l'altezza della stanza.",
  "pareti-soffitti/decorativi":
    "L'effetto approvato su campione è il riferimento. Piccole variazioni sono proprie di una finitura a mano. Risanamenti del fondo restano a parte.",
  "pareti-soffitti/umidita":
    "Si tratta la causa prima della finitura. Riparazioni esterne, barriere alla risalita e drenaggi sono interventi separati. Alcuni risultati dipendono dall'uso.",
  "pareti-soffitti/acustica":
    "L'isolamento attenua, non azzera, e agisce sulla via del rumore indicata. Interventi sulla sorgente (pavimento di sopra, impianti) sono a parte.",
  "pergole/pergola-bioclimatica":
    "Struttura, motori e accessori sono quelli del computo. Autorizzazioni, fondazioni e opere murarie restano a parte. Vento e neve hanno limiti dichiarati dal produttore.",
  "pergole/pergola-telo":
    "Struttura e telo sono quelli elencati. Con vento forte il telo va chiuso. Pratiche e opere edili sono a parte se non computate.",
  "pergole/tende-sole":
    "Le tende sono quelle delle aperture indicate. I fissaggi si scelgono sul supporto reale, cappotto compreso. Autorizzazioni condominiali e rinforzi sono a parte.",
  "pergole/vetrate":
    "Chiudere un balcone può incidere su volumi e pratiche: si verifica sul caso e sul Comune. Autorizzazioni e incarichi tecnici sono a parte se non elencati.",
  "pergole/carport":
    "Struttura, copertura e fondazioni sono quelle del computo. Permessi, calcoli e pavimentazioni restano a parte. Carichi di vento e neve sono dichiarati.",
  "bagni/completo":
    "Spostamenti degli impianti fuori dal bagno, porte e arredi non elencati richiedono una voce separata.",
  "bagni/vasca-doccia":
    "Il cambio vasca-doccia non equivale al rifacimento completo degli impianti o dei rivestimenti del bagno.",
  "bagni/doccia":
    "L'intervento riguarda la zona doccia indicata; danni o difetti nascosti possono richiedere una variante concordata.",
  "bagni/sanitari":
    "Si verificano attacchi e compatibilità prima dell'ordine. Le reti incassate non vengono sostituite salvo voce esplicita.",
  "bagni/accessibilita":
    "Gli ausili e gli spazi vanno scelti sulle esigenze della persona e verificati in progetto: non basta sostituire un sanitario.",
  "bagni/rinnovo":
    "Il rinnovo estetico conserva quanto indicato e non implica il rifacimento degli impianti sottostanti.",
  "fotovoltaico/nuovo":
    "Accumulo, opere sul tetto e adeguamenti elettrici sono inclusi solo se descritti. Nessun risparmio è garantito dal solo numero di pannelli.",
  "fotovoltaico/accumulo":
    "La compatibilità con inverter e impianto esistenti va verificata. Un nuovo inverter non è incluso automaticamente.",
  "fotovoltaico/ampliamento":
    "La potenza aggiuntiva richiede verifica di spazi, componenti e configurazione. Non si presume il riuso di ogni elemento esistente.",
  "fotovoltaico/componenti":
    "La sostituzione riguarda i componenti elencati; non estende automaticamente la garanzia all'intero impianto.",
  "fotovoltaico/manutenzione":
    "Ricambi e riparazioni emergenti dai controlli vanno autorizzati a parte se non previsti nel servizio.",
  "climatizzazione/monosplit":
    "Linee oltre le lunghezze quotate, opere murarie e nuova alimentazione elettrica richiedono voci esplicite.",
  "climatizzazione/multisplit":
    "Numero e abbinamento delle unità devono essere compatibili. Ogni ambiente e percorso di linea va identificato.",
  "climatizzazione/canalizzato":
    "Controsoffitti, botole e ripristini decorativi vanno separati dalle apparecchiature e dalle canalizzazioni.",
  "climatizzazione/sostituzione":
    "Il riutilizzo delle linee esistenti è subordinato alla verifica tecnica; eventuali adattamenti sono da descrivere.",
  "climatizzazione/manutenzione":
    "Pulizia e controllo non equivalgono alla riparazione di guasti. Ricambi e interventi aggiuntivi richiedono accordo.",
  "climatizzazione/vmc":
    "Passaggi in parete, canalizzazioni, fori e ripristini vanno indicati; prestazioni e rumore dipendono dalla configurazione.",
  "termoidraulica/caldaia":
    "Adeguamenti di canna fumaria, rete gas, scarichi e distribuzione non sono inclusi se non elencati.",
  "termoidraulica/pompa-calore":
    "Compatibilità dei terminali, alimentazione e fabbisogno vanno verificati. Il generatore da solo non determina il risparmio.",
  "termoidraulica/ibrido":
    "Integrazione e logiche di regolazione vanno definite; non si presume la compatibilità di generatori scelti separatamente.",
  "termoidraulica/radiante":
    "Demolizioni, massetti e pavimenti vanno distinti dal sistema radiante. Quote e tempi di asciugatura incidono sul programma.",
  "termoidraulica/terminali":
    "Le modifiche alla rete incassata e il rinnovo del generatore sono esclusi se non previsti nelle voci.",
  "termoidraulica/idrico":
    "Il perimetro deve identificare punti e tratti di rete. Allacci e parti comuni sono da valutare separatamente.",
  "termoidraulica/acqua-calda":
    "Ricircolo, distribuzione e predisposizioni elettriche vanno quotati se necessari, oltre al generatore o accumulo.",
  "termoidraulica/manutenzione":
    "La diagnosi può richiedere approfondimenti. I ricambi non preventivabili vengono concordati prima della sostituzione.",
  "termoidraulica/conto-termico":
    "Il contributo del GSE è stimato: l'importo definitivo lo stabilisce il GSE. Distribuzione, terminali e opere non elencate sono esclusi.",
  "termoidraulica/full-electric":
    "Produzione, consumi e risparmi sono stime; gli incentivi dipendono dai requisiti. Opere, aumenti di potenza e adeguamenti non elencati sono esclusi.",
  "termoidraulica/pellet":
    "Lo scarico dei fumi va realizzato secondo le regole in vigore. Una stufa ad aria non scalda i termosifoni; canna fumaria e presa d'aria si verificano sul posto.",
  "termoidraulica/solare-termico":
    "Il solare copre parte del fabbisogno: in inverno serve l'integrazione del generatore. Resa ed esposizione si verificano; nessun risparmio è garantito dal solo impianto.",
  "termoidraulica/trattamento-acqua":
    "Il trattamento migliora aspetti specifici dell'acqua, non la rende di per sé potabile. Analisi, scarico della rigenerazione e alimentazione si verificano prima.",
  "elettrico/completo":
    "Opere murarie, finiture, impianti speciali e apparecchi illuminanti devono essere esplicitamente elencati.",
  "elettrico/adeguamento":
    "L'intervento riguarda il perimetro verificato, non implica automaticamente il rifacimento o la conformità di tutte le parti esistenti.",
  "elettrico/punti":
    "Nuovi punti richiedono verifica dei circuiti a monte. Tracce, tinteggiature e ampliamento quadro vanno descritti.",
  "elettrico/quadro":
    "Sostituire il quadro non significa sostituire le linee. Le verifiche identificano eventuali interventi aggiuntivi.",
  "elettrico/domotica":
    "Funzioni, protocolli e dispositivi compatibili vanno elencati. Abbonamenti e servizi di terzi non sono implicitamente inclusi.",
  "elettrico/videocitofonia":
    "Riutilizzo dei cablaggi e compatibilità con accessi esistenti vanno verificati. Le opere sulle parti comuni sono da concordare.",
  "elettrico/ricarica":
    "Potenza disponibile, gestione carichi e percorso della linea precedono la scelta. Aumenti di potenza non sono automaticamente inclusi.",
  "elettrico/antifurto":
    "La videosorveglianza comporta obblighi su informativa, segnaletica e aree riprese, da verificare. Canoni, cloud e collegamento a vigilanza non sono inclusi salvo voce esplicita.",
  "elettrico/illuminazione":
    "Predisporre un punto luce e fornire l'apparecchio sono voci distinte. Resa e temperatura di colore dipendono dagli apparecchi scelti, non dalle foto.",
  "elettrico/automazioni":
    "Le protezioni del movimento vanno previste secondo le regole in vigore. Struttura del cancello, opere murarie e videocitofonia sono a parte salvo voce esplicita.",
  "elettrico/rete-dati":
    "La copertura Wi-Fi dipende da muri, apparati e dispositivi, non dal solo numero di prese. Apparati del gestore e access point sono a parte salvo voce esplicita.",
  "pavimenti/sovrapposizione":
    "La posa è subordinata alla compatibilità del supporto. Rettifiche di porte, soglie e quote vanno valutate.",
  "pavimenti/rifacimento":
    "Le condizioni dei sottofondi emergono dopo le rimozioni. Ripristini non prevedibili richiedono una variante.",
  "pavimenti/resina":
    "Il ciclo dipende dal supporto e dall'uso. Microfessure, umidità e giunti vanno valutati prima dell'applicazione.",
  "pavimenti/parquet":
    "Il recupero dipende dallo spessore utile e dallo stato del legno. Sostituzioni estese non sono incluse se non quotate.",
  "pavimenti/pareti":
    "Preparazione e impermeabilizzazione del supporto non sono comprese nella sola posa se non indicate.",
  "pavimenti/esterni":
    "Pendenze, drenaggi e resistenza del sottofondo vanno verificati. Non basta scegliere un materiale per esterno.",
  "piscine/nuova":
    "Indagini sul terreno, opere esterne e allacci devono essere definiti. Dimensioni e dotazioni non si desumono dall'immagine.",
  "piscine/ristrutturazione":
    "Difetti nascosti della struttura possono modificare il perimetro. Il rinnovo estetico non implica un consolidamento.",
  "piscine/rivestimento":
    "Compatibilità e stato del supporto condizionano il ciclo. Riparazioni strutturali sono separate se non descritte.",
  "piscine/impianti":
    "Portate, volumi e compatibilità dei componenti vanno verificati prima della fornitura. Opere sulla vasca non sono implicite.",
  "piscine/accessori":
    "Una copertura non è automaticamente un dispositivo di sicurezza. Destinazione, prestazioni e fissaggi vanno documentati.",
  "piscine/manutenzione":
    "Prodotti di trattamento, ricambi e riparazioni devono essere elencati. Il servizio stagionale non comprende ogni guasto futuro.",
  "facciate/cappotto":
    "Spessore e sistema dipendono dal progetto. Ponteggi, raccordi, davanzali e spostamento impianti vanno computati.",
  "facciate/rifacimento":
    "Il rinnovo dell'intonaco non equivale alla posa di un cappotto. Ripristini profondi vanno descritti e misurati.",
  "facciate/balconi":
    "Il degrado deve essere valutato prima di definire il ripristino. Eventuali interventi strutturali richiedono un progetto dedicato.",
  "facciate/tinteggiatura":
    "La tinteggiatura non risolve da sola infiltrazioni o distacchi. Le preparazioni necessarie vanno esplicitate.",
  "facciate/interno":
    "Raccordi e gestione dell'umidità richiedono valutazione progettuale; lo spessore riduce lo spazio disponibile.",
  "facciate/riparazioni":
    "Le riparazioni riguardano le zone delimitate. Uniformità cromatica con le parti esistenti e difetti nascosti vanno valutati.",
};

export interface ModulePage {
  id: string;
  title: string;
  intro: string;
  items: { title: string; text: string }[];
  visible: boolean;
}
export interface ModuleDocument {
  version: 1;
  companyId: string;
  areaId: string;
  moduleId: string;
  title: string;
  subtitle: string;
  color: string;
  image: string | null;
  imageCaption: string;
  company: { name: string; address: string; email: string; phone: string };
  pages: ModulePage[];
}
export const areaImage = (id: string) => `/module-art/${id}.jpg`;
const DEDICATED_IMAGES = new Set([
  "bagni/accessibilita",
  "elettrico/ricarica",
  "pavimenti/resina",
  "pavimenti/esterni",
  "pavimenti/pareti",
  "ristrutturazioni/commerciale",
  "termoidraulica/caldaia",
]);
export function documentImage(area: string, module: string) {
  if (DEDICATED_IMAGES.has(`${area}/${module}`))
    return `/module-art/${area}-${module}.jpg`;
  if (area === "facciate" && module === "interno")
    return areaImage("ristrutturazioni");
  if (area === "pareti-soffitti" || area === "pergole") return areaImage("ristrutturazioni");
  return areaImage(area);
}
export function createModuleDocument(
  companyId: string,
  areaId: string,
  moduleId: string,
  company: ModuleDocument["company"],
): ModuleDocument {
  const area = findSalesArea(areaId);
  const module = area?.interventions.find((m) => m.id === moduleId);
  if (!area || !module) throw new Error("Area o intervento non riconosciuto.");
  const design = AREA_DESIGN[area.id];
  const limit = INTERVENTION_LIMITS[`${area.id}/${module.id}`] ?? design.scope;
  const page = (
    id: string,
    title: string,
    intro: string,
    pairs: string[][],
    visible = true,
  ): ModulePage => ({
    id,
    title,
    intro,
    visible,
    items: pairs.map(([title, text]) => ({ title, text })),
  });
  return {
    version: 1,
    companyId,
    areaId: area.id,
    moduleId,
    title: module.title,
    subtitle: module.summary,
    color: design.color,
    image: documentImage(area.id, moduleId),
    imageCaption:
      "Immagine illustrativa dell'area, generata con AI. Non rappresenta prodotti o lavori inclusi.",
    company: { ...company },
    pages: [
      page("progetto", "La proposta, in breve", design.intro, [
        ["Il tuo intervento", module.summary],
        ["Da verificare insieme", design.checks],
        ["Il perimetro della proposta", design.scope],
      ]),
      page(
        "specifiche",
        "Scelte e specifiche",
        "Una base condivisa per definire prodotti, materiali e lavorazioni prima della conferma.",
        module.fields.map((field, i) => [
          field,
          [
            "Rileviamo i dati e le condizioni esistenti; le misure definitive si confermano dopo la verifica tecnica.",
            "Concordiamo la soluzione e le caratteristiche richieste, riportando modelli e materiali nell'offerta.",
            "Descriviamo quantità, componenti e accessori previsti, distinguendo le opzioni da ciò che è incluso.",
            "Definiamo modalità di esecuzione, lavorazioni accessorie e verifiche per il perimetro concordato.",
          ][i] ?? "Da definire nell'offerta.",
        ]),
      ),
      page(
        "perimetro",
        "Cosa comprende l'intervento",
        "Le voci definitive del preventivo devono essere coerenti con questo riepilogo.",
        [
          [
            "Ambito incluso",
            module.summary +
              " Le quantità e i materiali sono quelli riportati nelle voci economiche.",
          ],
          ["Da valutare separatamente", limit],
          [
            "Gestione delle varianti",
            "Ogni modifica viene descritta e concordata per iscritto prima dell'esecuzione, con relativo prezzo ed effetto sui tempi.",
          ],
        ],
      ),
      page(
        "percorso",
        "Dalla verifica alla consegna",
        "Un percorso leggibile, senza date o durate promesse prima di conoscere il lavoro.",
        [
          ["01 · Rilievo e verifica", design.checks],
          [
            "02 · Scelte e conferma",
            `Confermiamo ${module.fields.slice(0, 2).join(" e ").toLowerCase()}, insieme alle voci e alle esclusioni.`,
          ],
          [
            "03 · Programmazione",
            "Concordiamo accessi, disponibilità dei materiali e fasi operative; eventuali interferenze vengono condivise prima dell'avvio.",
          ],
          [
            "04 · Verifica e consegna",
            "Controlliamo le lavorazioni nel perimetro concordato e condividiamo la documentazione e le indicazioni d'uso applicabili.",
          ],
        ],
      ),
      page(
        "economica",
        "Un'offerta facile da leggere",
        "Qui imposti le spiegazioni commerciali. Prezzi, quantità, sconti e IVA saranno dati del preventivo, non del modello.",
        [
          [
            "Prodotti e lavorazioni",
            "Ogni voce riporta descrizione, unità di misura, quantità e importo. Le opzioni restano separate dal totale della soluzione scelta.",
          ],
          [
            "Prezzo e sconti",
            "Il riepilogo distingue imponibile, sconti applicati, IVA e totale. Gli importi sono definiti dopo aver scelto prodotti e servizi.",
          ],
          [
            "Tempi e pagamenti",
            "Validità dell'offerta, scadenze e modalità di pagamento vengono concordate e riportate nel singolo preventivo.",
          ],
        ],
      ),
      page(
        "faq",
        "Le risposte prima di decidere",
        "Chiarezza sui dubbi che possono cambiare la scelta o il perimetro del lavoro.",
        [
          [
            `Da cosa dipende la soluzione per ${module.title.toLowerCase()}?`,
            `La scelta parte da ${module.fields.slice(0, 2).join(" e ").toLowerCase()}. Le verifiche confermano fattibilità e lavorazioni necessarie.`,
          ],
          ["Cosa può richiedere una voce separata?", limit],
          [
            "Posso cambiare finiture o componenti?",
            "Sì, prima della conferma verifichiamo compatibilità, disponibilità e differenze di prezzo. Dopo l'ordine, tempi e possibilità di modifica vanno riconcordati.",
          ],
        ],
      ),
      page(
        "chiusura",
        "Definiamo il prossimo passo",
        "Prima di confermare, assicuriamoci che la proposta rispecchi le tue esigenze.",
        [
          [
            "Rileggi le scelte",
            "Controlla le caratteristiche, le quantità e le lavorazioni previste.",
          ],
          [
            "Condividi i tuoi dubbi",
            "Segnala le alternative che vuoi valutare e gli aspetti da chiarire.",
          ],
          [
            "Concordiamo la verifica finale",
            "Definiamo i dettagli ancora aperti, le condizioni applicabili e la programmazione.",
          ],
        ],
      ),
      page(
        "condizioni",
        "Condizioni dell'offerta",
        "Inserire le condizioni aziendali applicabili e verificarle prima dell'uso commerciale.",
        [],
        false,
      ),
    ],
  };
}
export const DOCUMENT_MODULE_COUNT = SALES_AREAS.reduce(
  (sum, a) => sum + a.interventions.length,
  0,
);
export function documentTextVariants(
  document: ModuleDocument,
  page: ModulePage,
) {
  const copy: Record<string, [string, string, string]> = {
    progetto: [
      "Il progetto in sintesi: esigenze, soluzione e verifiche prima della conferma.",
      "Ti aiutiamo a mettere a fuoco le priorità e a confrontare le scelte che incidono sul risultato.",
      "Oggetto, stato iniziale e obiettivi dell'intervento; dati da confermare con il rilievo.",
    ],
    specifiche: [
      "Caratteristiche, materiali e componenti da confermare insieme.",
      "Ogni dettaglio conta: confrontiamo le alternative in base all'uso, agli spazi e alle tue preferenze.",
      "Specifiche di prodotti e lavorazioni, compatibilità, quantità e modalità di esecuzione da riportare nell'offerta.",
    ],
    perimetro: [
      "Cosa è previsto, cosa resta escluso e come concordare eventuali modifiche.",
      "Vogliamo che tu sappia cosa stai scegliendo: separiamo il lavoro proposto dalle opzioni e dagli interventi aggiuntivi.",
      "Perimetro delle opere, esclusioni esplicite e procedura per autorizzare varianti con impatti economici e temporali.",
    ],
    percorso: [
      "Verifica, conferma delle scelte, programmazione e consegna.",
      "Un passaggio alla volta: condividiamo scelte e verifiche per aiutarti a seguire il lavoro con chiarezza.",
      "Fasi operative subordinate a rilievo, approvazione, disponibilità dei materiali e condizioni di accesso.",
    ],
    economica: [
      "Prima prodotti e servizi; poi prezzi, sconti, IVA e totale.",
      "Ti aiutiamo a leggere il valore delle singole voci e a distinguere la soluzione scelta dalle alternative.",
      "Importi articolati per quantità e prezzi unitari, con sconti, imponibile, imposte e totale distinti nel preventivo.",
    ],
    faq: [
      "Le risposte ai dubbi più frequenti, prima della conferma.",
      "Se qualcosa non è chiaro, parliamone: le risposte aiutano a scegliere senza dare per scontati costi e lavorazioni.",
      "Chiarimenti su fattibilità, limiti di fornitura, compatibilità e condizioni che possono richiedere una variante.",
    ],
    chiusura: [
      "Rivedi la proposta, condividi i dubbi e concordiamo i dettagli finali.",
      "La scelta giusta parte da una proposta che comprendi: confrontiamoci sui punti ancora aperti prima di confermare.",
      "Verifica finale delle specifiche, delle condizioni e della programmazione prima della formalizzazione dell'offerta.",
    ],
    condizioni: [
      "Inserire qui le condizioni aziendali applicabili alla singola offerta.",
      "Spiegare con chiarezza modalità di conferma, pagamenti e gestione delle modifiche, usando condizioni approvate dall'azienda.",
      "Testo da predisporre e verificare per il caso specifico. Questo modello non contiene clausole legali preapprovate.",
    ],
  };
  const variants = copy[page.id] ?? [
    page.intro,
    "Condividiamo i dettagli della proposta prima della conferma.",
    "Contenuti da verificare rispetto al perimetro dell'offerta.",
  ];
  return [
    { name: "Essenziale", text: `${document.title}. ${variants[0]}` },
    { name: "Consulenziale", text: `${document.title}. ${variants[1]}` },
    { name: "Tecnico", text: `${document.title}. ${variants[2]}` },
  ];
}
