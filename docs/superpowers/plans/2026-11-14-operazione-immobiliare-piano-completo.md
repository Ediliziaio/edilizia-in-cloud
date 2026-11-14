# Operazione immobiliare: come si gestisce, cosa non va, in che ordine si sistema

Data: 14/11/2026. Caso: URBAN VISION, tre operazioni di sviluppo (O-0001 Cherubini, O-0002 Via
Callimaco 28, O-0003 Via Antonio Lotti 196). Il cliente oggi gestisce la **costruzione**;
la vendita viene dopo (Florin, 14/11). Questo documento assorbe
[l'operazione appena caricata](2026-11-14-operazione-appena-caricata.md) (lotti 0-4 fatti) e
l'analisi di O-0003 dello stesso giorno.

---

## 1. Come si gestisce un'operazione immobiliare

Un'operazione è **un investimento con un cantiere dentro**: si compra un terreno o un
immobile, si costruisce o si ristruttura, si vende. Il guadagno si misura sull'operazione
intera, non sul singolo appartamento. Nel sistema:

```
Operazione = commessa generale «Sviluppo immobiliare»
├── Piano economico   il business plan: ricavi, costi per voce, mesi → budget approvato
├── Cantiere          UNO per tutta l'operazione: fasi, ditte, ordini, DDT, rapportini, fatture
├── Investitori       chi mette i soldi: mezzi propri, soci, banca (mutuo edilizio a SAL)
├── Documenti         permesso di costruire, titolo, DURC, collaudi, agibilità…
└── Unità             ciò che si vende: appartamenti, posti auto, box (una commessa figlia ciascuna)
```

### Le fasi della vita di un'operazione

| Fase | Cosa succede | Dove si registra |
|---|---|---|
| 1. Acquisto | terreno o immobile, notaio, imposte | costi sulla **generale** (categoria «Acquisto immobile») |
| 2. Progetto e permessi | progettisti, relazioni, oneri, permesso | costi sulla generale; documenti nella scheda Documenti |
| 3. Costruzione | ditte, materiali, operai interni, noli, sicurezza | **cantiere della generale**: fasi, ODA, DDT, fatture, rapportini |
| 4. Commercializzazione | agenzia, rendering, pubblicità | costi sulla generale; unità messe in vendita col listino |
| 5. Vendita | prenotazione, compromesso (caparra/acconti con fideiussione), rogito | **sulla singola unità**: stato, acquirente, prezzo, incassi |
| 6. Chiusura | collaudi, agibilità, accatastamento, rendiconto agli investitori | generale; rendiconto e report mensile |

### Regola su dove va ogni cosa

- **Sulla generale** tutto ciò che riguarda l'edificio: acquisto, progetto, costruzione,
  finanziamento, spese generali. È qui che si controlla il margine.
- **Sull'unità** solo ciò che è di quell'unità: l'acquirente, il prezzo pattuito, caparre e
  acconti, le varianti di capitolato chieste dall'acquirente, i costi fatti solo per lei.
- **I costi: due modi, li sceglie l'azienda** (Florin, 14/11). Si può tenere tutto sulla
  generale e far dividere i costi alle unità con un criterio — millesimi, m², importo o parti
  uguali, scelto nella vista «Costi di commessa» del piano (`CriterioRipartizione`, «automatico»
  usa il primo dato presente) —, oppure caricare un costo direttamente sull'unità, o dividere
  una spesa in percentuale tra più commesse («spesa divisa», `company_costs.allocations`).
  Qualunque sia il modo, il margine vero è quello dell'operazione; quello per unità è una
  lettura.
- **Il controllo** è sempre: budget approvato → costi registrati → stima a finire →
  scostamento per voce; cassa mese per mese → capitale massimo impegnato → coperto dalle fonti?

### Cosa è chiaro e cosa va deciso con il titolare

Il modello è chiaro e il sistema lo copre quasi tutto. Restano decisioni che cambiano **come**
si registra, e che non si possono dedurre dai file:

| # | Domanda | Perché conta | Cosa dicono i dati |
|---|---|---|---|
| D1 | Le operazioni restano in URBAN VISION o ognuna avrà una sua società (SPV)? | con le SPV fatture, IVA e banca vanno su aziende diverse, da subito | 38 fatture tutte intestate a URBAN VISION; il piano ha «costi di gestione SPV» |
| D2 | La costruzione la fa URBAN VISION (operai propri + subappalti per lavorazione) o un'impresa in appalto? | nel primo caso fasi e squadre; nel secondo un contratto d'appalto con SAL | Callimaco: «operai interni 90.000 €», DUEZETA in subappalto |
| D3 | Si vende sulla carta (compromessi e acconti durante i lavori)? | servono fideiussioni (D.Lgs. 122/2005) e incassi prima del rogito | «Fideiussioni per acconti clienti 15.000 €» in tutti e tre i piani |
| D4 | Mutuo edilizio a stati d'avanzamento? | le erogazioni della banca seguono i SAL: cassa e capitale cambiano | «Interessi su mutuo edilizio 90.000 €» in tutti e tre |
| D5 | Inizio di Cherubini e Lotti | il calendario è ipotizzato (12/2026) | i file dicono solo «lavori 15 mesi» |
| D6 | Le 32 stime di costruzione di Cherubini e Lotti | senza, margine e capitale restano sospesi | le voci ci sono, a zero («opere da computo») |
| D7 | Le «Unità N» sono appartamenti? m² e millesimi? | servono a ripartire i costi comuni e al listino | il piano non lo dice |
| D8 | Le fasi del cantiere | vedi lotto 6 | 0 fasi oggi |

---

## 2. Stato di oggi (verificato il 14/11)

**Registrazioni provate** con l'utente di URBAN VISION in transazioni annullate:

| Prova | Esito |
|---|---|
| Costo sulla generale (10.000 €) | nel piano e nei costi comuni ✓ |
| Costo su un'unità (3.000 €) | nel piano dell'operazione e nel costo dell'unità ✓ |
| Compromesso + caparra 42.000 € | incassato, incassi del piano, prima nota con IVA 10% ✓ |
| Caparra con data futura, compromesso senza acquirente | rifiutati ✓ |

**Già sistemato oggi** (su main): piano coi mesi e calendario rapido, unità create dal piano
(44), percorso «Completa l'operazione», elenco commesse con le unità dentro la generale e
senza listino «da incassare» (`3b44a7600`, `02fee1086`); dati: categorie di costo agganciate,
tipi dei fornitori, DUEZETA in reverse charge, mesi dei tre piani.

**Non visto a schermo**: schede Unità e vendite, Investitori e Documenti di O-0003 (l'azienda
attiva sul server era passata a Demo Azienda 2 da un'altra finestra).

---

## 3. Lotti

Ogni lotto: verifica a schermo su O-0002, O-0003 e Demo Azienda 1 (O-0096), test, CI verde,
pubblicazione. Le migrazioni seguono CLAUDE.md (idempotenti, `apply_migration`, riallineamento
della versione, numerazione `2029…`).

### Lotto 1 — P0 · La pagina dell'operazione va in timeout — FATTO 14/11 (`20290322090000`)
`generale_unita_elenco` e `scheda_commessa` rispondono 500 dopo 8 s. Leggono
`v_ordine_marginalita`, che avvolge `private.office_order_economics_projection()` e ricalcola
l'economia di **tutte** le commesse visibili a ogni lettura (1,4 s per 47 commesse; il filtro
per id non entra). `generale_unita_elenco` la legge 11 volte su O-0003 (3,9 s da sola);
`private.office_order_economics_base` filtrata per id: 29 ms. La usa anche
`generale_piano_righe_reali`.
- Funzione `economia_commesse(p_ids uuid[])`, SECURITY DEFINER, stessi diritti della
  proiezione (`office_order_rights`, `office_visible_order`) applicati ai soli id chiesti;
  `REVOKE … FROM PUBLIC, anon`, `GRANT` ad `authenticated`.
- La usano `generale_unita_elenco` (una lettura per tutte le figlie), `generale_piano_righe_reali`
  e `scheda_commessa`.
- **Fatto quando**: tempi misurati prima/dopo (obiettivo < 300 ms per O-0003), stessi numeri
  di prima su 3 commesse di aziende diverse, la Panoramica non cambia più i numeri dopo il caricamento.
- Dopo: l'elenco commesse legge `v_ordine_marginalita` con `.in("id", …)` per pagina — stessa
  causa, stesso rimedio.

### Lotto 2 — P0 · I costi con pagamento ignoto finiscono nel 9999 — FATTO 14/11 (`20290322090000`)
`generale_piano_righe_reali` data una spesa con `coalesce(paid_date, due_date, created_at)`; la
convenzione «pagamento ignoto» è `due_date = 9999-12-31`. Su Callimaco 738.937 € (l'acquisto)
stanno nel mese 9999-12: fuori da cassa, capitale impegnato, andamento. Nel sistema: 138 costi
in 6 aziende.
- Data della spesa: `coalesce(paid_date, nullif(due_date, '9999-12-31'), documento_data,
  data della fattura ricevuta collegata, created_at)`.
- **Fatto quando**: il capitale impegnato di Callimaco comprende l'acquisto a 09/2026; un test
  con un costo sentinella.

### Lotto 3 — P1 · I costi sulla voce giusta del piano — FATTO 14/11 (`20290322091000`)
«Opere civili» e «Finiture» finiscono sulla prima voce della costruzione: quando la categoria
del costo non è agganciata a una voce, l'abbinamento (`generale_piano_rango`) prende la prima per
ordine. È il difetto che il 14/11 mostrava −97.046 € finti su Callimaco.
- Prima della prima voce: la voce della stessa categoria col nome più vicino (parole in comune,
  normalizzate).
- Un costo che non trova una voce va in «da abbinare», con l'azione «Aggancia» (che esiste:
  `AgganciaCategorieDialog`), invece di finire sulla prima.
- **Fatto quando**: i costi di prova vanno su «Opere civili secondo computo» e su «da abbinare».

### Lotto 4 — P1 · L'unità non è un contratto finché non si vende — FATTO 14/11 (`20290322092000`)
- `generale_unita_nuova_commessa`: nessuno stato di lavorazione alla nascita (oggi lo stato
  predefinito dell'azienda, «Contratto Firmato», su tutte le 73 unità del sistema).
- Dettaglio unità, vista a colonne, schede mobile, conteggi per stato: lo stato di vendita,
  come l'elenco (`02fee1086`). `OrdersPipelineCard` non conta il listino come da incassare.
- Margine di un'unità solo dal compromesso; prima «—» (oggi è il listino).
- Documenti dell'unità obbligatori dalla prenotazione (oggi 27 mancanti su O-0003, 59 su O-0002
  per unità che nessuno vende ancora).

### Lotto 5 — P2 · La Panoramica di un'operazione in costruzione — FATTO 14/11
Oggi parla di vendite (tabella di tutte le unità, documenti di vendita) e ha due percorsi di
avvio. Per chi costruisce, in quest'ordine:
1. I quattro numeri (ricavi previsti, capitale impegnato, margine a finire, da incassare).
2. **Un solo percorso** «Completa l'operazione»: unità, mesi, stime, approvazione e il quinto
   passo «da dove arrivano i soldi» (oggi in «Per partire», che sparisce).
3. **Il cantiere**: fasi e avanzamento, costi del mese contro budget del mese, ultimi DDT e fatture.
4. Composizione dei costi.
5. Unità in **una riga** («10 unità · tutte libere · listino 4.480.000 €» → scheda Unità e
   vendite) finché nessuna è venduta; la tabella torna dalla prima prenotazione.
- Nel Cantiere, «Registra e consulta su»: la generale in cima, le unità in un gruppo chiuso.

### Lotto 6 — P3 · Il cantiere dal piano (dopo D2 e D8)
Le voci di costruzione del piano (32-34 per operazione) sono in parte lavori (opere civili,
impianti, serramenti) e in parte costi (magazzini edili, assicurazioni, locazione ufficio).
Proposta da far scegliere al titolare:
- fasi standard: allestimento, scavi e fondazioni, strutture, tamponature e coperture,
  impianti, serramenti, finiture, sistemazioni esterne;
- date dal calendario del piano; sotto ogni fase le voci del piano che la compongono come
  **costo previsto** (la funzione esiste per le commesse: costo previsto per fase);
- le voci che non sono lavori restano costi della generale, senza fase.
- Con D2 = appalto: niente fasi proprie, un contratto d'appalto con SAL (modulo esistente).

### Lotto 7 — Dati di URBAN VISION (con il titolare)
- D5: inizio di Cherubini e Lotti → «Calendario» del piano.
- D6: le 32 stime → «Completa le stime»; poi approvazione dei tre budget.
- D4/D1: fonti in Investitori (mezzi propri, mutuo con erogazioni a SAL).
- D7: tipologia, m² e millesimi delle «Unità N».
- I costi «storici» con pagamento ignoto: confermare quali sono pagati (allora `paid_date` =
  data fattura) e quali ancora da pagare (allora una scadenza vera).

### Lotto 8 — Vendite (quando partono)
Già nel sistema: prenotazione, compromesso con caparra, acconti, rogito, permuta, varianti di
capitolato, listino PDF. Da verificare prima che servano: fideiussione per gli acconti
(D.Lgs. 122/2005) e polizza decennale postuma all'atto; IVA 10% / 4% prima casa / 22% lusso
per unità; provvigione dell'agenzia per unità.

---

## 4. Ordine e stima

| Ordine | Lotto | Dipende da | Stima |
|---|---|---|---|
| 1 | Lotto 1 velocità | — | mezza giornata |
| 2 | Lotto 2 date dei costi | — | 2 ore |
| 3 | Lotto 3 abbinamento | — | mezza giornata |
| 4 | Lotto 4 unità non contratto | — | mezza giornata |
| 5 | Lotto 5 Panoramica | 1-4 | una giornata |
| 6 | Lotto 7 dati | risposte D1-D7 | col titolare |
| 7 | Lotto 6 cantiere dal piano | D2, D8 | mezza giornata |
| 8 | Lotto 8 vendite | quando si vende | — |

I lotti 1-4 non chiedono niente al titolare e si possono fare subito.

## Com'è andata (14/11, lotti 1-4)

- **Lotto 1.** `economia_commesse(ids)`: elenco unità O-0003 3.859 → 81 ms, O-0002 2.750 →
  149 ms; scheda commessa 1.677 → 277 ms. Confronto riga per riga con la vista su Ke Bei
  (385 commesse, amministratore e utente senza commesse): identico. Restano sulla vista
  l'elenco commesse (margini della pagina) e gli altri lettori: stesso rimedio quando serve.
- **Lotto 2.** Il reale del piano di Via Callimaco ora sta in 09-11/2026, non più nel 9999.
- **Lotto 3.** Nuova chiave «costruzione» (opere, scavi, strutture, finiture…) e
  `generale_piano_somiglianza`. Sulle 92 righe reali di 14 generali nessun abbinamento cambia;
  i costi di prova vanno su «Opere civili secondo computo», «Impianti elettrici», «Nolo
  macchinari». Il «da abbinare» esplicito resta da fare.
- **Lotto 4.** Le unità nuove nascono senza stato di lavorazione. **Le 73 esistenti no**: cambiare
  lo stato di una commessa fa partire automazioni, notifiche e webhook; l'elenco mostra già lo
  stato di vendita. Margine di un'unità libera o prenotata: nessuno (prima il listino). Documenti
  di vendita di un'unità: dovuti dalla prenotazione. La vista a colonne, senza filtri, non mostra
  più le unità (paginazione al primo livello).
- **Lotto 5.** Verificato a schermo su Via Callimaco a 1366 px. Percorso unico a 5 passi
  (il quinto «Da dove arrivano i soldi»; «Per partire» non compare più per sviluppo e
  compravendita col piano). Riquadro Cantiere (`RiquadroCantiereOperazione`): fasi e
  avanzamento, uscite del mese contro il previsto del piano (5.869 € su 17.905 € a novembre),
  ultimi costi. Unità in una riga finché sono tutte libere, senza il grafico delle vendite;
  tornano tabella e grafico dalla prima prenotazione. Nel Cantiere le unità sono un gruppo a
  parte sotto la generale. Documenti mancanti di Via Callimaco: 59 → 7.

