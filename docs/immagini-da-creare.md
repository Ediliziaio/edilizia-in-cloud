# Immagini da creare — verso uno standard con varianti

Checklist operativa di **tutto** ciò che resta da creare per avere una base immagini
completa e con varianti per ogni azienda. Da leggere insieme a `docs/prompt-immagini-modelli.md`
(convenzioni, stile, prompt base). Le dimensioni e le cartelle sono quelle di quel documento.

Stato di partenza: il pacchetto `pacchetto_immagini_preventivi_ottimizzato` copre **i 39
modelli nuovi** (cover 1536×1024 + dettaglio 1600×900 + miniatura 480×720) + 5 operative
comuni + 20 prodotti esempio. Qui c'è **il resto**.

---

## 0. Correzioni già fatte (nel pacchetto)

Rinominati per rispettare l'`id` dell'area (il selettore lo usa in modo rigido):
- `ristrutturazione-*` → **`ristrutturazioni-*`** (cucina, sottotetto, aperture-portanti, condominio, montascale — cover, dettaglio, miniatura).
- `termoidraulico-*` → **`termoidraulica-*`** (pellet, solare-termico, trattamento-acqua — cover, dettaglio, miniatura).

**Regola nome (da rispettare per ogni file nuovo):**
- Copertina: `public/module-art/<AREA_ID>-<id>-cover.jpg` · Dettaglio: `…-<id>-dettaglio.jpg`
- Miniatura: `public/quote-picker/<AREA_ID>-<id>.webp`
- `AREA_ID` (attenzione, ≠ nome del settore): `serramenti, tetti, ristrutturazioni, pareti-soffitti,
  pergole, bagni, fotovoltaico, climatizzazione, termoidraulica, elettrico, pavimenti, piscine, facciate, giardini`.

---

## 1. Copertine + dettagli DEDICATI ancora da creare (modelli esistenti su stock)

Questi modelli **non erano nei 39 nuovi** e usano ancora una copertina generica/stock.
Creare per ognuno **cover 1536×1024** + **dettaglio 1600×900** + rigenerare la **miniatura**.
(Soggetti: usare il prompt base di `prompt-immagini-modelli.md` col soggetto indicato.)

### ⭐ Prioritari (li hai citati tu)
| area/id | oggi usa (stock) | soggetto copertina |
|---|---|---|
| `termoidraulica/conto-termico` | pompa-di-calore.jpg | Pompa di calore installata in una villa, con richiamo all'incentivo GSE (senza loghi) |
| `termoidraulica/full-electric` | villa-tetto-coppi.jpg | Villa "senza gas": fotovoltaico sul tetto, pompa di calore e piano a induzione, insieme |
| `termoidraulica/manutenzione` | collaudo.jpg | Tecnico che controlla una caldaia/pompa di calore, strumento di misura (di spalle) |

### Fotovoltaico (tutta l'area va rinforzata — vedi anche §3)
| area/id | oggi usa (stock) | soggetto copertina |
|---|---|---|
| `fotovoltaico/nuovo` | villa-tetto-coppi.jpg | Impianto fotovoltaico nuovo su tetto di villetta, cielo sereno |
| `fotovoltaico/ampliamento` | dettaglio-celle.jpg | Moduli aggiunti accanto a un impianto esistente sullo stesso tetto |
| `fotovoltaico/componenti` | inverter-monofase.jpg | Inverter e batteria di accumulo a parete in un locale tecnico ordinato |
| `fotovoltaico/manutenzione` | controllo-termografico.jpg | Pulizia/controllo dei moduli sul tetto, termocamera |

### Altri modelli "capofila" su immagine generica dell'area
| area/id | oggi usa | soggetto copertina |
|---|---|---|
| `bagni/completo` | module-art/bagni.jpg | Bagno completo appena rifinito, luce naturale |
| `ristrutturazioni/completa` | module-art/ristrutturazioni.jpg | Interno ristrutturato completo, prima/dopo suggerito |
| `ristrutturazioni/computo` | cantiere-ordinato.jpg | Cantiere ordinato con computo/planimetria su un tavolo |
| `serramenti/finestre` | module-art/serramenti.jpg | Finestre nuove su una facciata, luce del mattino |
| `tetti/rifacimento` | module-art/tetti.jpg | Tetto a falde rifatto, nuova stratigrafia visibile |
| `tetti/ripasso` | module-art/tetti.jpg | Copertura in fase di ripasso, tegole riordinate |
| `tetti/isolamento` | pdf-stock/tetti/isolamento.jpg | Isolamento della copertura, pannelli in posa |
| `climatizzazione/monosplit` | module-art/climatizzazione.jpg | Split a parete in un soggiorno, unità esterna sullo sfondo |
| `elettrico/completo` | module-art/elettrico.jpg | Impianto elettrico nuovo, quadro ordinato e punti luce |
| `elettrico/adeguamento` | pdf-stock/elettrico/quadro.jpg | Quadro elettrico adeguato con differenziali nuovi |
| `elettrico/punti` | pdf-stock/elettrico/risultato.jpg | Prese e comandi nuovi su una parete finita |
| `elettrico/quadro` | pdf-stock/elettrico/quadro.jpg | Quadro elettrico con circuiti etichettati |
| `pavimenti/sovrapposizione` | module-art/pavimenti.jpg | Nuovo pavimento posato sul fondo esistente |
| `pavimenti/rifacimento` | pdf-stock/pavimenti/installazione.jpg | Rimozione e nuova posa del pavimento |
| `pavimenti/parquet` | pdf-stock/pavimenti/vita.jpg | Parquet recuperato e lucidato |
| `piscine/nuova` | module-art/piscine.jpg | Piscina nuova in giardino, acqua limpida |
| `piscine/ristrutturazione` | pdf-stock/piscine/risultato.jpg | Piscina rinnovata, bordo e rivestimento nuovi |
| `piscine/impianti` | pdf-stock/piscine/locale-tecnico.jpg | Locale tecnico piscina: pompa, filtro, quadro |
| `piscine/manutenzione` | pdf-stock/piscine/collaudo.jpg | Manutenzione piscina: controllo acqua e pulizia |

> ~26 modelli. Non è urgente (le immagini attuali funzionano), ma dedicate + coerenti
> alzano lo standard. Se vuoi, li facciamo a lotti come i modelli.

---

## 2. Varianti di copertina per AREA (la "base migliore per ogni azienda")

Idea: un set di **copertine alternative per area** in `public/cover-stock/<AREA>/`, così ogni
azienda sceglie lo stile. Oggi il set è pieno solo per alcune aree. **Target consigliato: 6-8
varianti per area** (1536×1024, stile del §2 di `prompt-immagini-modelli.md`).

| area (cartella cover-stock) | varianti oggi | da aggiungere per arrivare a ~6-8 |
|---|---|---|
| serramenti | 20 | — (già ricco) |
| bagni | 8 | — |
| fotovoltaico | 6 | +2 (vedi §3) |
| ristrutturazione | 6 | +2 |
| climatizzazione | 2 | **+5** |
| elettrico | 2 | **+5** |
| pavimenti | 2 | **+5** |
| piscine | 2 | **+5** |
| termoidraulico | 2 | **+5** |
| tetti | 2 | **+5** |
| pergole | 0 | **+6** (area nuova) |
| pareti-soffitti | 0 | **+6** (area nuova) |
| giardini | 0 | **+6** (area nuova, se confermi il Lotto 11) |
| facciate | 0 | **+6** |

> Soggetti: variazioni del tema dell'area (materiali, ambienti, luce diverse), sempre
> illustrative, senza marchi. Servono a dare scelta, non a rappresentare un modello preciso.

---

## 3. Fotovoltaico: l'area con più lavoro sui PRODOTTI

Nel repo il fotovoltaico ha **solo 18 voci prodotto**, e molte sono **categorie segnaposto**
(`tipologia-accessori`, `tipologia-batterie`, `tipologia-inverter`, `tipologia-moduli-fotovoltaici`,
`tipologia-ottimizzatori`, `tipologia-strutture-e-zavorre`, `tipologia-colonnine-di-ricarica`).

Le cartelle che hai caricato in `Downloads/Edilzia in cloud/` sono esattamente queste categorie:
**Accumulo (batterie), inverter, moduli, Ottimizzatore, Sistema ibrido, Colonnina di ricarica,
Zavorre** (+ `Climatizzatore`, `AGGIORNATE`, `DOCUMENTI INSTALLATORI`).

**Da creare:** una foto prodotto **800×800 WebP** per ogni prodotto reale di queste categorie
(es. i singoli moduli, inverter, batterie AlphaESS/Renova), in
`public/templates/fotovoltaico/products/<slug>.webp`. Servono gli **slug** dei prodotti reali:
te li do io dal listino FV appena mi dici da quale listino/azienda partire (Renova/AlphaESS),
oppure li ricavo dalle cartelle che hai caricato.

Prompt prodotto: quello del §6 di `prompt-immagini-modelli.md` (sfondo neutro, prodotto isolato).

---

## 4. Foto operative per settore (set sottili da completare)

Le pagine protezione/controlli/documenti/diario del PDF pescano da `public/pdf-stock/<settore>/`.
Alcuni settori hanno pochi file: se vuoi rinnovarli, servono 4-5 foto 1600×900 per settore.

| settore | file oggi | nota |
|---|---|---|
| termoidraulico | 3 | **magro** → +4 (protezione, controlli, documenti, diario) |
| elettrico | 4 | **magro** → +3 |
| pergole | 4 | ok (area nuova) |
| pavimenti | 8 | ok |
| gli altri | 9-43 | ok |

---

## 5. Prodotti: lista completa degli slug (409, per area)

Sotto l'elenco completo degli slug prodotto **già presenti** nel repo, per area. Servono a:
(a) sapere quali esistono, (b) decidere se rigenerarli in stile ottimizzato, (c) aggiungere le
varianti. Il nome file è `public/templates/<area>/products/<slug>.webp`.

> Il **fotovoltaico** è l'unico davvero incompleto (vedi §3). Le altre aree hanno un catalogo
> ampio già coperto: lì è opzionale (solo se vuoi rifarle in stile coerente).

## bagno (84 prodotti)
- applique-bagno
- banda-impermeabile-per-raccordi
- bidet-a-terra
- bidet-sospeso
- box-doccia-angolare-battente
- box-doccia-angolare-scorrevole
- box-doccia-pieghevole
- box-doccia-semicircolare
- canalina-doccia
- collante-per-rivestimenti-bagno
- colonna-contenitore-bagno
- colonna-doccia
- doccetta-con-flessibile-e-supporto
- grande-lastra-per-parete-bagno
- impermeabilizzante-bagno
- laminato-idoneo-al-bagno
- lampada-per-specchio
- lavabo-con-semicolonna
- lavabo-da-appoggio
- lavabo-da-incasso
- lavabo-sospeso
- lavatoio
- maniglione-di-sostegno
- miscelatore-bidet
- miscelatore-doccia-da-incasso
- miscelatore-doccia-esterno
- miscelatore-lavabo-alto
- miscelatore-lavabo
- mobile-bagno-a-terra
- mobile-bagno-sospeso
- mosaico-per-bagno
- pannello-doccia-piastrellabile
- parete-doccia-walk-in-nera-stile-industriale
- parete-doccia-walk-in-vetro-satinato
- parete-doccia-walk-in
- parete-sopravasca
- pavimento-bagno-in-gres
- pavimento-bagno-in-pietra
- pavimento-bagno-spc
- piano-per-lavabo
- piatto-doccia-filo-pavimento
- piatto-doccia-in-ceramica
- piatto-doccia-in-resina
- piletta-e-sifone-doccia
- placca-di-comando-wc
- porta-doccia-per-nicchia
- portarotolo
- portasciugamani
- rivestimento-ceramico-bagno
- rivestimento-gres-bagno
- rubinetto-vasca-freestanding
- rubinetto-vasca
- sanitari-per-disabili
- scaldasalviette-elettrico
- scaldasalviette-idraulico
- scaldasalviette-misto
- sedile-ribaltabile-doccia
- sedile-wc
- soffione-doccia
- specchiera-con-illuminazione
- specchio-bagno
- stucco-per-fughe-bagno
- telaio-e-cassetta-da-incasso
- tipologia-accessori-bagni
- tipologia-box-doccia
- tipologia-lavabi
- tipologia-materiali-di-posa
- tipologia-mobili-bagno
- tipologia-pavimenti
- tipologia-piatti-doccia
- tipologia-rivestimenti
- tipologia-rubinetteria
- tipologia-sanitari
- tipologia-sistemi-doccia
- tipologia-specchi-e-illuminazione
- tipologia-termoarredi
- tipologia-vasche
- vasca-angolare
- vasca-con-sportello-di-accesso
- vasca-freestanding
- vasca-idromassaggio
- vasca-rettangolare-da-incasso
- wc-a-terra
- wc-sospeso

## cappotto (24 prodotti)
- angolare-con-rete
- collante-di-sistema-cappotto
- giunto-per-facciata
- gocciolatoio-facciata
- lastra-per-controparete-isolante
- malta-da-ripristino
- membrana-per-isolamento-interno
- pannello-in-eps-grafitato
- pannello-in-lana-di-roccia-per-cappotto
- pannello-isolante-interno
- pannello-isolante-per-cappotto
- passivante-per-armature
- pittura-per-esterni
- primer-per-facciate
- profilo-di-partenza-cappotto
- rasante-di-sistema-cappotto
- rete-di-armatura-cappotto
- rivestimento-di-finitura-facciata
- tassello-per-cappotto
- tipologia-finiture-per-facciate
- tipologia-isolamento-interno
- tipologia-profili-e-raccordi-facciata
- tipologia-ripristini-e-balconi
- tipologia-sistemi-a-cappotto

## climatizzazione (25 prodotti)
- bocchetta-di-mandata-aria
- coibentazione-tubazioni-clima
- comando-ambiente-climatizzazione
- filtro-di-ricambio-vmc
- gateway-climatizzazione
- griglia-aria-esterna
- kit-antivibranti
- kit-monosplit-a-pavimento
- plenum-per-canalizzato
- sonda-temperatura-clima
- staffa-per-unita-esterna
- tipologia-accessori-climatizzazione
- tipologia-climatizzatori-monosplit
- tipologia-climatizzatori
- tipologia-linee-e-scarichi
- tipologia-regolazione-clima
- tipologia-sistemi-canalizzati
- tipologia-sistemi-multisplit
- tipologia-ventilazione-meccanica
- tubazione-frigorifera-coibentata
- tubo-scarico-condensa
- unita-interna-a-cassetta-multisplit
- unita-interna-canalizzata
- vmc-centralizzata
- vmc-puntuale

## elettrico (34 prodotti)
- alimentatore-led
- apparecchio-led
- armadio-di-rete
- attuatore-domotico
- canalina-elettrica
- cavo-elettrico
- centrale-allarme
- dispositivo-gestione-carichi
- gateway-domotico
- interruttore-differenziale
- interruttore-magnetotermico
- interruttore-serie-civile
- lampada-di-emergenza
- monitor-videocitofonico-interno
- motore-per-automazione
- placca-serie-civile
- postazione-videocitofonica-esterna
- presa-elettrica
- profilo-per-strip-led
- scaricatore-di-sovratensione
- scatola-di-derivazione
- sensore-domotico
- supporto-serie-civile
- telecamera-di-sicurezza
- tipologia-cavi-e-canalizzazioni
- tipologia-domotica-e-automazioni
- tipologia-illuminazione
- tipologia-quadri-e-protezioni
- tipologia-reti-dati-e-sicurezza
- tipologia-ricarica-veicoli
- tipologia-serie-civili
- tipologia-videocitofonia
- tubo-corrugato-elettrico
- wallbox-per-veicolo-elettrico

## fotovoltaico (18 prodotti)
- back-up-box-plus-trifase
- base-per-batteria-3-8-o-9-3-kwh
- cavo-collegamento-bat-trifase-colonne-aggiuntive
- cavo-collegamento-batterie-colonne-aggiuntive
- cavo-collegamento-inv-bat-trifase
- kit-parallelizzazione-20-kw
- meter-residenziale-alphaess
- staffa-a-muro-per-smile-g3-s
- staffa-a-muro-per-smile-g3-t10
- struttura-di-fissaggio-a-modulo
- tipologia-accessori
- tipologia-batterie
- tipologia-colonnine-di-ricarica
- tipologia-inverter
- tipologia-moduli-fotovoltaici
- tipologia-ottimizzatori
- tipologia-strutture-e-zavorre
- trina-vertex-470

## pavimenti (34 prodotti)
- autolivellante-per-pavimento
- battiscopa
- collante-per-pavimento
- decking-per-esterni
- giunto-per-pavimento
- grande-lastra-in-gres
- gres-da-esterno
- gres-effetto-legno
- gres-effetto-marmo
- massello-autobloccante
- massetto-per-pavimento
- materassino-sottopavimento
- microcemento
- mosaico-per-rivestimento
- parquet-a-spina-di-pesce
- parquet-massello
- parquet-prefinito
- pavimento-laminato
- pavimento-lvt
- pavimento-spc
- piastrella-in-gres-porcellanato
- pietra-naturale-per-pavimento
- primer-per-resina
- protettivo-per-parquet
- protettivo-per-resina
- resina-di-fondo
- soglia-di-raccordo
- stucco-per-pavimenti
- tipologia-ceramica-e-gres
- tipologia-laminati-e-vinilici
- tipologia-parquet
- tipologia-profili-e-finiture
- tipologia-resine-e-microcementi
- tipologia-sottofondi-e-posa

## piscine (26 prodotti)
- cassero-per-piscina
- centralina-trattamento-piscina
- copertura-automatica-piscina
- copertura-estiva-piscina
- copertura-invernale-piscina
- elettrolizzatore-piscina
- faro-piscina
- filtro-piscina
- impermeabilizzante-per-piscina
- liner-per-piscina
- membrana-armata-piscina
- mosaico-per-piscina
- pannello-strutturale-piscina
- pompa-di-calore-piscina
- pompa-piscina
- prodotto-trattamento-acqua-piscina
- scala-piscina
- skimmer
- tipologia-bordi-e-dotazioni
- tipologia-coperture-piscina
- tipologia-filtrazione-e-circolazione
- tipologia-riscaldamento-piscina
- tipologia-rivestimenti-piscina
- tipologia-strutture-piscina
- tipologia-trattamento-acqua-piscina
- vasca-prefabbricata-piscina

## ristrutturazione (25 prodotti)
- aggregato-per-impasto
- autolivellante-per-sottofondo
- blocco-alleggerito-per-divisorio
- blocco-per-muratura
- finitura-decorativa-per-interni
- idropittura-per-interni
- intonaco-di-fondo
- lastra-in-gesso-rivestito
- lastra-per-ambiente-umido
- laterizio-per-tramezzo
- malta-premiscelata
- massetto-premiscelato
- nastro-di-mascheratura
- pannello-isolante-per-divisorio
- paraspigolo-per-intonaco
- primer-per-interni
- protezione-per-pavimenti
- rasante-per-interni
- rete-di-armatura-intonaco
- telo-di-protezione-cantiere
- tipologia-intonaci-e-rasanti
- tipologia-leganti-e-sottofondi
- tipologia-materiali-di-protezione
- tipologia-murature-e-divisori
- tipologia-pitture-e-finiture

## serramenti (73 prodotti)
- cassonetto-effetto-legno.svg
- cassonetto-effetto-legno
- cassonetto-pvc-isolato.svg
- cassonetto-pvc-isolato
- controtelaio-per-serramento
- kit-guarnizioni-per-serramento
- lamelle-fisse.svg
- lamelle-fisse
- lamelle-orientabili.svg
- lamelle-orientabili
- lamelle-regolabili.svg
- maniglia-per-serramento
- motore-tubolare-per-avvolgibile
- persiana-angolo-2-ante.svg
- persiana-angolo-3-ante.svg
- persiana-con-sopraluce.svg
- persiana-finestra-1-anta-dx.svg
- persiana-finestra-1-anta-sx.svg
- persiana-finestra-2-ante-asimmetriche-principale-dx.svg
- persiana-finestra-2-ante-asimmetriche-principale-sx.svg
- persiana-finestra-2-ante.svg
- persiana-finestra-3-ante-1-2-dx.svg
- persiana-finestra-3-ante-2-1-sx.svg
- persiana-finestra-3-ante.svg
- persiana-finestra-4-ante-2-2.svg
- persiana-finestra-4-ante.svg
- persiana-libro-2-ante.svg
- persiana-libro-3-ante.svg
- persiana-libro-4-ante.svg
- persiana-pacchetto-3-ante-dx.svg
- persiana-pacchetto-3-ante-sx.svg
- persiana-pacchetto-4-ante-dx.svg
- persiana-pacchetto-4-ante-sx.svg
- persiana-pannello-fisso-laterale.svg
- persiana-pannello-fisso-superiore.svg
- persiana-portafinestra-1-anta-dx.svg
- persiana-portafinestra-1-anta-sx.svg
- persiana-portafinestra-2-ante-asimmetriche-principale-dx.svg
- persiana-portafinestra-2-ante-asimmetriche-principale-sx.svg
- persiana-portafinestra-2-ante.svg
- persiana-portafinestra-3-ante-1-2-dx.svg
- persiana-portafinestra-3-ante-2-1-sx.svg
- persiana-portafinestra-3-ante.svg
- persiana-portafinestra-4-ante-2-2.svg
- persiana-portafinestra-4-ante.svg
- persiana-scorrevole-1-anta-dx.svg
- persiana-scorrevole-1-anta-sx.svg
- persiana-scorrevole-2-ante-sovrapposte.svg
- persiana-scorrevole-2-ante.svg
- porta-blindata-2-ante.svg
- porta-blindata-classe-3.svg
- porta-blindata-classe-4.svg
- porta-interna-battente.svg
- porta-interna-scorrevole-esterno-muro.svg
- porta-interna-scorrevole-scomparsa.svg
- porta-interna-soffietto.svg
- tapparella-alluminio.svg
- tapparella-alluminio
- tapparella-pvc.svg
- tapparella-pvc
- tipologia-accessori-serramenti
- tipologia-cassonetti
- tipologia-persiane-e-scuri
- tipologia-porte-blindate
- tipologia-porte-da-interno
- tipologia-serramenti
- tipologia-tapparelle
- tipologia-zanzariere
- zanzariera-laterale.svg
- zanzariera-laterale
- zanzariera-molla-classica.svg
- zanzariera-molla-classica
- zanzariera-plisse

## termoidraulico (34 prodotti)
- addolcitore
- bollitore-sanitario
- circolatore-di-ricircolo-sanitario
- circolatore-impianto
- collettore-idrico
- collettore-radiante
- cronotermostato
- dosatore-trattamento-acqua
- filtro-acqua
- modulo-di-integrazione-ibrido
- pannello-per-riscaldamento-radiante
- raccordo-idrico
- radiatore
- regolatore-per-sistema-ibrido
- scaldacqua-a-pompa-di-calore
- scaldacqua-elettrico
- sistema-ibrido-abbinato
- termoarredo-riscaldamento
- tipologia-acqua-calda-sanitaria
- tipologia-caldaie
- tipologia-pompe-di-calore-e-sistemi-ibridi
- tipologia-radiatori-e-terminali
- tipologia-regolazione-e-sicurezza
- tipologia-reti-idrico-sanitarie
- tipologia-sistemi-ibridi
- tipologia-sistemi-radianti
- tipologia-trattamento-acqua
- tubo-multistrato-idrico
- tubo-per-impianto-radiante
- tubo-scarico-sanitario
- valvola-di-sicurezza
- valvola-termostatica
- vaso-di-espansione
- ventilconvettore

## tetti (32 prodotti)
- accesso-di-ispezione-copertura
- bocchettone-di-scarico-tetto
- canale-di-gronda
- colmo-per-copertura
- coppo
- dispositivo-di-ancoraggio
- fermaneve
- finestra-da-tetto
- fissaggio-per-manto-di-copertura
- freno-al-vapore-per-tetto
- kit-linea-vita
- lastra-metallica-di-copertura
- listello-sottotegola
- lucernario
- membrana-impermeabile-per-copertura
- oscurante-per-finestra-da-tetto
- pannello-di-supporto-copertura
- pannello-in-fibra-di-legno-per-tetto
- pannello-isolante-in-lana-minerale-per-tetto
- pannello-sandwich-per-tetto
- pannello-sintetico-per-copertura
- pluviale
- raccordo-di-posa-per-finestra-da-tetto
- tegola-in-laterizio
- telo-traspirante-sottotegola
- tipologia-accessori-copertura
- tipologia-finestre-da-tetto
- tipologia-isolanti-per-coperture
- tipologia-manti-di-copertura
- tipologia-orditure-e-supporti
- tipologia-sicurezza-in-copertura
- trave-per-copertura

