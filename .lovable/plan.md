

# SO3 — Sostituzione OpportunityDetailDialog.tsx

## Cosa cambia
Il file corrente (1017 righe) viene sostituito con la versione SO3 (1010 righe dal prompt, righe 11–1010). Differenze principali:

1. **Rimossa tab "quotes"** — il tipo `Tab` perde `"quotes"`, rimosso import di `OpportunityQuotesTab` e `Receipt` icon
2. **Rimosso import `Slider`** e `useMemo` — non più usati
3. **Rimossa query `opportunity_loss_reasons`** — il dialog motivo perdita ora usa categorie hardcoded invece di una tabella DB
4. **Aggiunto import `useUpdateOpportunityMutation`** da `useSalesOS` — per aggiornamenti diretti dei campi Sales OS (probability, expected_close_date, next_action)
5. **Aggiunto import di componenti UI** — `Card`, `CardContent`, `CardHeader`, `CardTitle`, `DialogHeader`, `DialogFooter` + icone `Target`, `Trophy`
6. **Sezione "Avanzamento Commerciale"** riscritta come Card con salvataggio inline (onBlur/onChange → `updateOpportunity.mutate`) per data chiusura, probabilità e prossima azione
7. **Dialog motivo perdita** riformattato — usa `Dialog` invece di `AlertDialog`, categorie in italiano hardcoded, campo concorrente aggiunto

## Rischi
- Rimozione tab "quotes": se usata in produzione, gli utenti non la vedranno più. Il prompt chiede di scrivere esattamente questo contenuto.
- L'import `useUpdateOpportunityMutation` è risolto dal file SO2 appena creato.

## Piano
1. Sovrascrivere `src/components/opportunities/OpportunityDetailDialog.tsx` con il contenuto esatto delle righe 11–1010 del file SO3 caricato.
2. Nessun altro file viene toccato.

