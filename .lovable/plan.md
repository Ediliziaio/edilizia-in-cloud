

# Miglioramento UX Pagina Dettaglio Contatto

## Problemi Identificati (dallo screenshot)

1. **Colonna sinistra (300px)**: troppo compatta, i campi sono schiacciati, poca leggibilità
2. **Colonna centrale**: troppo larga e vuota (prende tutto lo spazio rimanente con `flex-1`), la timeline è dispersa in un'area troppo ampia
3. **Proporzioni generali**: sbilanciamento tra le tre colonne

## Modifiche Pianificate

### 1. Ridimensionamento colonne
- **Colonna sinistra**: da `w-[300px]` a `w-[340px]` per dare piu respiro ai campi inline (label + valore)
- **Colonna centrale**: aggiungere `max-w-2xl mx-auto` al contenuto della timeline per evitare che si estenda troppo su schermi larghi, mantenendo il contenuto centrato e leggibile

### 2. Miglioramento colonna sinistra
- Aumentare padding interno da `p-3` a `p-4`
- Avatar piu grande: da `h-10 w-10` a `h-12 w-12`
- Nome contatto piu grande: da `text-sm` a `text-base`
- Spacing tra sezioni piu generoso: da `space-y-3` a `space-y-4`
- Grid dei campi inline: da `grid-cols-[110px_1fr]` a `grid-cols-[120px_1fr]` per label piu leggibili
- Label dei campi: da `text-[11px]` a `text-xs` per migliore leggibilità
- Valori dei campi: altezza minima da `min-h-[28px]` a `min-h-[32px]`
- Titolare/Follower select: da `text-[11px]` a `text-xs`
- Tags badge: da `text-[10px]` a `text-[11px]`
- Tab triggers: da `text-[11px]` a `text-xs`

### 3. Centro: timeline piu contenuta
- Contenuto timeline con `max-w-xl mx-auto` per non dispersersi
- Padding laterale piu generoso

## File Coinvolto

| File | Modifica |
|---|---|
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Ridimensionamento colonne, miglioramento spacing e tipografia colonna sinistra, contenimento timeline centrale |

## Cosa NON cambia
- Nessuna modifica funzionale
- Nessuna modifica al database
- Nessuna modifica alla colonna destra (sidebar icone)
- Tutte le interazioni restano identiche

