# Giornale nella commessa, reverse charge, rapportini, DDT e ordini

Piano scritto il 09/11/2026 partendo dalle richieste di un cliente, che valgono per
tutte le aziende. Stato del codice letto su `origin/main` (`e390ab9e6`), database di
produzione letto senza scrivere.

**Stato al 09/11/2026:** fasi 1, 2, 3, 5, 6 e 7 realizzate. Della fase 4 c'è solo il dettaglio
della manodopera per persona: materiali e mezzi aspettano la risposta del cliente, e oggi non
hanno un prezzo da cui partire (zero righe prezzate in `rapportino_materiali`, nessuna tariffa
sui mezzi). Sugli ordini di materiali l'interruttore c'è; la clausola va confermata da un
commercialista.

Dove è scritto **«da verificare»** il punto non è stato controllato.

## 1. La richiesta, e cosa c'è già

| Richiesta | Cosa c'è oggi | Cosa manca | Fase |
|---|---|---|---|
| Giornale lavori come vista della commessa | Pagina unica `/azienda/giornale-lavori` con un filtro per commessa. Una pagina per commessa e per giorno | La vista dentro la commessa | 1 |
| Reverse charge negli ordini | **C'è a metà**: casella all'invio, solo sugli ordini di servizi | Si perde alla riapertura, IVA da azzerare a mano, niente sugli ordini materiali | 2 |
| Cancellare i rapportini | Solo «rifiuta». Annullamento solo per le ore scritte dall'ufficio | Annullamento di tutti i rapportini | 3 |
| Parte economica dei rapportini | Costo manodopera dopo l'approvazione | Materiali, mezzi e totale della giornata. Il significato va confermato | 4 |
| DDT e ordini fuori da Commesse | Schede `?tab=ddt` e `?tab=acquisto` di Commesse | Pagine e voci di menu proprie | 5 |
| Giornale condiviso con CSE e altri | «Invia alla direzione lavori»: link via email valido 30 giorni | Destinatari con un ruolo | 6 |
| Giornale compilato dai rapportini | **C'è già**: «Prepara dalla giornata» e la bozza serale automatica | Solo accendere l'interruttore dell'azienda | 7 |
| Firma OTP, app, crediti AI | Ci sono | Spiegare meglio i crediti AI | 7 |

## 2. Decisioni da prendere

1. **Reverse charge sugli ordini materiali.** Oggi la clausola cita l'art. 17 c. 6 DPR
   633/72, pensato per le prestazioni edili. Una semplice fornitura di materiali di norma
   non ci rientra. Proposta: interruttore su tutti gli ordini, clausola scelta tra lett. a
   (subappalto edile) e a-ter (servizi connessi), con conferma di un commercialista.
2. **DDT e ordini via da Commesse per tutti?** Il 23/10/2026 gli ordini sono stati spostati
   apposta dentro Commesse, per non avere due porte. Proposta: pagine proprie per tutte le
   aziende, senza impostazione per azienda, che complicherebbe menu e permessi.
3. **Cosa vuol dire «parte economica».** Va chiesto al cliente (fase 4). Non si parte prima.
4. **Annullare o cancellare davvero.** Proposta: annullare, con motivo e storno dei costi.
   Niente cancellazione fisica: oggi la tabella non ha alcuna policy di DELETE, ed è giusto.

## 3. Le fasi

### Fase 1 — Vista «Giornale lavori» nella commessa (M)

Accanto a «Rapportini», in Cantiere.

- `src/lib/orders/detailNavigation.ts`: nuova voce `giornale` in `CANTIERE_VIEWS`, dopo `diario`.
- `src/components/orders/CantiereViewNav.tsx`: nascosta senza `canViewGiornaleLavori` o
  senza la funzione `cantieri_avanzati`, come la rotta della pagina.
- `src/pages/azienda/GiornaleLavori.tsx` (1.570 righe): estrarre il contenuto in un
  componente `GiornaleCommessa`, con `orderId` fisso che nasconde i due selettori di
  commessa. La pagina generale resta come vista di tutte le commesse e usa lo stesso componente.
- `src/pages/azienda/OrderDetail.tsx`: blocco `vistaCantiere === "giornale"` e conteggio delle
  pagine nel badge, come per i rapportini.
- `ProblemiApertiGiornale.tsx`: il link «Apri la pagina» porta alla nuova vista, con `pagina=`.
- Nessuna migrazione: `giornale_lavori` ha già `order_id` e l'unicità per commessa e giorno.
- Test: `cantiereViewNav`, `orderDetailNavigation`, `orderWorkspaceNav`, più un test sul
  componente con commessa fissa e sul permesso negato.

### Fase 2 — Reverse charge negli ordini (M)

Stato verificato:
- la casella sta in `DocumentoInvioDialog.tsx` e compare solo con tipo «servizi»;
- è bloccata se le righe hanno IVA, e ogni riga nuova nasce al 22%
  (`PurchaseOrderDetail.tsx`);
- **non viene salvata**: né `applicaDettagliOda` né `aggiornamentoDettagliOda`
  (`dettagliDocumentoOda.ts`) leggono o scrivono `inversioneContabile`;
- sul PDF e nell'email la dicitura c'è; nella scheda ordine a video no.

Lavoro:
- salvare `inversioneContabile` e la lettera della clausola in `document_details`
  (jsonb, nessuna migrazione per questo);
- interruttore «Reverse charge» nei dettagli ordine (`OdaDettagliCard.tsx`): acceso porta
  tutte le righe a IVA 0 in un'unica operazione, e le righe nuove nascono a 0; spento
  chiede l'aliquota da ripristinare;
- totali a video: «IVA: Inversione contabile»;
- `pdf.ts` e `modello.ts`: dicitura secondo la decisione 1, oggi limitata a «servizi»;
- predefinito per fornitore: colonna `suppliers.inversione_contabile` (una `vat_rate` a 0
  può voler dire anche esente), proposta alla creazione dell'ordine. Serve una migrazione.
- Fuori da questa fase: le fatture emesse hanno già N6.3 e N6.7 sulle righe.
- **Da verificare**: se serve la dicitura anche sulla commessa. `orders.vat_rate` può valere
  0, ma `OrdinePDF.tsx` stampa «IVA (0%)» senza dicitura.
- Test: dettagli salvati e riletti, righe azzerate, PDF ed email per entrambi i tipi.

### Fase 3 — Annullare un rapportino (M/L)

- Nuova funzione `campo_rapportino_annulla(p_id, p_updated_at, p_motivo)`, sul modello di
  `ufficio_annulla_ore`, che oggi vale solo per le ore scritte dall'ufficio. Permesso
  `can_edit_orders`, `REVOKE ALL … FROM PUBLIC, anon` e GRANT esplicito.
- Realizzato con la colonna `annullato_at` e lo stato `rifiutato`, invece di uno stato
  nuovo: tutte le letture già non contano i rifiutati. La colonna toglie «Approva ora» e
  impedisce di riaprirlo, e l'indice per giornata la esclude, così si può riscrivere.
- Interfaccia: «Annulla rapportino» con motivo in `OrdineRapportiniCampo.tsx`; annullati
  nascosti di norma e visibili con un filtro.
- Da gestire uno per uno, leggendo ogni funzione prima di scrivere:
  - storno del costo in `fn_rapportino_costo_manodopera` (**da verificare** che scatti anche
    verso il nuovo stato);
  - avanzamento delle fasi (`sottofase_revoca_avanzata`);
  - materiali usati e rientro (`materiale_rientro_magazzino`);
  - `mezzi_giornate`, `hr_buoni_pasto`, `hr_rimborsi_km`;
  - tutte le letture con `stato`, comprese `STATI_RAPPORTINO_BOZZA` e la vista
    `v_appalto_rapportini_da_rendicontare`.
- Annullamento **bloccato** se il rapportino è in un rendiconto non più in bozza o in una
  pagina di giornale firmata (`source_rapportini_ids`). Con firma del cliente: avviso esplicito.
- Test SQL in transazione annullata **su Demo Azienda 2**: costo, ore, avanzamento, doppio
  annullamento, permessi di un altro utente.

### Fase 4 — Parte economica dei rapportini (M, dopo la risposta)

Oggi `costo_manodopera` si calcola all'approvazione (`fn_rapportino_costo_manodopera`) e si
vede con `canViewCosts`. Prima dell'approvazione risulta «Non disponibile».

- **Ipotesi A, proposta:** riquadro «Costo della giornata» con manodopera, materiali
  (`rapportino_materiali.prezzo_unitario`), mezzi e totale, con stima anche prima
  dell'approvazione. **Da verificare** la fonte del costo mezzi.
- **Ipotesi B:** importo da addebitare al committente per i lavori in economia. Esistono già
  il documento «economia» e `appalto_rendiconto_righe`: si collega lì.

### Fase 5 — DDT e ordini come pagine proprie (M)

- Pagine `/azienda/ordini-acquisto` e `/azienda/ddt` col contenuto delle schede di
  `OrdersList.tsx` (`activeTab === "acquisto"` e `"ddt"`).
- `companyRoutes.tsx`: oggi le due rotte reindirizzano alle schede; si inverte, e i vecchi
  link `?tab=acquisto` e `?tab=ddt` portano alle pagine nuove.
- Voci in `sidebarConfig.ts` (area Cantieri), `MobileBottomNav`, `MobileAppGrid` e
  `COMMERCIALISTA_ALLOWED_URLS`; attenzione a chi ha solo l'«Ufficio acquisti».
- Il collegamento alla commessa resta come oggi. Nessuna migrazione.

### Fase 6 — Giornale condiviso con CSE e altri (S/M)

- `giornale_invii_dl`: colonna `ruolo` (direzione lavori, CSE, committente, altro).
- `InviaDirezioneLavori.tsx` diventa «Condividi», con ruolo e indirizzo proposti dalle
  figure della commessa quando ci sono.
- `giornale-invia-dl` e `giornale-dl-documento`: testo secondo il ruolo. Link a tempo come oggi.

### Fase 7 — Rifiniture

- Crediti: in `SettingsCredits.tsx` mostrare quota mensile (si azzera il 1°, consumata per
  prima) e saldo di bonus e ricariche (resta).

## 4. Senza sviluppo

- Accendere la bozza serale per l'azienda (`companies.giornale_auto_enabled`, oggi spenta;
  le sue commesse hanno già l'interruttore acceso), dalle impostazioni e col consenso del cliente.
- Android: l'app è sull'App Store, su Google Play la pagina non risulta. Pubblicazione
  secondo `docs/mobile-store-release.md`.
- Credito SMS, solo se si vuole il codice di firma anche via SMS.
- Prova di un DDT insieme al cliente: ne nasceranno eventuali richieste nuove.

## 5. Ordine e regole

Ordine proposto: 1, 2, 3, 5, 6, 7. La 4 appena arriva la risposta del cliente, prima della
5 perché è la richiesta più sollecitata. Ogni fase è un commit a sé.

- Migrazioni idempotenti, con `apply_migration` e riallineamento del registro (`CLAUDE.md`).
  Versione scelta al momento, oltre il massimo del registro: va controllato ogni volta.
- Prove solo su Demo Azienda 2.
- Prima di pubblicare: ramo ricostruito su `origin/main` aggiornato, typecheck e test critici.
