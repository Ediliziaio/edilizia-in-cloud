# Rendiconto dai rapportini: prendere tutto, poterlo verificare

**27/11/2026.** Nato dalla domanda di un'impresa in appalto: «adesso dobbiamo fare le fatture e i
rendiconti per i committenti, abbiamo una serie di rapportini, come si procede?».

La risposta onesta oggi è: **si perde roba, e non lo dice nessuno.** Questo piano
parte dai loro dati veri, non da come il modulo è stato immaginato.

Vedi anche `docs/piano-commessa-appalto.md` (il modulo) e
`docs/piano-rapportino-economico-rendiconto.md` (il rapportino come unica cosa che
si scrive).

---

## 1. Lo stato di fatto, contato sui dati di un'impresa in appalto

Dati reali di un'impresa che lavora in appalto, al 27/11/2026.

| Cosa | Quanto |
|---|---|
| Rapportini totali | 104 |
| di cui **approvati** | **15** |
| Rapportini con «materiali usati» | **0** |
| Rapportini con voci libere | **66** |
| Rapportini con mezzi | 35 |
| Voci libere totali | 137 (≈ **64.500 €** di vendita scritta) |
| Commesse d'appalto | 61 (29 a corpo, 32 a misura) |
| di cui agganciate a un contratto | **1** |
| Tariffe del committente | 37 (su quell'unico contratto) |
| Righe di rendiconto | **0** |
| Rendiconti al committente emessi | **0** |

Due letture che contano:

1. **Il campo «materiali usati» non lo usa nessuno.** Il materiale di consumo —
   CALCESTRUZZO IN SACCHI, RASANTE A96, LASTRE CARTONGESSO, CHIUSINO GHISA,
   CELLOPHANT, VITI E STUCCO, MARMI — lo scrivono nelle **voci libere**. Qualsiasi
   lavoro sul rendiconto che guardi `materiali_usati` lavora su un campo vuoto.
2. **Il lavoro è già scritto, il rendiconto è vuoto.** 137 voci e 64.500 € di
   vendita stanno nei rapportini; nel rendiconto ci sono zero righe. Non è pigrizia
   dell'ufficio: è che la strada dal rapportino al rendiconto si interrompe in
   quattro punti diversi.

---

## 2. I difetti, in ordine di soldi persi

### D1 — 50.945 € di voci finiscono su commesse «cliente» e la vendita viene buttata

`rapportino_voce_applica` (migrazione `20290417090100`) fa, alla fine:

```sql
select o.order_type into v_ord from public.orders o where o.id = v.order_id;
v_ric := coalesce(v.vendita_unitaria, 0);
if v_ord.order_type is distinct from 'appaltatore_lavoro' or v_ric <= 0 then
  delete from public.appalto_rendiconto_righe where voce_libera_id = v.id and stato = 'bozza';
  return;                                   -- ⚠️ la vendita non va in nessun posto
end if;
```

Contato: **68 voci su commesse `order_type = 'cliente'`, 50.945 € di vendita.** Il
costo finisce in `company_costs`, la vendita **evapora**. Non c'è un elenco che lo
dica, non c'è un errore, non c'è una riga in bozza da confermare.

Non è un bug di scrittura: è una **decisione mancante**. Su una commessa `cliente`
il rendiconto d'appalto non esiste, e nessuno ha deciso dove vada la vendita di una
voce di rapportino. Finché non si decide, quei soldi non si fatturano.

### D2 — 47 voci con prezzo di vendita «1», che diventano righe da un euro

Dai dati veri: `MARMI 16 ml × 1,00`, `LASTRE CARTONGESSO 7,2 mq × 1,00`,
`CHIUSINO GHISA 50X50 C250 1 cad × 1,00`, `CELLOPHANT 1 a.c. × 1,00`,
`VITI E STUCCO 1 a.c. × 1,00`.

**47 voci su 137** hanno `vendita_unitaria = 1`. Un chiusino in ghisa non costa un
euro: è il segno che il campo era obbligatorio e chi compilava non sapeva il prezzo,
o lo ha messo per uscire dalla schermata. Oggi quell'1,00 diventa una riga di
rendiconto e poi una riga di fattura, senza che niente lo metta in dubbio.

### D3 — 110 voci su 137 senza costo: il margine non esiste

`costo_unitario` è nullo in 110 casi. Il rendiconto mostrerà incasso e margine
vuoto. È accettabile se dichiarato, ma oggi si confonde con «margine zero».

### D4 — La rete di sicurezza copre solo la manodopera

`v_appalto_rapportini_da_rendicontare` è costruita su
`appalto_righe_da_rapportino_calcola`, che calcola **solo le ore delle persone**.
È l'unica vista «da rendicontare» che esiste nel database (verificato).

Quindi un rapportino con 9 ore di camion e zero ore uomo valorizzabili **non appare
da nessuna parte**. Caso vero del 23/11: un rapportino con un operaio a 9 h
(segnalato correttamente con «Più di una tariffa di manodopera senza qualifica:
scegli tu quale») e **un camion a tre assi, 9 h, `mezzi.tariffa_id = null`** →
il camion non è né rendicontato né elencato. Per un'impresa che fattura il
trasporto, è la voce che pesa.

### D5 — La provenienza si perde: blocca proprio il controllo incrociato

Nello stesso `rapportino_voce_applica`:

```sql
insert into public.appalto_rendiconto_righe (..., origine, rapportino_id, ..., voce_libera_id, ...)
values (..., 'manuale', null, ..., v.id, ...);
```

Una riga nata da una voce di rapportino si scrive `origine = 'manuale'` e
`rapportino_id = null`. In `RendicontoAppalto.tsx` la riga mostra l'origine solo se
è diversa da `manuale`, quindi **a schermo sembra scritta a mano dall'ufficio**. Il
legame esiste solo attraverso `voce_libera_id → rapportino_voci_libere.rapportino_id`.

È il difetto che rende impossibile la cosa che serve: aprire il rendiconto e vedere
da quali giornate viene.

### D6 — Gli errori vengono inghiottiti

```sql
-- appalto_rendiconto_da_rapportino()
begin
  perform public.appalto_rendiconto_crea_righe(new.id);
exception when others then null;    -- ⚠️
end;
```

Per la manodopera la vista ricalcola e rimostra la riga, quindi il danno è coperto.
Per tutto il resto, un errore qui è invisibile.

### D7 — Due regole diverse su «a corpo»

`appalto_righe_da_rapportino_calcola` esce subito se `valorizzazione = 'a_corpo'`
(giusto: le ore sono dentro il corpo d'opera). `rapportino_voce_applica` **non
guarda la valorizzazione**: su una commessa a corpo crea la riga comunque. Risultato
sui dati veri: 68 voci su commesse a corpo, 13.247 €, che entrano nel rendiconto
mentre le ore della stessa giornata no. Va deciso quale delle due è la regola.

### D8 — Tutto il rendiconto nasce «fuori contratto»

`extra_contratto` viene messo a `v.appalto_tariffa_id is null`. Nelle 137 voci di
quell'impresa `appalto_tariffa_id` è **sempre nullo** (il legame al listino del committente
non è mai stato scritto). Quindi ogni riga comparirà con l'etichetta «fuori
contratto» e nel riquadro «di cui … si discute a fine lavori». Un rendiconto
interamente fuori contratto non è credibile davanti al committente.

---

## 3. Che cosa deve fare, detto come lo direbbe l'ufficio

> Apro la commessa, vedo un rendiconto già composto da quello che hanno scritto i
> ragazzi. Per ogni riga posso chiedere **«questa da dove viene?»** e vedo le
> giornate, chi c'era, quante ore, cosa ha usato. Dove il prezzo non c'è o è strano,
> me lo dice. Correggo quantità e prezzo lì, e resta scritto che l'ho corretto io.
> Poi lo chiudo e lo mando.

Tre requisiti, in quest'ordine di importanza:

- **R1 — Prendere tutto.** Ogni cosa scritta in un rapportino approvato che ha un
  valore di vendita arriva nel rendiconto, oppure compare in un elenco di cose
  rimaste fuori **col motivo**. Nessuna terza via.
- **R2 — Poter verificare.** Dalla riga di rendiconto si risale alle giornate che
  l'hanno prodotta, e si confronta il prezzo applicato con il listino.
- **R3 — Poter modificare.** Quantità, prezzo e costo si correggono dal rendiconto,
  con traccia di chi e quando, senza tornare a riaprire i rapportini.

---

## 4. I lotti

### Lotto 0 — Rete di sicurezza unica: «cosa è rimasto fuori» *(prima di tutto)*

Senza questo non si può collaudare niente, perché non si sa cosa manca.

Una sola vista, `v_rapportini_da_rendicontare`, che sostituisce
`v_appalto_rapportini_da_rendicontare` ed elenca **per ogni rapportino approvato**
tutto ciò che non è diventato una riga di rendiconto, con la sorgente e il motivo:

| sorgente | da dove | motivo tipico |
|---|---|---|
| `manodopera` | `presenze` | nessuna tariffa per la qualifica |
| `voce_libera` | `rapportino_voci_libere` | commessa non d'appalto; vendita a zero |
| `mezzo` | `mezzi_usati` | `mezzi.tariffa_id` non impostata |
| `materiale` | `materiali_usati` | (oggi sempre vuoto: resta per completezza) |
| `subappalto` | presenze con `subappaltatore_id` | non si valorizza da sola |

Regola di scrittura: **una sola funzione per sorgente**, che restituisce righe
`(sorgente, riferimento_id, descrizione, quantita, unita, vendita_proposta, motivo)`,
e la vista le unisce. Così il riquadro a schermo e la funzione che crea le righe
leggono la stessa verità, come già fa oggi la manodopera.

A schermo: il riquadro «Giornate di campo non rendicontate» in
`RendicontoAppalto.tsx` diventa **«Rimasto fuori dal rendiconto»**, raggruppato per
sorgente, con «Crea riga» dove il motivo è vuoto e «Scrivi a mano» dove non lo è.

**Fatto quando:** sui 15 rapportini approvati di quell'impresa il riquadro elenca il
camion di 9 h del 23/11 e tutte le voci rimaste fuori. Oggi ne elenca una sola.

### Lotto 1 — D1: decidere dove va la vendita di una voce su commessa «cliente»

68 voci, 50.945 €. Tre strade possibili, da scegliere **con il titolare** prima di
scrivere una riga di SQL:

- **(a)** Il rendiconto d'appalto si apre anche alle commesse `cliente`: diventa il
  «rendiconto lavori» di qualunque commessa, e su `cliente` serve da base per la
  fattura a misura.
- **(b)** Su commessa `cliente` la voce diventa una **riga di fase** / una voce del
  SAL ordinario, cioè entra nel percorso di fatturazione che quelle commesse già
  hanno.
- **(c)** Si vieta di scrivere una vendita su una voce di commessa `cliente`: il
  campo si disabilita e si spiega perché.

Finché non è deciso, **Lotto 0 le fa comparire** fra le cose rimaste fuori con
motivo «commessa non d'appalto: la vendita non ha una destinazione». Meglio un
elenco imbarazzante che 50.945 € che evaporano.

> Nota: (c) è la più onesta tecnicamente ed è quella che rompe meno, ma cancella un
> lavoro che l'ufficio ha già fatto a mano 68 volte. Il fatto che l'abbiano fatto 68
> volte dice che (a) o (b) è ciò che si aspettano.

### Lotto 2 — D5: la provenienza, che apre il controllo incrociato

1. `rapportino_voce_applica` scrive `origine = 'rapportino'` e **`rapportino_id`
   valorizzato** (lo ha già: `v.rapportino_id`). `voce_libera_id` resta.
2. Ricucire le righe già create: `update … set origine='rapportino', rapportino_id = (select rapportino_id from rapportino_voci_libere …) where voce_libera_id is not null`.
   Oggi sono 53 righe in tutto il sistema, quindi è una migrazione dati innocua —
   ma vale la regola di CLAUDE.md: `lock_timeout`, ambito ristretto.
3. Controllare che la nuova `rapportino_id` non faccia sparire righe dalla rete di
   sicurezza: il ramo `rr.rapportino_id is null and … rr.employee_id = r.employee_id`
   della vista oggi non le intercetta (hanno `employee_id` nullo), ma dopo la
   modifica il primo ramo sì. Il test deve coprire **esattamente** questo.

### Lotto 3 — R2: il pannello «Da dove viene»

Il pezzo che ha chiesto Florin: si apre il rendiconto e a destra si vedono i
rapportini.

Un `Sheet` laterale (non un dialog: si deve poter leggere la riga e il dettaglio
insieme), aperto da un'icona su ogni riga di rendiconto **e** da un pulsante
«Verifica tutto» in testa al rendiconto.

Contenuto, per il periodo della riga o del rendiconto:

- **A sinistra, la riga** come andrà al committente: descrizione, quantità, prezzo,
  importo.
- **A destra, le giornate**: una scheda per rapportino, in ordine di data, con
  giorno, chi c'era e quante ore, i mezzi con le ore, le voci libere con quantità e
  unità, e la `descrizione_lavori` scritta in cantiere — che nei dati veri è
  l'unica cosa sempre presente ed è quella che spiega al committente cosa si è fatto
  («CARICO A … E SCARICO A … CON GRU»).
- **In mezzo, il confronto col listino**: per ogni voce, `vendita_proposta` (quella
  che diceva il listino), `vendita_unitaria` (quella applicata), `prezzo_fonte`
  (`committente` / `generale` / nullo) e il segno `prezzo_a_mano`. Queste colonne
  **esistono già** su `rapportino_voci_libere`: il pannello non deve ricalcolare
  niente, deve solo mostrarle.
- **Gli avvisi**, in alto e in rosso:
  - prezzo di vendita pari a 1 o a zero → «prezzo probabilmente non inserito»
    (47 casi in quell'impresa);
  - costo mancante → «margine non calcolabile» (110 casi);
  - `prezzo_a_mano` con scostamento dal listino oltre una soglia → «prezzo cambiato
    a mano: era 165, applicato 189»;
  - `appalto_tariffa_id` nullo su commessa con contratto → «voce non agganciata al
    listino del committente: andrà come fuori contratto» (D8).

Permessi: il pannello mostra i **costi** solo con `canViewCosts` e i **margini**
solo con `canViewMargins`, come già fa `RendicontoAppalto`. Le ore e le presenze
passano da `rapportini_costi()` / `COLONNE_RAPPORTINO`, mai da un `select("*")` su
`campo_rapportini` (vedi CLAUDE.md, «I soldi dei rapportini»).

### Lotto 4 — R3: correggere dal rendiconto

Nel pannello, su ogni voce: quantità, prezzo e costo modificabili.

- La correzione scrive sul **prezzo della voce del rapportino**, e la riga di
  rendiconto si riscrive da sé.

  > Questo punto, in origine, diceva il contrario: «scrive sulla riga di
  > rendiconto, non sul rapportino». Costruendolo è venuto fuori che non si
  > tiene: una voce che non è ancora diventata una riga **non ha** una riga su
  > cui scrivere, e sono proprio quelle il caso vero (47 voci a 1,00 €). Il
  > prezzo vive sulla voce, quindi è lì che si corregge. Quello che resta
  > intoccabile è il **racconto della giornata** — ore, presenze, lavori
  > descritti — non il prezzo che l'ufficio non aveva ancora deciso. Il testo
  > nel pannello va detto così, e non «il rapportino resta com'è stato scritto
  > in cantiere», che sarebbe falso.
- Resta traccia: `prezzo_a_mano` si accende da sé (è una colonna generata).
  **Chi e quando non è registrato**: c'è solo `updated_at`. Serve l'equivalente
  di `rapportino_modifiche` (`20290115170000`) o il riuso di
  `registra_azione_utente` — non fatto.
- Una riga `stato = 'in_sal'` **non si tocca**: è già in un documento al committente.
  Il blocco c'è già in `RendicontoAppalto.tsx` e va rispettato anche qui.
- Correzione in blocco per il caso vero: «metti il prezzo a queste 12 voci di
  materiale che sono a 1,00».

### Lotto 5 — D2/D3: non far nascere il problema

Nel modulo di campo e nel modulo ufficio (`CampoRapportino`, `ufficio_crea_rapportini`):

- il prezzo di vendita **non è obbligatorio**: si può lasciare vuoto e la voce nasce
  «prezzo da definire», che è la verità, invece di 1,00 che è una bugia;
- se la voce viene dal listino, il prezzo si propone e si segna la fonte (già fa
  così: `vendita_proposta` + `prezzo_fonte`);
- «prezzo da definire» non blocca l'approvazione del rapportino — blocca la
  **conferma della riga di rendiconto**, che è il punto giusto in cui l'ufficio deve
  decidere.

### Lotto 6 — D4: i mezzi diventano fatturabili

- `mezzi.tariffa_id` si imposta dalla scheda del mezzo e dal listino (il campo
  esiste; su quel camion è nullo).
- Un mezzo con tariffa in un rapportino approvato produce una riga di rendiconto
  (ore mezzo × tariffa), con la stessa regola del prezzo delle altre voci.
- Senza tariffa, compare nel Lotto 0 col motivo, non scompare.
- Attenzione a non contarlo due volte: nei dati veri il trasporto è scritto
  **sia** in `mezzi_usati` **sia** come voce libera «TRASPORTI 4 ore × 90» con un
  oggetto `viaggio` dentro (`{mezzo, carico, scarico, oreUomo, oreMezzo}`). La
  regola: se esiste una voce libera con `viaggio` per quel mezzo e quel giorno, il
  mezzo **non** genera una riga propria.

### Lotto 7 — Pulizie

- D6: togliere `exception when others then null`, o almeno registrare l'errore in
  `system_health_metrics` invece di buttarlo.
- D7: decidere la regola su «a corpo» e applicarla alle due funzioni.
- D8: agganciare le voci al listino del committente quando la commessa ha un
  contratto, riusando `lib/appalto/abbinaListino.ts` che già fa questo lavoro al
  caricamento del listino.

---

## 5. Ordine di esecuzione e perché

```
Lotto 0  ──► Lotto 2 ──► Lotto 3 ──► Lotto 4
(so cosa manca)  (so da dove viene)  (lo vedo)  (lo correggo)
   │
   ├──► Lotto 1  (decisione del titolare: 50.945 €)
   ├──► Lotto 5  (smetto di creare prezzi finti)
   ├──► Lotto 6  (i mezzi)
   └──► Lotto 7  (pulizie)
```

Lotto 0 per primo perché è l'unico che si può **collaudare oggi**: i dati ci sono,
15 rapportini approvati, e il riquadro deve passare da 1 riga elencata a tutte.
Lotto 1 è bloccato da una decisione, non dal codice, e va chiesto subito perché è il
lotto che vale più soldi.

---

## 6. Come si collauda, sui dati veri

Non su Demo 2: sui dati veri dell'impresa, impersonando un suo utente, in **transazioni
annullate** (metodo in `reference_impersonare_utente_sql`).

| Prova | Riscontro atteso |
|---|---|
| Lotto 0 sui 15 approvati | elenca il camion 9 h del 23/11 e ogni voce esclusa, col motivo |
| Lotto 0 sulle voci «cliente» | 68 voci con motivo «commessa non d'appalto» |
| Lotto 2 | le righe da voce mostrano «rapportino», non «manuale» |
| Lotto 3 | aperto il pannello sul rapportino del 23/11: operaio 9 h, camion 9 h, descrizione del carico |
| Lotto 3 avvisi | 47 avvisi «prezzo probabilmente non inserito», 110 «margine non calcolabile» |
| Lotto 6 | messa la tariffa sul camion, quello del 23/11 diventa una riga |

Il rendiconto vero **non si manda a un committente reale** finché il titolare non ha
guardato un rendiconto composto dall'inizio alla fine. Oggi nel sistema ci sono 0
rendiconti emessi e 0 firmati: la prima volta va fatta con lui davanti.

---

## 6-bis. Fatto il 27/11/2026

Decisioni prese dal titolare quel giorno: **D1 = (a)** il rendiconto si apre a
qualunque commessa; **D7 = «sì, come oggi»** le voci entrano anche su «a corpo»,
le ore no.

| Migrazione | Cosa |
|---|---|
| `20290624100000_rendiconto_prende_tutto` | D1 + D2 + D6 + D8: la vendita di una voce va nel rendiconto di qualunque commessa; la riga si ricorda `rapportino_id` e nasce `origine='rapportino'`; gli errori non si buttano più (`raise warning`); «fuori contratto» solo dove un contratto c'è |
| `20290624100100_un_rapportino_molte_voci` | correzione della precedente: l'indice unico del rapportino vale solo per la manodopera |
| `20290624100200_rimasto_fuori_dal_rendiconto` | Lotto 0: `rapportino_rimasto_fuori()` + vista `v_rapportini_da_rendicontare` (manodopera, voci, mezzi, materiali); colonna `mezzo_id`; via la vista vecchia |
| `20290624100300_recupera_voce_e_mezzo` | «Crea riga» per voci (`rapportino_voce_recupera`) e mezzi (`rapportino_mezzo_rendiconta`, Lotto 6) |
| `20290624100400_rendiconto_provenienza` | Lotto 3: `rendiconto_provenienza()`, una chiamata per tutto il dettaglio delle giornate |
| `20290624100500_voce_prezzo_corretto` | Lotto 4: `rapportino_voce_prezzo()` |

Frontend: riquadro **«Rimasto fuori dal rendiconto»** raggruppato per sorgente in
`RendicontoAppalto.tsx`, e pannello **`DaDoveViene.tsx`** (pulsante «Verifica»).

**La trappola che ha morso durante il lavoro.** Scrivere `rapportino_id` sulle
righe da voce libera (D2) ha fatto fallire l'approvazione con `duplicate key`:
`appalto_rendiconto_un_rapportino` è unico su
`(rapportino_id, employee_id, maggiorazione_pct)` e due voci dello stesso
rapportino diventano la stessa chiave. **Ecco perché il codice originale
lasciava `rapportino_id` nullo** — non era una distrazione, era il modo di
schivare quell'indice (nei vincoli unici i NULL sono tutti distinti). Visto
provando ad approvare un rapportino che ha due voci per
21.080 €. Sistemato restringendo l'indice a `voce_libera_id is null`: le voci
hanno già il loro guardiano, `appalto_rendiconto_una_voce`.

**Collaudato sui dati veri dell'impresa, in transazioni annullate:**
- commessa «cliente» che prima dava **zero righe** → COLLA IN SACCHI 20 € e
  PIASTRELLE 324 mq × 65 = **21.060 €**, con provenienza e `extra_contratto` falso;
- il riquadro «rimasto fuori» passa da **1 riga a 26**, e il camion
  **il camion da 9 ore** del 23/11 compare col suo motivo;
- «Crea riga» da una voce: FERRO D'ARMATURA 389,5 kg × 2,20 = **856,90 €**;
- «Crea riga» da un mezzo: un autocarro 2 ore × 20 = **40,00 €**;
- correzione del prezzo: MARMI da 1,00 a 48,00 → riga da **768,00 €**, e
  `prezzo_a_mano` si accende da sé (è una colonna generata,
  `vendita_unitaria IS DISTINCT FROM vendita_proposta`: non si scrive).

**Non fatto, e va detto:**
- **Lotto 5** era in gran parte già a posto: nel modulo ufficio il prezzo è già
  facoltativo («Da definire») e `vendita_unitaria` è nullable senza default.
  L'1,00 lo scrive chi compila, e ora viene segnalato in due posti. Resta da
  decidere se avvisare già in cantiere.
- **Lotto 7**: D8 è risolto solo per le commesse senza contratto; agganciare le
  voci al listino del committente con `abbinaListino.ts` non è fatto.
- `DaDoveViene.tsx` **non è nell'elenco dei file controllati** da
  `ufficioLingua.test.ts` (`BLOCCHI_UFFICIO`), quindi le sue ~30 frasi non hanno
  nessuna traduzione e nessun controllo se ne accorgerà mai. Le 8 frasi nuove di
  `RendicontoAppalto.tsx`, che invece è nell'elenco, sono in tutte e otto le
  lingue di `LINGUE_UFFICIO`.
- **Chi ha corretto un prezzo e quando non si sa**: solo `updated_at` sulla
  voce. Il Lotto 4 lo chiedeva.
- **La quantità non si corregge dal pannello**: `rapportino_voce_prezzo` accetta
  `p_quantita`, ma l'interfaccia non lo passa. R3 chiedeva anche quella.
- **L'avviso «prezzo probabilmente non inserito» scatta a `<= 1`**: su un
  materiale che costa davvero 1,00 o 0,50 all'unità è un falso allarme. Scelta
  consapevole (47 voci su 137 erano placeholder), ma va rivista se dà fastidio.
- **`src/integrations/supabase/types.ts` non è rigenerato**: non contiene la
  vista nuova, le funzioni nuove né `appalto_rendiconto_righe.mezzo_id`, e cita
  ancora la vista eliminata. Non rompe niente perché queste query passano da
  `(supabase as any)`, ma CLAUDE.md dice che quel file è la fonte sulla forma
  delle tabelle.
- La vista nuova **non ha `security_invoker`**: gira col proprietario e tutto il
  filtro sta nel suo `WHERE` (`puo_vedere_commessa` + `can_view_order_amounts`),
  come la vista che sostituisce. È dichiarato in `VISTE_CHE_FILTRANO_DENTRO`, ma
  vuol dire che non c'è una seconda difesa se qualcuno tocca quel `WHERE`.
- Nessun rendiconto è stato **inviato a un committente reale**: nel sistema
  restano 0 rendiconti emessi e 0 firmati. La prima volta va fatta col titolare
  davanti.

## 7. Da decidere con il titolare

1. **D1/Lotto 1**: dove va la vendita delle voci su commessa `cliente`? (a), (b) o (c).
2. **D7**: su una commessa **a corpo**, le voci libere entrano nel rendiconto? Oggi
   sì per le voci e no per le ore.
3. Il trasporto si fattura **a ora di mezzo**, a viaggio, o come voce libera scritta
   a mano come fanno adesso?
4. Un prezzo cambiato a mano rispetto al listino del committente: lo si lascia
   passare con un avviso, o lo si blocca fino a conferma?
