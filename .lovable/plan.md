

# Inserimento Dati Demo Completi — Squadre Esterne e Provvigioni Agente

## Stato Attuale
- **5 clienti**: già creati (Bianchi, Verdi, Rossi, Neri, Esposito)
- **5 ordini**: già creati con installments e order_items completi
- **Mancante**: `order_salespeople` (provvigioni) e `order_external_teams` (squadre esterne)
- **Squadre esterne disponibili**: solo 1 (Davide Fontana) → ne creo altre 2
- **Venditori disponibili**: Maurizio Trevisi, Filippo Bellomo, Luizia Antal

## Piano di Inserimento

### 1. Creare 2 nuove squadre esterne

| Nome | Contatto | Specializzazione |
|------|----------|-----------------|
| Edil Service Srl | Marco Ferretti | Idraulica/posa bagni |
| Tecno Tetti Snc | Paolo Galli | Coperture/tetti |

### 2. Assegnare squadre esterne ai 5 ordini

| Ordine | Squadra | Costo lordo | IVA |
|--------|---------|------------|-----|
| ORD-001 (Bianchi, bagno €15K) | Davide Fontana | €1.800 | 22% |
| ORD-002 (Verdi, finestre €8.5K) | Davide Fontana | €1.200 | 22% |
| ORD-003 (Rossi, tetto €22K) | Tecno Tetti Snc | €3.500 | 22% |
| ORD-004 (Neri, fotovoltaico €12K) | Edil Service Srl | €2.000 | 22% |
| ORD-005 (Esposito, pittura €6K) | Edil Service Srl | €800 | 22% |

### 3. Assegnare provvigioni venditori ai 5 ordini

| Ordine | Venditore | Tipo | Valore | Importo |
|--------|-----------|------|--------|---------|
| ORD-001 | Trevisi | % venduto | 5% | €750 |
| ORD-002 | Bellomo | fisso | — | €400 |
| ORD-003 | Trevisi | % venduto | 4% | €880 |
| ORD-004 | Antal | % venduto | 6% | €720 |
| ORD-005 | Bellomo | fisso | — | €250 |

### File da modificare
Nessun file di codice — solo inserimenti dati via tool SQL insert.

### Sequenza
1. INSERT 2 external_teams
2. INSERT 5 order_external_teams
3. INSERT 5 order_salespeople

