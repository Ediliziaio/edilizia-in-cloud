# Capannoni e posa industriale — anteprima locale

URL: http://127.0.0.1:8087/?esempio=capannone

Dalla fase Configurazione aprire «Modifica disposizione pannelli», quindi «Capannone». Il wizard, l’IVA, gli sconti, il riepilogo e la conferma della disposizione restano quelli nativi. Nessuna pubblicazione o modifica del database.

## Funzioni

- Schemi dimensionali: tetto piano, doppia falda, shed ripetuti (2–6 shed / massimo 12 falde). Lati 10–80 m, altezza gronda 2–40 m, pendenza 2–25°. Uno schema è etichettato come illustrativo e non viene presentato come rilievo del cliente.
- Posa aderente; sul tetto piano anche file inclinate verso sud e coppie est–ovest. Inclinazione supporti 0–35°, spazio libero fra file/coppie 0,02–5 m. Queste distanze sono parametri commerciali espliciti, non risultati di un calcolo di ombreggiamento.
- Fino a 2.000 moduli per disegno industriale; rimane il limite di 500 per i disegni residenziali precedenti. Lettura JSON, editor, ricalcolo ostacoli e rendering condividono il limite.
- Ingombro proiettato e dimensione reale del pannello distinti: inclinare il modulo non ne accorcia la dimensione fisica nel 3D. Ingrandimento, selezione individuale, spostamento, rimozione e annullamento; rimozione di una fila/coppia dalla scheda Capannone.
- Corridoio centrale opzionale e zone rettangolari per lucernari, evacuatori, passaggi e impianti. Le zone partecipano alla validazione e al ricalcolo; non sono solo elementi grafici.
- Strutture/fissaggi a prezzo per modulo e inverter aggiuntivi a quantità/prezzo entrano nelle righe native del preventivo. Il totale della bozza usa gli stessi prezzi, sconti e IVA della conferma. Gli extra precedenti sono conservati e le righe generate hanno chiavi stabili. I costi d’acquisto e le specifiche degli inverter aggiuntivi vanno completati.
- Il confronto sullo stesso tetto piano presenta capacità (fino a 2.000 moduli), kWp, produzione annua indicativa e totale IVA inclusa. Non applica automaticamente una proposta. Un valore non disponibile resta «—».
- Il medesimo configuratore può applicare la posa a un rilievo importato; i supporti inclinati sono consentiti solo su falde piane. Il cambio di posa conserva le zone escluse. Creare un nuovo schema sostituisce invece il rilievo nella bozza, dopo conferma esplicita del pulsante.

## Produzione e PVGIS

Il proxy locale riceve gruppi con inclinazione, azimut e kWp effettivi ricavati dalle normali 3D dei moduli. Converte l’azimut da Nord=0° al riferimento PVGIS Sud=0°, Est=-90°, Ovest=90°. Legge H(i)_y per ciascuna esposizione e fa la media pesata sui kWp; la produzione usa poi il fattore del preventivatore nativo (0,7565 standard, o 0,7832 con ottimizzatori) e la perdita per ombre indicata nel wizard. Il confronto usa i fattori standard e dichiara l’assenza del calcolo delle ombre vicine.

Non si tratta di usare direttamente E_y di PVGIS applicando nuovamente le perdite. Il modello energetico del preventivo resta coerente con la sua anteprima. Le richieste hanno validazione di coordinate, potenze e orientamenti, timeout, cache in memoria limitata e al massimo tre richieste concorrenti. Una risposta tardiva non può sovrascrivere una configurazione successiva. Le modifiche a geometria o località invalidano la stima precedente. Escludere il disegno dal PDF conserva le esposizioni se la quantità corrisponde ancora.

Documentazione di riferimento: [PVGIS API, JRC](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en).

## Resa e persistenza

I corpi dei pannelli usano un’unica InstancedMesh, una texture full black condivisa e colori per istanza; la selezione usa l’indice dell’istanza. I supporti sono illustrativi. Buffer delle istanze, geometrie, materiali e texture vengono rilasciati al cambio della vista. Originali e versioni del rilievo rimangono nell’archivio IndexedDB del browser, con riferimento nel disegno; supporti, costi e ingombri sono conservati dal parser condiviso, anche dopo salvataggio, undo o correzione dell’altezza.

## Verifiche e limiti

238 test in 15 file: geometrie dei tre schemi, dimensioni fisiche e azimut di sud/est–ovest anche con lieve pendenza di drenaggio, 2.000 moduli, corridoi e lucernari, validazione JSON, mantenimento dopo cambio altezza, prezzi e righe senza duplicati, pesi PVGIS, comandi di applicazione/confronto e sola lettura, più regressioni del wizard. TypeScript mirato, lint dei file modificati e build locale.

Prova browser: schema 60×40 m, 600 moduli da 450 W = 270 kWp, due inverter aggiuntivi; prezzo dimostrativo €160.050 IVA inclusa. Rimuovere un modulo porta a 599 moduli / 269,55 kWp / €159.813,50; undo ripristina i valori. Conferma e reload conservano schema, costi e quantità. Verificate doppia falda e tre shed, quindi salvata e riaperta la posa est–ovest sul tetto piano. Confronto PVGIS completato per tutte e tre le esposizioni. Il listino è di esempio e non è un’offerta per un cliente.

Restano fuori da questa anteprima: ombre stagionali/interfila, vento e zavorre, verifiche statiche e antincendio, dimensionamento elettrico/stringhe/protezioni e rete, ricostruzione fotogrammetrica, archivio cloud condiviso. La selezione e il conteggio degli inverter qui sono commerciali, senza verifica elettrica automatica. Gli impianti su coperture curve richiedono una futura gestione specifica delle superfici; non vanno approssimati con una falda planare senza dichiararlo.
