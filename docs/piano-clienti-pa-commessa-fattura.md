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

### Lotto 0 — XML e fattura: errori che producono documenti sbagliati oggi (piccolo, subito) — **FATTO il 15/11/2026**

Com'è adesso:
- **Split payment**: l'XML segue `esigibilita_iva` della fattura (S → S; I/D → nessuna riga in S; non scritta → le righe del riepilogo). `split_payment_pa` dell'azienda e il nuovo `cliente_snapshot.split_payment` (dal lotto 1) decidono solo il valore di partenza (`splitPredefinito`, `src/lib/fatturazione/fatturaPa.ts`), nell'editor e in «Crea fattura». Senza split la dicitura 17-ter non arriva più allo SDI, e l'editor la toglie dalla causale quando lo split si spegne. Il certificato computo nasce con i totali già calcolati (prima a zero fino all'apertura nell'editor).
- **«Crea fattura»**: il profilo scelto decide il tipo cliente (`tipoClienteDaProfilo`): «Ente pubblico» su un cliente B2B dà FPA12, con avviso di correggere l'anagrafica e, se manca, del Codice Univoco Ufficio. CIG a 10 caratteri.
- **Editor, cambio cliente**: «Cambia» (o un altro cliente dall'anagrafica) toglie CIG, CUP, codice commessa/convenzione, split e la sua dicitura, con avviso che dice cosa ha tolto. Correggere lo stesso cliente o passarlo «a mano» non tocca niente.
- **`CodiceCommessaConvenzione`** scritto in `DatiOrdineAcquisto` dopo `Data`, prima di CUP e CIG; non ripetuto se è uguale al numero dell'ordine. I SAL delle commesse generali non mettono più il riferimento del contratto anche come codice convenzione. CIG/CUP senza ordine: resta `IdDocumento` «0» (il blocco `DatiContratto` è del lotto 5).
- **«Scarica XML»** di una PA senza Codice Univoco Ufficio (o con un codice di 7 caratteri): scarica e avvisa. Etichetta «Codice IPA (SDI)» → «Codice Univoco Ufficio» nell'editor.
- **Test**: `src/test/logic/fatturaPaLotto0.test.ts` (FPA12, codice ufficio, CIG/CUP, split acceso/spento con importo e causale, codice convenzione, avviso, cambio cliente, certificato) e `invioSdiFlussoCompleto.test.ts` (tag CIG, esigibilità, codice destinatario per privato/azienda/PA).
- **Note di credito (TD04)**: `noteCreditoXmlPa.test.ts`, 17 casi da `creaNotaCredito` all'XML (privato, azienda, PA con split acceso e spento, con ritenuta, con fattura rettificata, con CIG/CUP): formato, esigibilità, riepiloghi, ImportoPagamento, causale, conti 00422/00423.
- **Prova su Demo Azienda 2**: sei note di credito in bozza collegate alle fatture di prova e sette bozze con nota interna «PROVA lotto 0 (15/11/2026) … — non inviare», XML controllati, nessun invio.

Era:
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

### Lotti 1 e 2 — fatti il 15/11/2026: stato e contratto dello schema

Migrazioni `20290410200000_anagrafica_tipo_cliente_pa`, `20290410210000_anagrafica_uffici_pa` e `20290410220000_uffici_pa_ente_fisso_telefono_profilo`, applicate e riallineate. La terza impedisce di spostare un ufficio su un altro ente e concede `fish_customer_phone` ad `authenticated`: l'indice `fish_customer_phone_lookup_idx` su `profiles` la calcola, e senza il permesso le modifiche del profilo dal browser che toccano l'indice (telefono, P.IVA, CF…) fallivano dall'11/11.

Controllo accessi (guardiano, 17 prove): nessun accesso tra aziende, utenti esterni, «solo campo» e subappaltatori esclusi; la RPC rifiuta profili non clienti e di altre aziende.

Dati di prova su Demo Azienda 2: «PROVA Comune di Demolandia» (PA, uffici UFTST1 e UFTST2 predefinito, split no), «PROVA Mario Privato», «PROVA Costruzioni S.r.l.» (codice destinatario ABC1234), anagrafica senza cliente «PROVA Comune di Fintavilla» (confermata PA dall'elenco, ufficio UFFNT1).

**Contratto per i lotti 3-5 (commessa, fattura, XML):**
- **Tipo del cliente**: `anagrafiche_native.tipo_cliente` è la fonte — `B2C` = Privato, `B2B` = Azienda, `PA` = Pubblica Amministrazione, `Estero`. Etichette in `src/lib/clienti/clienteFiscale.ts` (`etichettaTipoCliente`). `tipo_soggetto` lo segue il trigger `anagrafica_allinea_tipo` (B2C→fisico, PA→pa, Estero→estero, B2B→giuridico, o fisico per la ditta individuale): non scriverlo a mano. `profiles.is_business` resta solo per la scheda (PA e azienda = true); `profiles.customer_type` (privato/appaltatore) è un'altra cosa (committente in subappalto).
- **Colonne nuove su `anagrafiche_native`**: `split_payment boolean` (null = decide l'impostazione dell'azienda; true/false = scelto sul cliente), `codice_ipa text` (codice dell'ente in IPA, es. `c_h501`, **non** il codice ufficio), `referente_amministrativo text`, `tipo_confermato_at timestamptz` (qualcuno ha scelto il tipo a mano). Contatti amministrativi: `referente_amministrativo` + `email_fatture`.
- **Uffici PA**: tabella `anagrafica_uffici_pa` (id, company_id, anagrafica_id → `anagrafiche_native` on delete cascade, descrizione, `codice_univoco_ufficio` CHECK `^[A-Z0-9]{6}$`, predefinito — uno solo per anagrafica, indice unico parziale —, attivo, note, created_at/updated_at; codice unico per anagrafica). RLS per azienda come `anagrafiche_native`; `company_id` lo mette il trigger dall'anagrafica. Il primo ufficio attivo diventa predefinito da solo; rendere predefinito uno toglie il segno agli altri; disattivare toglie il predefinito. Nel backup (nessuna tabella scoperta).
- **Compatibilità**: per una PA `anagrafiche_native.codice_sdi` = codice del predefinito attivo (trigger `anagrafica_ufficio_pa_allinea`). XML e controlli di oggi continuano a leggere lì; il lotto 4 salverà sulla fattura l'ufficio scelto (es. `documenti_fiscali.ufficio_pa_id` + codice copiato) e smetterà di dipendere da `codice_sdi`.
- **Salvataggio**: `salva_anagrafica_cliente(p_cliente_id uuid, p_dati jsonb) → uuid` (SECURITY DEFINER, permesso clienti o fatturazione, non sola lettura). Crea o aggiorna l'anagrafica **collegata** (`cliente_id`, `sync_from_cliente = false`), scrive solo le chiavi presenti, crea il primo ufficio da `ufficio_codice` o dal vecchio codice di 6 caratteri quando il tipo diventa PA. Da codice: `salvaClienteFiscale()` in `src/lib/clienti/salvaClienteFiscale.ts`.
- **Fallback SQL** `generale_fattura_cliente`: con l'anagrafica il tipo viene da lì (PA compresa) e restituisce anche `split_payment`, `codice_ipa`, `ufficio_pa_id`, `ufficio_pa_descrizione`, con `codice_sdi` = ufficio predefinito; senza anagrafica indovina ancora B2B/B2C dalla P.IVA (il profilo non conosce la PA).
- **Da riusare nei lotti 3-4**: `useUfficiPa(anagraficaId)` (`src/hooks/useUfficiPa.ts`: `uffici`, `tutti`, `predefinito`, `aggiungi`, `modifica`, `rendiPredefinito`, `disattiva`), `<SelettoreUfficioPa anagraficaId value onChange proponiPredefinito />` (`src/components/clients/SelettoreUfficioPa.tsx`), `ufficioDaProporre()` in `src/lib/clienti/ufficiPa.ts`.

**Interfaccia:**
- Nuovo cliente: scelta Privato / Azienda / Pubblica Amministrazione; per azienda e PA PEC, codice destinatario (solo azienda), referente ed email amministrazione; per la PA codice fiscale dell'ente obbligatorio, P.IVA facoltativa, codice IPA, split sì/no/come azienda, primo ufficio. Salvando nasce l'anagrafica collegata.
- Scheda cliente: riquadro «Dati per la fattura» (tipo, codici, «Modifica»/«Completa», uffici PA); avvisa se la scheda dice persona e l'anagrafica azienda o viceversa.
- Scheda anagrafica (`AnagraficaDetail`): «Modifica» per chi ha i permessi clienti o fatturazione; uffici PA (aggiungi, modifica, predefinito, disattiva).
- Clienti fiscali: riquadro «N clienti sembrano enti pubblici» dalla vista `anagrafiche_pa_da_confermare` (codice di 6 caratteri o denominazione da ente). Il 15/11 sono 14, in 4 aziende (comuni, prefettura, capitaneria, scuola…), oggi fatturati come FPR12. Nessuno è stato riclassificato: si conferma dalla scheda e si esce dall'elenco.

**Resta fuori (file di altre sessioni):** l'etichetta «Codice IPA (SDI)» nell'editor fattura (`EditorClienteSection.tsx`) va rinominata «Codice univoco ufficio» e l'editor deve usare `SelettoreUfficioPa` (lotto 4); lo split della fattura deve partire da `anagrafiche_native.split_payment` (lotto 0/4).

### Lotto 3 — Commessa: «Dati appalto e fatturazione PA»
- Riferimenti come **righe** (più CIG/CUP/lotti per commessa): tipo (contratto / ordine d'acquisto / convenzione), numero, data, CIG, CUP, lotto, determina, impegno di spesa, ufficio destinatario, note. «CIG non dovuto» e «CUP non dovuto» espliciti, senza valori finti.
- Attivabile anche per privati e aziende (es. finanziamento pubblico con CUP).
- Le commesse generali e il computo diventano fonti di queste righe, invece di quattro posti separati.
- Riquadro in Panoramica: codici in evidenza, pulsante copia, valori lunghi leggibili, cosa manca, «Modifica» secondo i permessi.

#### Stato del lotto 3 — FATTO il 15/11/2026
Migrazioni applicate e riallineate: `20290410300000_order_riferimenti_pa`, `20290410300100_orders_visibili_riferimenti_pa`, `20290410300200_order_riferimenti_pa_titolare` (regola del titolare con `e_amministratore_di`).

**Contratto dello schema (per i lotti 4-5)** — tabella `public.order_riferimenti_pa`, una riga per affidamento / lotto / progetto:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | |
| `company_id` | uuid | lo scrive il trigger dalla commessa: qualunque valore mandato viene sostituito |
| `order_id` | uuid → `orders` on delete cascade | |
| `tipo` | text | `contratto` → `DatiContratto`, `ordine_acquisto` → `DatiOrdineAcquisto`, `convenzione` → `DatiConvenzione` |
| `numero`, `data` | text, date | → `IdDocumento`, `Data` |
| `cig` | text | `^[A-Z0-9]{10}$` (anche SmartCIG); → `CodiceCIG` |
| `cig_non_dovuto`, `cig_motivo_esclusione` | boolean, text | mai insieme a `cig` (CHECK); il motivo resta solo se la spunta c'è |
| `cup` | text | `^[A-Z][A-Z0-9]{14}$`; → `CodiceCUP` |
| `cup_non_dovuto` | boolean | mai insieme a `cup` (CHECK) |
| `lotto`, `determina`, `impegno_spesa` | text | `determina` = atto di affidamento; `impegno_spesa` va di norma nella Causale o in `CodiceCommessaConvenzione`, da decidere nel lotto 5 |
| `ufficio_id` | uuid | **senza chiave esterna**: `anagrafica_uffici_pa` (lotto 2) non c'era quando è stata applicata. Va aggiunta con una migrazione del lotto 2 o 4 (`references anagrafica_uffici_pa(id) on delete set null`) |
| `codice_univoco_ufficio` | text | copia del codice (`^[A-Z0-9]{6}$`) per quando l'ufficio cambia o non c'è: oggi lo scrive l'utente, nessun trigger lo copia dall'ufficio |
| `note_fatturazione` | text | |
| `fonte`, `fonte_id` | text, uuid | `manuale` / `contratto_generale` (fonte_id = `generale_contratti.generale_id`) / `computo` (fonte_id = `computo_uploads.id`); indice unico `(order_id, fonte, fonte_id)` per non importare due volte |
| `ordinamento` | integer | ordine di stampa; i lotti 4-5 leggono le righe in questo ordine |
| `created_at`, `updated_at`, `created_by` | | |

I codici si salvano in maiuscolo e senza spazi (trigger `order_riferimenti_pa_normalizza`).
`orders.riferimenti_pa_attivi` boolean default false: lo accende da solo il trigger `orders_riferimenti_pa_da_cliente` quando la commessa nasce o cambia cliente e l'anagrafica del cliente è PA (`tipo_cliente = 'PA'` o `tipo_soggetto = 'pa'`); lo accende anche il primo riferimento inserito; a mano dall'interruttore per privati e aziende. Non si spegne mai da solo. È esposto anche in `orders_visibili`.
Accessi: come `order_work_phases` (vede chi ha «Vedere commesse» e vede la commessa; scrive chi ha «Modificare commesse»; titolare; super admin; utente bloccato fuori). Provato: un amministratore di un'altra azienda legge 0 righe e non scrive. Il backup la prende da sé (ha `company_id`).

**Codice**
- Regole e formati: `src/lib/orders/riferimentiPa.ts` (`cigValido`, `cupValido`, `codiceUfficioValido`, `controllaRiferimento` → errori che bloccano / mancanze che avvisano, `pianoSalvataggio`, `anagraficaEPa`).
- Hook per la fattura: `useRiferimentiPaCommessa(orderId)` in `src/hooks/useRiferimentiPaCommessa.ts` → `{ righe, fonti, attivi, clientePa, customerId }` più `salva`. Senza React: `leggiRiferimentiPa(orderId)`, `salvaRiferimentiPa(orderId, bozze, salvate, attivi?)`. Le `righe` sono già in ordine; le `fonti` sono i CIG/CUP di contratto generale e computo con `giaPresente` e `problemi` (formato sbagliato).
- Interfaccia: `SezioneRiferimentiPa` in `CreateOrder.tsx` (dopo i dettagli) e `EditOrder.tsx` (dopo i dettagli; si salva dopo `commessa_salva`, prima di rileggere la versione); `RiquadroRiferimentiPa` in Panoramica (`OrderDetail.tsx`), con «Modifica» e «Importa» per chi può modificare la commessa.
- Le colonne `cig`/`cup` di `generale_contratti`, `computo_uploads`, `anagrafiche_native` restano dove sono: il riquadro le propone da importare, non le copia da solo.
- Test: `src/test/logic/riferimentiPaCommessa.test.ts`, `src/test/ui/riquadroRiferimentiPa.test.tsx`.

**Dati di prova su Demo Azienda 2** (descrizione «PROVA LOTTO 3 — …»): cliente «Comune di Prova (PA DEMO lotto 3)» (profilo `d2000000-0000-4000-a000-0000000a3001`, anagrafica PA, codice ufficio UFXYZ1); DEMO2-0013 (PA, contratto Rep. 1234/2026 con CIG 1234567ABC + CUP J51B21000140006, ordine d'acquisto OdA 77/2026 con SmartCIG Z1A2B3C4D5); DEMO2-0014 (privato «Famiglia DEMO 2026 1», interruttore acceso a mano, solo CUP B12C34000560007); DEMO2-0015 (PA, convenzione con CIG non dovuto «affidamento in house» + CUP C33D21000780001).

**Resta per i lotti successivi**: chiave esterna e selettore dell'ufficio (`SelettoreUfficioPa`) nella riga, al posto del codice scritto a mano; un trigger che copi `codice_univoco_ufficio` dall'ufficio scelto.

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
