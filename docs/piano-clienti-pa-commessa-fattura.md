# Clienti privati, aziende e PA: dal cliente all'XML — stato e piano (15/11/2026)

Percorso: **anagrafica cliente → commessa → fattura → XML FatturaPA → provider (Aruba / openapi)**.

## Com'è oggi

### Due anagrafiche per lo stesso cliente
- La commessa punta a `profiles` (`orders.customer_id`). Lì il tipo è `customer_type` (`privato` / `appaltatore`) più `is_business`: **non esiste «PA»**, né PEC né codice destinatario. `CreateCustomer.tsx` offre solo «Persona fisica» / «Azienda».
- La fattura usa `anagrafiche_native` (collegata con `cliente_id`). Ha **due** campi tipo che dicono la stessa cosa: `tipo_soggetto` (giuridico/fisico/pa/estero) e `tipo_cliente` (B2B/B2C/PA/Estero). Ha `codice_sdi`, `pec`, e anche `cig`/`cup` — che però appartengono all'appalto, non al cliente.
- La scheda anagrafica (`AnagraficaDetail.tsx`) è in sola lettura: i dati fiscali si correggono solo dentro l'editor fattura.
- Uffici PA: **un solo codice** per ente. Non si possono avere più uffici né un predefinito. L'etichetta «Codice IPA (SDI)» chiama IPA quello che è il Codice Univoco Ufficio.

### La commessa non ha riferimenti PA
- `orders` non ha CIG, CUP, contratto, ordine d'acquisto, convenzione, determina, impegno, ufficio. C'è solo `riferimento_committente`, mostrato in Panoramica solo per gli appalti.
- CIG/CUP esistono in quattro posti scollegati, ognuno con un solo valore: `generale_contratti` (commesse generali), `computo_uploads` (computo), `anagrafiche_native` (cliente), `documenti_fiscali` (fattura).
- La «Fase 5 CUP/CIG» del 14/11 riguarda le fatture **ricevute** (abbinare una fattura del fornitore alla commessa), non questa catena.

### Fattura
| Da dove | Cosa recupera | Problemi |
|---|---|---|
| Commessa → «Crea fattura» (`CreaFatturaDialog.tsx`) | cliente da `anagrafiche_native`, CIG/CUP **dal cliente** | ignora CIG/CUP del contratto e del computo; niente contratto/ordine/convenzione; se scegli il profilo «PA» ma l'anagrafica dice B2B, l'XML parte come **FPR12** (privati/aziende) invece di FPA12; il campo CIG accetta 15 caratteri (il CIG ne ha 10) |
| SAL commessa generale (`generali/fatture.ts`) | CIG, CUP, split, riferimento contratto | il riferimento del contratto finisce come «ordine d'acquisto» e come codice convenzione insieme |
| Certificato computo (`fatturaCertificato.ts`) | CIG/CUP del computo prima di quelli del cliente | — |
| Modulo Fatturazione (editor) | cliente | non copia CIG/CUP dall'anagrafica; i riferimenti ordine non si possono scrivere da nessuna parte; **cambiando cliente restano CIG, CUP e split del cliente precedente**; la commessa non si cambia dall'editor; nessuna distinzione tra dato ereditato e modificato |

### XML (`supabase/functions/_shared/generateXML.ts`, unico generatore)
Provato il 15/11 su sei casi, tutti XML ben formati:

| Caso | Esito |
|---|---|
| Privato | FPR12, `0000000`, solo codice fiscale, Nome/Cognome — corretto |
| Azienda | FPR12, codice destinatario, P.IVA — corretto |
| PA con CIG, CUP, contratto | FPA12, ufficio, CUP e CIG nel blocco ordine — corretto nei tag; **il codice commessa/convenzione non viene scritto** |
| PA con CIG senza ordine | scrive un ordine con `IdDocumento` = `0` (accettato dallo SDI, ma è un segnaposto) |
| PA con split payment spento sulla fattura | **l'XML dice comunque split (`EsigibilitaIVA` S)**: il documento dice una cosa, l'XML un'altra |
| PA senza codice ufficio | `000000` + PEC: «Scarica XML» lo produce, l'invio allo SDI lo blocca (giusto) |

Inoltre: **lo split payment si applica a ogni PA in automatico** (basta che l'azienda non l'abbia spento in generale). Non è vero per tutte le PA, e non si può togliere fattura per fattura. Mancano del tutto `DatiContratto`, `DatiConvenzione` e `RiferimentoNumeroLinea` (riferimento per riga).

Le correzioni del 13/11 (d6eabab0b, bb1e41d18, 77e96c123, 0baf686b9) restano valide: codice fiscale completo, p7m firmato vero ad Aruba, note pubbliche nella Causale, controlli condivisi prima dell'invio, RF19, stato di scarto. Nessuna toccava i riferimenti PA o lo split.

Provider: Aruba e openapi ricevono **il nostro XML così com'è**: quello che c'è nell'XML arriva allo SDI, niente di più.

Test: `fatturaPaXml.test.ts` copre solo un cliente azienda; `invioSdiFlussoCompleto.test.ts` prova privato/azienda/PA ma controlla solo il formato e che il CUP compaia. Nessun test per il tag CIG, lo split, il codice ufficio, contratto/convenzione, più ordini. Nel repository non c'è lo schema XSD FatturaPA 1.2.2 per validare in automatico.

## Piano a lotti

### Lotto 0 — XML e fattura: errori che producono documenti sbagliati oggi (piccolo, subito)
1. Split payment: l'XML segue `esigibilita_iva` della fattura, non «ogni PA». Il valore iniziale viene dal cliente (vedi lotto 1), modificabile sulla fattura. Verificare che con split l'importo da pagare in `DatiPagamento` sia senza IVA.
2. `CreaFatturaDialog`: il profilo PA scelto imposta `tipo_cliente = PA` sulla fattura (FPA12).
3. Editor: cambiando cliente si tolgono CIG, CUP e split del cliente precedente, con avviso.
4. Codice commessa/convenzione scritto nel tag `CodiceCommessaConvenzione`.
5. Campo CIG a 10 caratteri; «Scarica XML» avvisa se una PA non ha il codice ufficio.
6. Test: un caso PA completo (FPA12, ufficio, CIG, CUP, split acceso/spento, importo pagamento).

### Lotto 1 — Anagrafica: Privato / Azienda / Pubblica Amministrazione
- Un solo tipo stabile nel database (`privato` / `azienda` / `pa`, più estero), letto da commessa e fattura. `tipo_cliente` resta per compatibilità, derivato.
- Creazione e modifica del cliente con i campi giusti per tipo (PA: denominazione ente, codice fiscale obbligatorio, PEC, contatti amministrativi; azienda: P.IVA, PEC/codice destinatario; privato: nome, cognome, CF).
- Scheda anagrafica modificabile (oggi solo lettura) e collegamento `profiles` ↔ `anagrafiche_native` sempre presente per chi fattura.
- Split payment come impostazione del cliente PA (non automatico).
- Clienti esistenti: nessuna riclassificazione automatica a PA; elenco «da completare» con chi ha codice di 6 caratteri o denominazione da ente, da confermare a mano.

### Lotto 2 — Uffici PA
- Tabella degli uffici dell'ente: descrizione, Codice Univoco Ufficio (6 caratteri), predefinito sì/no; codice IPA dell'ente separato.
- Si sceglie l'ufficio nella commessa e nella fattura; il predefinito si propone da solo.
- Rinominare «Codice IPA (SDI)» in «Codice Univoco Ufficio».

### Lotto 3 — Commessa: «Dati appalto e fatturazione PA»
- Riferimenti come **righe** (più CIG/CUP/lotti per commessa): tipo (contratto / ordine d'acquisto / convenzione), numero, data, CIG, CUP, lotto, determina, impegno di spesa, ufficio destinatario, note. «CIG non dovuto» e «CUP non dovuto» espliciti, senza valori finti.
- Attivabile anche per privati e aziende (es. finanziamento pubblico con CUP).
- Le commesse generali e il computo diventano fonti di queste righe, invece di quattro posti separati.
- Riquadro in Panoramica: codici in evidenza, pulsante copia, valori lunghi leggibili, cosa manca, «Modifica» secondo i permessi.

### Lotto 4 — Dalla commessa alla fattura (e dal modulo Fatturazione)
- La fattura copia cliente, ufficio e riferimenti dalla commessa, con l'origine scritta accanto: «dall'anagrafica», «dalla commessa», «modificato qui».
- Modifiche sulla fattura non toccano commessa e anagrafica.
- Editor: si sceglie o si cambia la commessa; i riferimenti della commessa precedente si tolgono con avviso; i conflitti si mostrano e si sceglie.
- Riferimenti scrivibili a mano quando non c'è commessa; fattura su più commesse: riferimenti per riga.
- Fatture emesse mai toccate; bozze: «Aggiorna dalla commessa» con le differenze, senza sovrascrivere ciò che è stato modificato a mano.

### Lotto 5 — XML completo e controlli
- `DatiContratto`, `DatiConvenzione`, `DatiOrdineAcquisto` dalle righe del lotto 3, con `RiferimentoNumeroLinea` quando un riferimento vale solo per alcune righe.
- Controlli: formato codice ufficio, CIG (compresi i vecchi codici), CUP; coerenza cliente-ufficio-commessa. Errori che bloccano l'invio, avvisi, informazioni; la bozza si salva sempre. Il messaggio dice cosa manca, dove inserirlo e cosa non si può fare. Il formato giusto non vuol dire che il codice sia quello dell'appalto, e il messaggio lo dice.
- Test sugli scenari A–L, con lo schema XSD ufficiale nel repository per la validazione automatica (va scaricato dal sito FatturaPA).
- Nessuna fattura vera inviata per le prove.

## Ordine consigliato
Lotto 0 subito (corregge documenti che partono sbagliati), poi 1 → 2 → 3 → 4 → 5. I lotti 1-2 e 3 si possono fare in parallelo; il 4 ha bisogno di entrambi.
