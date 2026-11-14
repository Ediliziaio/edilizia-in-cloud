# Rapportino economico: ore, costo sostenuto, prezzo al committente, margine (14/11/2026)

Seguito delle Fasi 2 e 3 di `piano-anomalie-rapportini-listini-20261114.md`. Richiesta del titolare:
«il rapportino deve contare le ore, senza casini», e poter scaricare **tre** rapportini dallo stesso
giorno: quello **senza costi** (cosa è stato fatto), quello **con i costi sostenuti**, quello **con il margine**.

## 1. Il modello: quattro strati, sempre separati

| Strato | Cosa c'è | Chi lo vede | Da dove viene |
|---|---|---|---|
| **Fatti** | persone e ore (ordinarie, straordinarie, festive), mezzi e ore, voci (trasporti, materiali, lavorazioni, noli) con quantità | tutti quelli che vedono il rapportino | dal campo; l'ufficio corregge |
| **Costo sostenuto** | ore × costo orario della persona (o costo medio), ore × costo orario del mezzo, quantità × costo della voce, ditta esterna dalla sua tariffa | chi ha «Costi» | scheda dipendente, scheda mezzo, listino generale (costo interno), listino della ditta |
| **Prezzo al committente** | ore × tariffa di manodopera, voci × prezzo, maggiorazioni straordinario/festivo | chi ha «Importi» | regola unica: eccezione di cantiere → listino del committente → listino generale → «da definire» |
| **Margine** | prezzo − costo, riga per riga e in totale | chi ha «Margini» | calcolato; **mai** se un costo o un prezzo manca |

Ogni numero porta con sé la sua provenienza e la data: il rapportino fotografa costo e prezzo del giorno,
un listino cambiato dopo non lo tocca. Un numero che manca non vale mai 0: si dice «da completare» o «da definire».

Commessa **a corpo**: il rapportino ha fatti e costi, il prezzo per riga non c'è (il ricavo è il contratto);
il margine del giorno non si calcola, si dice perché.

## 2. L'esempio del titolare, che deve tornare al centesimo

8 operai × 8 h, costo medio 32 €/h; venduto in economia al committente col suo listino particolare a 38 €/h;
trasporto venduto 200 €, sostenuto 200 €.

| | Quantità | Costo | Prezzo | Margine |
|---|---|---|---|---|
| Manodopera | 64 h | 2.048,00 € | 2.432,00 € | 384,00 € |
| Trasporto | 1 viaggio | 200,00 € | 200,00 € | 0,00 € |
| **Totale** | | **2.248,00 €** | **2.632,00 €** | **384,00 €** (14,6%) |

## 3. Le simulazioni su Demo Azienda 2 (ognuna con il suo esito atteso)

| # | Caso | Atteso |
|---|---|---|
| S1 | L'esempio sopra, commessa del committente in economia | i numeri della tabella |
| S2 | Stesso lavoro, cliente privato senza listino | prezzi dal listino generale |
| S3 | Committente con listino senza la voce trasporto | trasporto dal generale, manodopera dal committente |
| S4 | Voce in nessun listino | «prezzo da definire», margine non dato |
| S5 | Un operaio senza costo orario | «costo da completare», margine non dato |
| S6 | 2 h di straordinario e un festivo | maggiorazioni del contratto sul prezzo; il costo segue la scheda |
| S7 | Ditta esterna in subappalto (4 h) | costo dal listino della ditta, prezzo dal committente |
| S8 | Mezzo di proprietà (5 h) e mezzo a noleggio | ore × costo orario; noleggio «da fattura», non contato due volte |
| S9 | Commessa a corpo | fatti e costi sì, prezzo per riga no, margine «a corpo» |
| S10 | Prezzo cambiato a mano, poi listino aggiornato | il rapportino tiene il prezzo del giorno e dice «a mano» |
| S11 | Capocantiere che compila | vede ore e fatti, nessun euro |
| S12 | Capo e operaio scrivono le stesse ore | contate una volta |
| S13 | Rapportino approvato e poi corretto | costi registrati rifatti, storico tenuto |

Ogni simulazione gira in una transazione annullata (prima dell'applicazione) e poi, migrazioni applicate,
come rapportini veri di Demo 2 marcati «SIMULAZIONE», guardati nel browser da super admin come ufficio e
come capocantiere, scaricando i tre PDF.

## 4. I lotti

| Lotto | Cosa | Stato |
|---|---|---|
| A | Prezzo delle voci con la regola unica, fotografia, costo da completare | fatto (ramo), migrazione 20290318120000 da applicare |
| B | **Manodopera prezzata per tutte le commesse**: tariffa oraria dalla stessa regola (voce di manodopera del listino generale; il committente la sostituisce), per qualifica o generica della commessa; maggiorazioni straordinario/festivo | da fare |
| C | Rendiconto del committente: la voce presa dal suo listino porta la tariffa e **non** è «extra contratto» | da fare |
| D | Unità diverse fra generale e committente: bloccate con avviso, non moltiplicate | da fare |
| E | Prezzo scritto a mano da chi ha «Importi» anche senza «Costi»; voce modificabile senza toglierla | da fare |
| F | **Tre PDF**: operativo (com'è oggi), costi sostenuti, con margine; ognuno solo a chi ha il permesso | da fare |
| G | Commessa: riepilogo economico e Controllo di Gestione dicono «incompleto» quando manca un costo | da fare |
| H | Collegamento dei listini dei committenti esistenti: proposta per codice, conferma umana | da fare |
| I | Il vecchio catalogo voci del rapportino confluisce nel listino generale | dopo |

Ordine: B, C, D (toccano i soldi) → F (i tre PDF) → E, G → H, I.

## 5. Decisioni prese (dal titolare, 14/11)

- Si parte dal listino generale; se il committente ha la voce, vale il suo prezzo; eccezione di cantiere sopra tutto.
- Collegamento per voce (id), mai per descrizione somigliante.
- Prezzo 0 nel listino = «da definire».
- Il PDF operativo resta senza soldi; gli altri due sono documenti interni.
