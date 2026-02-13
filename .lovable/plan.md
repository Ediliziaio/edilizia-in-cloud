
# Decurtazioni e Provvigioni nel Conto Economico

## Cosa cambia

### 1. Campo "Decurtazione" per ogni venditore (OrderCommissions)
Per ogni provvigione nella card "Provvigioni Venditori", aggiungere un campo numerico opzionale **"Decurtazione"** che rappresenta importi sottratti dalla provvigione del commerciale (sconti extra concessi, errori a suo carico, ecc.). La provvigione netta sara: `provvigione calcolata - decurtazione`.

Serve una nuova colonna nel database: `order_salespeople.deduction_amount` (numeric, default 0).

### 2. OrderEconomics mostra il totale provvigioni corretto
Il Conto Economico attualmente ricalcola le provvigioni ma non considera le decurtazioni. Verra aggiornato per:
- Fetchare anche `commission_amount` e il nuovo campo `deduction_amount` dal database
- Mostrare nella sezione PROVVIGIONI VENDITORI ogni venditore con provvigione calcolata, decurtazione, e netto
- Il totale provvigioni (al netto delle decurtazioni) viene usato nel calcolo del margine

### 3. Riepilogo nella sezione provvigioni del Conto Economico
La sezione mostrera:
- Per ogni venditore: nome, provvigione lorda, decurtazione (se presente), provvigione netta
- Totale provvigioni (netto decurtazioni)

## Dettaglio tecnico

### Migrazione database
Aggiungere colonna `deduction_amount` (numeric, default 0) alla tabella `order_salespeople`.

### File da modificare

**`src/components/orders/OrderCommissions.tsx`**
- Aggiungere campo input "Decurtazione" per ogni venditore
- Calcolare la provvigione netta come `calcolata - deduction_amount`
- Aggiornare il riepilogo "Decurtazioni dall'ordine" per considerare le decurtazioni
- Salvare `deduction_amount` nelle mutation

**`src/components/orders/OrderEconomics.tsx`**
- Aggiornare la query per fetchare anche `commission_amount` e `deduction_amount`
- Aggiornare l'interfaccia `OrderSalesperson` con i nuovi campi
- Calcolare il totale provvigioni nette (provvigione - decurtazione) per ogni venditore
- Mostrare il dettaglio decurtazioni nella sezione PROVVIGIONI VENDITORI
- Usare il totale netto per il calcolo del margine
