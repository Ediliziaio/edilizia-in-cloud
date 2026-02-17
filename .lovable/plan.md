

# Fix Warning Console nella Tab Marginalita

## Problema Rilevato

La console mostra un warning: **"Function components cannot be given refs"** su `MarginTab`. Questo accade perche `TabsContent` di Radix passa un `ref` al suo figlio diretto, ma `MarginTab` e' un componente funzione senza `forwardRef`.

Tutte le altre tab non hanno questo problema perche i loro componenti sono wrappati in `<div>` interni che assorbono il ref.

## Soluzione

Wrappare `<MarginTab />` in un `<div>` dentro `TabsContent` in `CashFlowForecast.tsx`, cosi il ref di Radix atterri su un elemento DOM nativo.

## Dettaglio Tecnico

### File: `src/pages/azienda/CashFlowForecast.tsx`

Cambiare riga 155-157 da:

```tsx
<TabsContent value="marginalita" className="mt-6">
  <MarginTab />
</TabsContent>
```

a:

```tsx
<TabsContent value="marginalita" className="mt-6">
  <div>
    <MarginTab />
  </div>
</TabsContent>
```

## Verifica Funzionale Completa

Ho verificato che tutti i requisiti della specifica sono implementati:

| Sezione | Stato | Note |
|---------|-------|------|
| 1 - Marginalita per Commessa | OK | Tabella con cliente, commessa, fatt. imp., costi var., margine EUR/%, stato con soglia personalizzabile |
| 2 - Margine Lordo Medio | OK | 4 card KPI (media EUR, media %, min, max) + deviazione standard con interpretazione |
| 3 - Costi Fissi | OK | Breakdown per categoria + stipendi + totale mensile |
| 4 - Break Even | OK | Formula corretta, delta visivo con colori verde/rosso |
| 5 - Alert Intelligenti | OK | 5 tipi di alert con suggerimento azione |
| 6 - Simulatore Strategico | OK | 4 input + 3 output calcolati in tempo reale |

### Logica Finanziaria Verificata
- `total_amount` trattato come imponibile (coerente con il progetto)
- Costi articoli e squadre scorporati IVA con `calculateNetFromGross`
- Provvigioni calcolate su imponibile totale (coerente con `OrderEconomics`)
- Break Even = Costi Fissi Mensili / (Margine Medio % / 100)
- Soglia margine salvata in `localStorage` per azienda

### UX Verificata
- Numeri grandi (text-3xl) nelle card KPI
- Colori: emerald per utile, red per perdita, amber per warning
- Linguaggio imprenditoriale, nessun tecnicismo contabile
- Loading skeleton durante caricamento
- Stato vuoto gestito ("Nessuna commessa trovata")

