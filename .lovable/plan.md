

# Creazione Dati Demo per Domus Group S.r.l.

## Dati trovati
- **Company ID**: `728fc9cf-31d3-4a1e-9f01-a38c01902836`
- **Fornitori esistenti**: Cosmet, Deghi, Lima Group, Marysoryna
- **Stato iniziale**: "Contratto Firmato" (`8646e7a6-...`)
- **Profiles**: nessuna FK verso auth.users → posso creare clienti direttamente

## Piano di inserimento

### 1. Creare 5 clienti (profiles + user_roles)

| # | Nome | Email |
|---|------|-------|
| 1 | Marco Bianchi | marco.bianchi@demo.it |
| 2 | Laura Verdi | laura.verdi@demo.it |
| 3 | Giuseppe Rossi | giuseppe.rossi@demo.it |
| 4 | Francesca Neri | francesca.neri@demo.it |
| 5 | Antonio Esposito | antonio.esposito@demo.it |

### 2. Creare 5 ordini con rate e margini diversi

| # | Cliente | Imponibile | Rate | Margine target | Costo fornitura lordo (IVA 22%) |
|---|---------|-----------|------|---------------|-------------------------------|
| 1 | Bianchi | €15.000 | 2 (50/50) mar+apr | ~35% | €11.890 (→ netto €9.745) |
| 2 | Verdi | €8.500 | 3 rate mar+apr+mag | ~25% | €7.778 (→ netto €6.375) |
| 3 | Rossi | €22.000 | 4 rate mar+apr+apr+mag | ~10% | €24.156 (→ netto €19.800) |
| 4 | Neri | €12.000 | 3 rate mar+apr+mag | ~20% | €11.712 (→ netto €9.600) |
| 5 | Esposito | €6.000 | 2 rate apr+mag | ~30% | €5.124 (→ netto €4.200) |

### 3. Per ogni ordine
- **Order installments**: rate con date distribuite tra marzo, aprile e maggio 2026
- **Order items**: 1-2 articoli per ordine con `purchase_price` (lordo) calibrato per raggiungere il margine target, assegnati ai fornitori esistenti

### 4. Strumento
- Edge function temporanea con service role per creare i profili (auth.users necessari per i ruoli) **oppure** inserimenti diretti via tool insert dato che non c'è FK su auth.users

### Esecuzione
Userò il tool di insert per eseguire le query SQL di inserimento in sequenza: profiles → user_roles → orders → order_installments → order_items → order_status_history.

