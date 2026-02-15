

# Miglioramento Sezione Costi Aziendali - Livello Controllo di Gestione

## Panoramica

Trasformare la sezione Costi in uno strumento professionale di amministrazione e controllo di gestione, aggiungendo:
- Gestione IVA (importo netto/lordo con scorporo automatico)
- Collegamento a fornitori dalle Impostazioni (con categorie dinamiche)
- UX migliorata con layout piu' chiaro e funzionale

---

## 1. Migrazione Database

Aggiungere alla tabella `company_costs`:

```text
vat_rate    NUMERIC DEFAULT 22       -- Aliquota IVA
supplier_id UUID    REFERENCES suppliers(id) ON DELETE SET NULL  -- Fornitore collegato
```

---

## 2. Categorie Fornitori Dinamiche

Attualmente `product_category` nei fornitori e' un campo testo libero. Il piano prevede:

- Nel dialog di creazione/modifica costo, mostrare un combobox per la categoria che:
  - Elenca le categorie esistenti (estratte dai valori unici di `company_costs.category` e `suppliers.product_category`)
  - Permette di digitare una nuova categoria che viene salvata direttamente nel campo `category`
- Nessuna tabella aggiuntiva necessaria: le categorie sono derivate dai dati esistenti

---

## 3. Collegamento Fornitori nel Form Costi

Nel dialog di creazione/modifica costo:

- Aggiungere un Select "Fornitore" che mostra i fornitori dall'elenco in Impostazioni (tabella `suppliers`)
- Selezionando un fornitore:
  - L'aliquota IVA viene precompilata dalla `vat_rate` del fornitore
  - La categoria viene precompilata dalla `product_category` del fornitore (se presente)
- Il fornitore e' opzionale (i costi come affitto, utenze non hanno fornitore)

---

## 4. Gestione IVA nel Form Costi

Aggiungere al dialog di creazione/modifica:

- Select "Aliquota IVA" con le opzioni standard (22%, 10%, 4%, 0%)
- Toggle "Importo Ivato / Imponibile" (come gia' implementato negli ordini)
- Se "Ivato": l'importo inserito e' il lordo, il sistema scorporera' l'IVA e salvera' l'imponibile
- Se "Imponibile": l'importo e' gia' netto
- Mostrare sotto il campo importo un riepilogo: "Imponibile: X EUR | IVA (22%): Y EUR | Totale: Z EUR"

Nella tabella costi:
- Mostrare l'importo netto (imponibile) come valore principale
- In un tooltip o sotto-riga mostrare "IVA 22%: X EUR"

---

## 5. Miglioramenti UX (Controllo di Gestione)

### 5a. Layout Summary Cards migliorato
- Aggiungere card "Fornitori da pagare" (totale non pagato per i costi con supplier_id)
- Card "IVA a debito" (somma IVA su costi non pagati) per visione fiscale

### 5b. Tabella costi migliorata
- Colonna "Fornitore" con nome fornitore linkabile
- Colonna "IVA" con badge aliquota
- Raggruppamento visivo per fornitore nella tab Fornitori (gia' presente, da migliorare con totali per fornitore)

### 5c. Form dialog migliorato
- Layout a 2 colonne piu' strutturato
- Sezione "Dati Fiscali" separata (IVA + fornitore)
- Sezione "Pianificazione" separata (ricorrenza + scadenza)
- Feedback visivo immediato sullo scorporo IVA

### 5d. Filtri migliorati
- Aggiungere filtro per fornitore
- Aggiungere filtro per categoria

---

## 6. Riepilogo File e Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Migrazione DB | -- | Aggiungere `vat_rate` e `supplier_id` a `company_costs` |
| Modificare | `src/components/forecast/CompanyCostsManager.tsx` | Form con IVA, fornitori, categorie dinamiche, UX migliorata |
| Modificare | `src/lib/forecastTypes.ts` | Aggiungere `vatRate` e `supplierName` a `CompanyCostEntry` (se usato) |

---

## 7. Dettaglio Tecnico - Form Costi Aggiornato

### Nuovi campi `CostFormData`:

```text
supplier_id: string    -- ID fornitore (opzionale)
vat_rate: string       -- Aliquota IVA (default "22")
is_gross: boolean      -- true = importo ivato, false = imponibile
```

### Query aggiuntiva:
- Fetch `suppliers` dell'azienda per popolare il Select fornitore nel dialog

### Logica salvataggio:
- Se `is_gross === true`: `amount = grossAmount / (1 + vatRate/100)` (salva sempre il netto)
- Se `is_gross === false`: `amount = inputAmount` (gia' netto)
- Salvare `vat_rate` e `supplier_id` nel record

### Logica visualizzazione:
- In tabella: mostrare `amount` (netto) + badge IVA
- Nel tooltip: mostrare `amount * (1 + vat_rate/100)` come totale lordo

---

## Risultato Atteso

Un amministratore vedra':
1. **Summary**: 5 card con totali (da pagare, pagato, scaduti, stima annuale, fornitori)
2. **Filtri**: ricerca + periodo + stato + fornitore + categoria
3. **Tabella**: nome, fornitore, categoria, imponibile, IVA%, ricorrenza, scadenza, stato, azioni
4. **Form**: layout professionale con sezioni separate, scorporo IVA automatico, fornitore collegato con precompilazione
5. **Tab Fornitori**: raggruppamento con barre progresso e dettaglio rate

