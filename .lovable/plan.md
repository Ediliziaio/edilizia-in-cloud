
# Nuova Tab "Tesoreria" nel Previsionale

## Obiettivo

Aggiungere una quarta tab chiamata **"Tesoreria"** alla pagina Previsionale, ispirata alla vista Agicap. Questa tab mostra entrate e uscite **effettive** (gia sostenute/incassate), organizzate in una struttura gerarchica ad albero con Aree, Categorie e Sotto-categorie espandibili/collassabili, con colonne mensili.

## Differenza rispetto alle altre tab

- Le tab esistenti (Incassato, Previsionale Costi, Previsione di Cassa) mostrano dati **previsionali** o **incassi recenti**
- La tab Tesoreria mostra una **vista consuntiva per mese** con entrate e uscite effettivamente registrate, organizzate per area contabile

## Struttura della Tesoreria

### Entrate (verde)
- Da Incassi Ordini: Acconti 1, Acconti 2, Saldi, Finanziamenti gia incassati
- Dati da: `orders` dove `deposit_paid = true`, `balance_paid = true`, ecc.

### Uscite (rosso) - organizzate per Area espandibile

**Area Operativa**
- Costi Variabili:
  - Fornitori (da `order_items` con `is_paid = true`)
  - Manodopera esterna (da `order_external_teams` con `is_paid = true`)
  - Provvigioni (da `order_salespeople` con `is_paid = true`)
- Costi Fissi:
  - Stipendi (da `employees` attivi)
  - Altre voci da `company_costs` con `is_paid = true` e `cost_type = fixed`

**Area Finanziaria**
- Voci da `company_costs` con `category` mappata all'area finanziaria

**Area Fiscale**
- Voci da `company_costs` con `category` mappata all'area fiscale

**Area Investimenti**
- Voci da `company_costs` con `category` mappata agli investimenti

**Area Equity**
- Voci da `company_costs` con `category` mappata all'equity

### Totali calcolati
- Tesoreria a fine mese = Entrate - Uscite (cumulativo)
- Saldo per Area (Operativa, Finanziaria, Fiscale, ecc.)

## Implementazione Tecnica

### 1. Nuova tabella DB: `treasury_categories`

Per permettere all'utente di configurare le proprie aree e categorie:

```sql
CREATE TABLE treasury_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  area TEXT NOT NULL,           -- 'operativa', 'finanziaria', 'fiscale', 'investimenti', 'equity'
  parent_id UUID REFERENCES treasury_categories(id),
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  is_income BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Con categorie standard pre-populate per ogni azienda. Inoltre aggiungere alla tabella `company_costs` una colonna `treasury_category_id` per collegare i costi alle categorie di tesoreria.

### 2. Nuovo componente: `src/components/forecast/TreasuryTab.tsx`

**Layout:**
- In alto: selettore periodo (range mesi da visualizzare) con datepicker Da/A
- Griglia con righe gerarchiche (Area > Categoria > Sotto-categoria > Dettaglio fornitore)
- Colonne: una per ogni mese nel range selezionato
- Righe espandibili/collassabili con icona chevron (come Agicap)
- Riga "Tesoreria a inizio mese" in cima
- Sezione Entrate con sotto-voci
- Sezione Uscite con sotto-voci per Area
- Riga "Tesoreria a fine mese" in fondo

**Interazione:**
- Click su chevron per espandere/collassare un'area o categoria
- I totali di riga si aggiornano in base ai dati effettivi (pagamenti con `is_paid = true` e relative date di pagamento)

### 3. Dati necessari

La tab riutilizzera in gran parte i dati gia presenti nel hook `useCashFlowData`, ma necessita anche dei **pagamenti effettuati** (non solo quelli attesi). Servira una query aggiuntiva o estendere le query esistenti per includere:
- Pagamenti ordini gia effettuati (con date di pagamento)
- Costi aziendali gia pagati (`company_costs` con `is_paid = true`)
- Pagamenti fornitori gia effettuati (`order_items` con `is_paid/deposit_paid/balance_paid = true`)
- Squadre esterne gia pagate (`order_external_teams` con `is_paid = true`)
- Provvigioni gia pagate (`order_salespeople` con `is_paid = true`)

### 4. File da creare
- `src/components/forecast/TreasuryTab.tsx` - Componente principale della tab
- Migrazione DB per `treasury_categories` e colonna `treasury_category_id` su `company_costs`

### 5. File da modificare
- `src/pages/azienda/CashFlowForecast.tsx` - Aggiungere la quarta tab "Tesoreria"
- `src/hooks/useCashFlowData.ts` - Aggiungere query per dati pagati/effettivi e categorie tesoreria
- `src/lib/forecastTypes.ts` - Aggiungere tipi per le categorie di tesoreria

### 6. Design della griglia

La griglia sara costruita come tabella HTML con righe indentate:

```text
Livello 0: Tesoreria a inizio mese          | Gen 24 | Feb 24 | Mar 24 | ...
Livello 0: [v] Entrate                      |  500   | 9.528  | 23.883 | ...
Livello 1:   [v] Da Incassi Ordini          |  500   | 9.528  | 23.883 | ...
Livello 2:     RIBA Clienti Italia           |    0   |     0  |  3.508 | ...
Livello 0: [v] Uscite                       |  926   | 1.881  | 12.436 | ...
Livello 1:   [v] AREA OPERATIVA             |  912   | 1.881  | 11.643 | ...
Livello 2:     [v] Costi Variabili          |  912   | 1.651  |  8.893 | ...
Livello 3:       Fornitori Italia            |  259   |   144  |  3.508 | ...
Livello 3:       Manodopera esterna          |    0   |   430  |  1.300 | ...
Livello 2:     [v] Costi Fissi              |    0   |     0  |    793 | ...
Livello 3:       Stipendi Lordi              |    0   |     0  |    793 | ...
Livello 1:   [v] AREA FINANZIARIA           |   14   |     0  |    793 | ...
Livello 1:   [v] AREA FISCALE               |    0   |   229  |  2.855 | ...
Livello 1:   [v] AREA INVESTIMENTI          |    0   |     0  |      0 | ...
Livello 1:   [v] AREA EQUITY                |    0   |     0  |      0 | ...
Livello 0: Tesoreria a fine mese            | 2.112  | 9.756  | 23.514 | ...
```

Le categorie di default verranno create automaticamente alla prima apertura della tab se non esistono per quella azienda. L'utente potra personalizzarle in futuro tramite le impostazioni.

## Sequenza di implementazione

1. Creare migrazione DB per `treasury_categories` + colonna su `company_costs`
2. Aggiornare i tipi in `forecastTypes.ts`
3. Estendere `useCashFlowData.ts` con query per dati effettivi e categorie
4. Creare `TreasuryTab.tsx` con la griglia espandibile
5. Aggiungere la tab in `CashFlowForecast.tsx`
