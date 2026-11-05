# Commessa: scheda «Fatture e costi» — piano

**Obiettivo:** ogni uscita di denaro della commessa sta in un posto solo, diviso per chi la riceve: fornitori, subappaltatori, noleggi, manodopera, altri costi.

**Regola delle schede**

| Scheda | Risponde a |
|---|---|
| Panoramica | Come va? |
| Cantiere | Chi fa cosa e quando (costo mezzi solo previsto; ditte con riga di stato) |
| Materiali e acquisti | Chiedere, ordinare, ricevere la merce |
| **Fatture e costi** (nuova) | Cosa esce, a chi, pagato o no |
| Economia e pagamenti | Cosa entra e cosa resta |

**Vincoli:** nessun numero cambia, stesse fonti (`company_costs`, `commessa_quadro_pagamenti`, `v_ordine_marginalita`). I vecchi link continuano ad arrivare al posto giusto. Da telefono due sole viste, sola lettura salvo «Aggiungi costo».

## Dove va cosa

| Oggi | Domani |
|---|---|
| Materiali → Fatture e costi → Fatture dei fornitori | Fatture e costi → Fornitori |
| Materiali → Fatture e costi → Costi della commessa | Fatture e costi → Altri costi |
| Economia → Incassi e pagamenti → tabella uscite | Fatture e costi → Tutte |
| Economia → Manodopera e subappalti → dipendenti | Fatture e costi → Manodopera |
| Economia → Manodopera e subappalti → ditte | Fatture e costi → Subappaltatori |
| Scheda subappaltatore → Contabilità (SAL, fatture, ritenute) | Resta, e la stessa gestione si apre anche da Fatture e costi → Subappaltatori |
| Economia → SAL | Economia → «SAL al cliente» |
| Economia → Documenti | Economia → «Fatture al cliente» |
| Economia → Incassi e pagamenti | Economia → «Incassi» (i quattro numeri in cima restano) |
| Cantiere → Lavorazioni → Mezzi | Resta: periodo, fasi, costo previsto |

## Tappa 1 — La scheda e gli spostamenti (nessuna logica nuova)
- `src/lib/orders/detailNavigation.ts`: `OrderDetailTab` + `"costi"`; `COSTI_VIEWS` = `tutte`, `fornitori`, `subappaltatori`, `noleggi`, `manodopera`, `altri`; `resolveCostiView`; `vista_costi`.
- Vecchi indirizzi: `vista_materiali=fatture`, `section-fatture-fornitori`, `vista_economia=manodopera`, `section-manodopera-costi` portano alla nuova vista.
- `src/pages/azienda/OrderDetail.tsx`: nuovo `TabsContent`; `DocumentiInPopup` avvolge anche questa scheda; contatori di `useFattureFornitoriCommessa` abilitati su `activeTab === "costi"`.
- Permesso: la scheda si vede con `canViewCosts`.
- Test: `orderDetailNavigation.test.ts`, `orderWorkspaceNav.test.tsx`, `orderDetailComposition.test.ts`, più i vecchi indirizzi.

## Tappa 2 — «Tutte»: la tabella uscite unica
- Da `QuadroPagamentiCommessa.tsx` si estrae la tabella uscite (righe 120-165) in un componente proprio, con `ContatoriFiltro` per categoria. Economia → Incassi mantiene numeri, rate e SAL cliente.
- Test: la somma delle categorie resta uguale al totale del quadro.

## Tappa 3 — «Subappaltatori»
- Una riga per ditta e contratto: contrattuale, maturato, ritenute, fatturato, pagato, residuo, stato dell'ultimo SAL. Dati dalle righe `categoria = 'subappalti'` del quadro, più `sal_subappaltatori` filtrati per `order_id`.
- Riga aperta: `SALContabilita`, `RitenuteContabilita`, `VerbaleSalSubDialog`, `SalPaymentDialog`. La logica sta oggi dentro `SubappaltatoreDetail.tsx` (righe 1056-1120): va estratta in un componente unico usato da entrambe le pagine.
- Scrittura: stessa condizione di oggi (`canEditOrders && canViewSubappaltatoriAmministrazione && canViewCosts && !solaLettura`).
- Cantiere → Lavorazioni → ditte (`DitteContrattiCommessa`): riga «SAL 2 da verificare · residuo €» che apre la ditta qui, in popup. Solo per chi ha il permesso.

## Tappa 4 — «Noleggi e mezzi»
- Una riga per assegnazione del piano: mezzo, periodo, fornitore, previsto (`costoPianoMezzo`), registrato (`mezzi_piano_fonti`), pagato, differenza.
- Azioni: «Registra costo» (form di Altri costi già compilato, poi collegato con `collega_spesa_piano_mezzo`) e «Collega fattura o OdA» (`SpesePianoMezzo`).
- Il previsto resta fuori dal margine: `mezzi_piani_costi` non entra in `v_ordine_marginalita`. La vista lo dice a parole, e segnala i mezzi con previsto e nessun costo registrato.

## Tappa 5 — «Altri costi» con il tipo
- `NuovoCostoDialog`: «Di che tipo è» (Altro, Noleggio e mezzi, Professionista) e fornitore facoltativo. «Importo pagato» diventa «Importo». Il tipo scrive `company_costs.category`, con i valori già usati.
- **Migrazione (serve il tuo sì):** `commessa_quadro_pagamenti` oggi guarda solo `suppliers.tipo`. Un costo a mano senza fornitore finisce sempre in «Costi extra», e i 133 costi su commessa con `category = 'trasporti_noleggi'` non contano come noleggi. Va aggiunto il ramo su `category`. Cambia la categoria mostrata, non i totali.
- Test: `costoCommessa` e prova SQL con rollback sui totali prima e dopo.

## Variante decisa dopo (02/11/2026)
La vista «Noleggi e mezzi» è stata tolta: era un doppione. I mezzi si gestiscono in Cantiere → Lavorazioni e il riepilogo economico sta in Economia → Margini e costi (`CostiMezziRiepilogo`). Lo stato del costo e «Registra costo» sono entrati lì; i pagamenti dei noleggi si leggono in Fatture e costi → Tutte.

## Collaudo sulla Demo
Stessa commessa, prima e dopo: margine, totale uscite, pagato e residuo identici. Vecchi link dalle notifiche. Telefono a 375 px. Ruolo senza `canViewCosts`: scheda assente. Poi `node scripts/typecheck-ratchet.mjs`, `bun run test:critical`, build completa.
