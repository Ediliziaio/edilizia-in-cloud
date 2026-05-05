---
area: 05-fiscale-compliance
titolo: Split payment per fatture verso PA
tags: [split-payment, iva, pa, art-17-ter-dpr-633-72]
livello: intermedio
applicabile_a: [fatturazione-pa, appalti-pubblici]
kpi_correlati: [importi-split-payment, crediti-iva-pa]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Split payment — IVA versata dalla PA

Lo **split payment** (scissione dei pagamenti, art. 17-ter DPR 633/72) si applica alle cessioni e prestazioni effettuate verso la **Pubblica Amministrazione** e enti assimilati. Meccanismo: l'IVA in fattura non viene incassata dall'impresa, ma versata direttamente dalla PA all'erario.

## Schema dello split payment

1. Impresa emette fattura alla PA con IVA in fattura.
2. PA paga all'impresa solo l'**imponibile** (senza IVA).
3. PA versa l'IVA direttamente all'AdE.
4. Impresa registra la fattura ai fini IVA ma non incassa l'IVA.

Esempio: fattura 100 + 22% IVA = 122 totale.
- Impresa incassa: 100 €
- PA versa all'AdE: 22 €

## Quando si applica

- Cessioni e prestazioni verso amministrazioni pubbliche
- Cessioni verso enti pubblici (sanità, scuola, ecc.)
- Cessioni verso società quotate in indici controllati o partecipate dalla PA
- Verifica gli elenchi MEF aggiornati per gli enti specifici

Si applica indipendentemente dall'importo.

## Cosa cambia per l'impresa edile

**Cassa**: l'IVA non passa più dal conto dell'impresa. Per cantieri verso PA con IVA al 10% o 22%, è una somma significativa che la PA versa direttamente all'erario.

**Crediti IVA**: poiché l'impresa **non incassa IVA** sulle vendite PA, ma **paga IVA** sugli acquisti, genera **crediti IVA** strutturali. Questi crediti vanno gestiti (rimborsi annuali, compensazioni F24).

**Liquidazione IVA**: l'IVA in split payment non entra nel calcolo del versamento periodico (perché versata direttamente dalla PA), ma va indicata in dichiarazione.

## Implicazioni cassa

Per impresa che lavora prevalentemente con PA:
- Ogni anno crediti IVA significativi (5-15% del fatturato in genere)
- Necessità di chiedere rimborsi periodici (con visto di conformità)
- Cassa "ferma" presso AdE per 6-12 mesi prima del rimborso

Strategia: pianificare rimborsi IVA annuali con commercialista, includere nei forecast di cassa.

## Reverse charge vs split payment

Confondibili ma diversi:

- **Reverse charge** (art. 17 c.6 DPR 633/72): IVA NON in fattura, cliente integra
- **Split payment** (art. 17-ter DPR 633/72): IVA IN fattura, ma PA paga IVA direttamente all'erario

Lo split payment **non si applica** alle operazioni in reverse charge (priorità a quest'ultimo).

## Codici di natura in fattura

Per fatture PA in split payment:
- TipoDocumento: TD01 standard
- IVA in fattura: aliquota standard (22%, 10%, 4%)
- **Esigibilità IVA**: campo specifico con valore "S" (split payment)

I gestionali edili impostano automaticamente questi codici per anagrafiche PA.

## Errori comuni

1. **Non applicare split payment a PA che lo richiede**: errore formale, contestazione.
2. **Applicare split payment a soggetti privati**: errore formale opposto.
3. **Non monitorare i crediti IVA strutturali**: rimborsi mai richiesti, cassa ferma anni.
4. **Confondere split payment con reverse charge**: due fattispecie diverse.
5. **Mancato indicato del campo "Esigibilità IVA"** in fattura elettronica: scarto SDI.

## Quando esce dal regime

Alcune categorie di soggetti possono uscire dallo split payment in casi specifici (es. comuni in dissesto). Verifica annualmente gli elenchi MEF.

## Riferimenti normativi

- **DPR 633/1972 art. 17-ter** — disciplina split payment
- **D.M. 23 gennaio 2015** — modalità attuative
- **Decreti MEF** annuali — elenchi PA soggette
- **Circolari AdE** — interpretazione casi
