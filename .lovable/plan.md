

# Piano: Dettagli Fornitori + Divisione Italiani/Esteri

## 1. Filtri Lista Ordini

La lista ordini (`OrdersList.tsx`) ha gia tutti i filtri richiesti implementati:
- Ricerca per codice, descrizione o cliente
- Filtro per stato
- Filtro per cliente
- Filtro per data (contratto, arrivo merce, posa)
- Filtro per importo e pagamento

Non servono modifiche.

---

## 2. Migrazione database - Nuove colonne su `suppliers`

Aggiungere i seguenti campi alla tabella `suppliers`:

- `is_foreign` (boolean, default false) - per distinguere italiani da esteri
- `address` (text) - indirizzo
- `city` (text) - citta
- `province` (text) - provincia
- `postal_code` (text) - CAP
- `country` (text, default 'Italia') - paese
- `vat_number` (text) - P.IVA
- `fiscal_code` (text) - codice fiscale
- `email` (text) - email
- `phone` (text) - telefono
- `website` (text) - sito web
- `product_category` (text) - categoria prodotti
- `notes` (text) - note

---

## 3. Aggiornamento SuppliersConfig

**File**: `src/components/settings/SuppliersConfig.tsx`

Modifiche:
- Aggiungere **Tabs** (Italiani / Esteri) per dividere i fornitori in base al campo `is_foreign`
- Contatore per ogni tab (es. "Italiani (5)" / "Esteri (2)")
- Espandere il **form di creazione/modifica** con tutti i nuovi campi organizzati in sezioni:
  - **Dati Generali**: Nome, Categoria Prodotti, Tipo (Italiano/Estero)
  - **Dati Fiscali**: P.IVA, Codice Fiscale, Aliquota IVA
  - **Contatti**: Email, Telefono, Sito Web
  - **Indirizzo**: Via, Citta, Provincia, CAP, Paese
  - **Note**: campo testo libero
- Mostrare nella tabella colonne aggiuntive: Categoria, Citta, P.IVA (oltre a Nome e IVA)
- Il dialog diventa piu largo (`max-w-2xl`) per ospitare i campi aggiuntivi

---

## 4. Riepilogo tecnico

| File | Modifica |
|------|----------|
| **Migrazione DB** | 13 nuove colonne su `suppliers` |
| `src/components/settings/SuppliersConfig.tsx` | Tabs Italiani/Esteri, form espanso, tabella arricchita |

Nessun impatto su RLS: le policy esistenti su `suppliers` coprono gia i nuovi campi.

Il componente `SupplierSelect.tsx` usato negli ordini non necessita modifiche poiche usa solo `id`, `name` e `vat_rate`.

