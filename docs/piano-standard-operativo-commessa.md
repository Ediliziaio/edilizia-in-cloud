# Standard operativo della commessa: dal documento al piano

17/11/2026. Come il gestionale trasforma un contratto, un preventivo o un computo in **fasi di lavoro,
fabbisogno di materiali e affidamenti**, per qualunque settore, senza una logica per cliente.

Principio: **l'AI legge e interpreta, il software calcola e riconcilia, l'utente conferma.** Un'ipotesi non
diventa mai un dato certo senza conferma.

---

## 1. Lo standard: quattro domande per ogni voce

Ogni voce del documento diventa una **voce operativa** che risponde sempre a quattro domande.

| Domanda | Valori | Chi la decide |
|---|---|---|
| **Cosa è previsto** (`natura`) | `lavorazione` · `fornitura` · `fornitura_e_posa` · `servizio` (trasporto, smaltimento, nolo, oneri) · `consumo` | AI propone, utente conferma |
| **Chi esegue** (`esecuzione`) | `interna` · `subappalto_posa` (sola manodopera) · `subappalto_fornitura_posa` · `mista` | modalità abituale dell'azienda → commessa → fase → voce |
| **Chi fornisce i materiali** (`materiali_a_carico`) | `azienda` · `subappaltatore` · `committente` · `da_decidere` | derivato dall'esecuzione, modificabile per singolo materiale |
| **Quanto è certo** (`stato`) | `letto` (dal documento, con pagina) · `proposto` (AI, listino, regola) · `confermato` (utente) | il sistema; solo l'utente porta a `confermato` |

Regole di derivazione (il software, non l'AI):

- `esecuzione = subappalto_fornitura_posa` ⇒ materiali della voce `a carico subappaltatore`, salvo eccezioni
  per singolo materiale (es. sanitari comprati dall'azienda).
- `esecuzione = interna` o `subappalto_posa` ⇒ materiali `a carico azienda`.
- Documento che dice «fornito dal committente», «sola posa», «esclusa fornitura» ⇒ `a carico committente`,
  qualunque sia l'esecuzione.
- `natura = lavorazione` o `servizio` ⇒ nessun materiale da comprare (il servizio può avere un costo: smaltimento,
  nolo, trasporto).

### Ereditarietà

`impostazione azienda` (per capitolo/tipo di lavoro, es. «impianto idraulico → subappalto fornitura e posa»)
→ **commessa** → **fase** → **voce** → **singolo materiale**. Ogni livello si può cambiare; il livello sotto
eredita finché non si sceglie altro. Se manca un'informazione la scelta resta `da_decidere` e compare tra le
cose da confermare.

### Esempi di settore, stesso standard

| Documento | Voce | natura | Effetto |
|---|---|---|---|
| Serramenti | «Finestra 001 2100×2200, GreenEvo 76» | fornitura_e_posa | articolo legato alla posizione (misure, sistema) + fase posa + consumi di posa (schiuma, sigillante, viti) |
| Serramenti | «Smontaggio vecchi infissi» | lavorazione (+ servizio smaltimento) | fase, nessun acquisto |
| Fotovoltaico | «Impianto 6 kW con accumulo 10 kWh» | fornitura_e_posa | componenti da confermare (moduli, inverter, batteria, strutture, quadri): la potenza **non** basta per le quantità, si chiedono |
| Ristrutturazione | «Demolizione pavimento» | lavorazione (+ servizio smaltimento) | fase, nessun materiale |
| Ristrutturazione | «Fornitura e posa parquet» | fornitura_e_posa | fabbisogno parquet (+ accessori) + fase posa |
| Ristrutturazione | «Sola posa parquet fornito dal committente» | lavorazione | fase; parquet `a carico committente`, mai tra gli acquisti |

---

## 2. Il processo, in ordine

| # | Passo | Chi |
|---|---|---|
| 1 | Riconoscere le voci (testo, tabelle, quantità, unità, importi, **pagina**) | lettori senza AI (PriMus, XPWE, Excel) o AI di lettura |
| 2 | Classificare ogni voce (`natura`) e il capitolo | AI di interpretazione, con il riferimento al documento |
| 3 | Organizzare macrofasi e sottofasi | regole (capitoli → fasi) + AI dove il documento non è diviso |
| 4 | Applicare la modalità di esecuzione | software: ereditarietà dalle impostazioni |
| 5 | Attribuire chi fornisce i materiali | software: regole del §1 |
| 6 | Calcolare il fabbisogno a carico dell'azienda | software: scomposizioni (voce → materiali con resa e sfrido) |
| 7 | Netto da comprare = fabbisogno − magazzino libero − già impegnato − già ordinato | software |
| 8 | Mostrare il piano da verificare prima di ordini, fasi definitive, affidamenti | utente |

## 3. Controlli (sempre, dal software)

1. **Niente acquisti di materiali compresi in un subappalto** «fornitura e posa» o forniti dal committente.
2. **Niente costo doppio**: una voce affidata in «fornitura e posa» ha come costo il prezzo del subappalto, e i
   suoi materiali non entrano nel costo materiali. In «solo posa» il costo è subappalto (manodopera) + materiali azienda.
3. **«Fornitura e posa» a importo unico non si divide a occhio**: la parte materiale e la parte manodopera vengono
   da listino, storico, scomposizione o valore confermato; se è una stima è marcata `stima` e si vede.
4. **Niente inventato**: quantità, caratteristiche e ripartizioni che il documento non dà restano vuote e da confermare.
5. **Vendita e costo separati**: il prezzo al cliente (`importo` della voce) non diventa mai il costo previsto.

---

## 4. Cosa c'è già e cosa manca (censimento del 17/11/2026)

| Pezzo | C'è | Manca |
|---|---|---|
| Fasi, sottofasi, voci con vendita e costo (`order_work_phases`, `order_work_subphases`, `order_work_phase_voci`) | sì, dal computo (`commessa_lavorazioni_dal_computo`) | dal **contratto** le voci diventano `order_items` «materiale» a prezzo 0, non voci di fase |
| Affidamenti ai subappaltatori per voce e quota (`subappalto_affidamenti.comprende = posa / fornitura_e_posa`) | sì, con listino ditta e contratto | nessuna **modalità di esecuzione** su fase/voce prima dell'affidamento; nessuna impostazione abituale |
| Voce → materiali (`scomposizioni_voce` con resa e sfrido, `generaDistinta`, `materiali_proposti`) | sì | `natura` della voce solo per regex; «committente/sola posa» non resta come dato sulla riga |
| Fabbisogno e ordini (`materiali_riconciliazione`, ODA, RDO) | sì | **non esclude** voci affidate in fornitura e posa né materiali del committente; **non sottrae** magazzino e impegni |
| Costi: listino aziendale con incidenza manodopera | sì | nessun flag `stima`; da verificare se `incidenza_manodopera_pct` (frazione 0..1) viene divisa per 100 nelle RPC |
| Materiali di consumo | solo analisi (`docs/piano-magazzino-consumabili.md`) | tutto |

---

## 5. Architettura AI: da misurare, non da presumere

Due configurazioni a confronto sugli **stessi documenti veri** di aziende diverse:

- **A — un modello**: Gemini 2.5 Flash legge e classifica in una chiamata (come oggi, con lo schema nuovo).
- **B — due modelli**: (1) lettura: voci, quantità, unità, importi, pagina e citazione (Flash o lettori senza AI);
  (2) interpretazione: un modello da scegliere (es. Claude Sonnet, Gemini 2.5 Pro) riceve le voci estratte **con
  i riferimenti al documento**, applica lo standard e le impostazioni, e può chiedere la rilettura di una voce ambigua.

Misure per documento (banco di prova `work/banco-ai/`, riferimento scritto a mano):

| Misura | Come |
|---|---|
| Accuratezza voci e quantità | confronto riga per riga con il riferimento |
| Classificazione `natura` ed esecuzione | % giuste sul riferimento |
| Correzioni chieste all'utente | numero di campi `da_decidere` + errori corretti |
| Materiali inventati, costi doppi | conteggio (deve essere 0) |
| Costo e tempo | `ai_router_usage_log` (token, euro, millisecondi) |

Documenti già nel banco: 2 computi PriMus, 4 preventivi analitici di ristrutturazione, 1 preventivo firmato
scansionato di serramenti, 1 offerta di produttore. **Servono ancora**: un contratto fotovoltaico, un contratto
serramenti con posa, un computo non PriMus, un contratto con subappalto.

---

## 6. Lotti

| Lotto | Cosa | Migrazione |
|---|---|---|
| 0 | Riferimenti del banco con `natura`/esecuzione/a carico su 6-8 documenti; script di misura | no |
| 1 | **Controlli subito**: il fabbisogno esclude le voci affidate in fornitura e posa e i materiali del committente; le voci da contratto non diventano più «materiale» | sì |
| 2 | Dati dello standard: `natura`, `esecuzione`, `materiali_a_carico`, `stato` su fasi/voci/righe; impostazione abituale per capitolo; ereditarietà | sì |
| 3 | Contratto/preventivo → voci operative delle fasi (come il computo), con `natura` letta; «Da comprare» solo dalle forniture | no (lettura) / sì (salvataggio) |
| 4 | Il **piano operativo** da verificare: per fase chi esegue, chi fornisce, cosa comprare, costi, senza doppioni | no |
| 5 | Netto da comprare: magazzino libero, impegni, ordinato | sì |
| 6 | Interpretazione AI (configurazione A contro B) sul banco; scelta dei modelli con i numeri | no |
