

# Rendere il bottone "Pulisci" meno invasivo

## Modifica in `src/components/orders/OrdersFilters.tsx`

Il bottone "Pulisci" attualmente mostra sia l'icona X che il testo. Per renderlo meno invasivo:

- Rimuovere il testo "Pulisci", lasciare solo l'icona X
- Ridurre la dimensione usando `size="icon"` con classe compatta
- Usare `variant="ghost"` con colore `text-muted-foreground` e dimensioni ridotte
- Risultato: un piccolo bottone X discreto, tipo close button

