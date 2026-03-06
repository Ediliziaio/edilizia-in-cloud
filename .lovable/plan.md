

# Fix distribuzione colonne tabella Marginalità

## Problema
Le colonne "Cliente" e "Commessa" hanno `min-w` ma nessun limite massimo, quindi il browser assegna loro tutto lo spazio rimanente creando un gap enorme. Le ultime 5 colonne numeriche hanno `w-[120px]` fisso e risultano troppo compresse.

## Fix
Usare `table-fixed` sul `<Table>` e ridistribuire le larghezze con percentuali proporzionate:

- Cliente: `w-[18%]`
- Commessa: `w-[16%]`
- Fatt. Imp.: `w-[14%] text-right`
- Costi Var.: `w-[14%] text-right`
- Margine €: `w-[14%] text-right`
- Margine %: `w-[12%] text-right`
- Stato: `w-[12%] text-center`

Questo distribuisce lo spazio in modo uniforme eliminando il gap e dando più respiro alle colonne numeriche.

