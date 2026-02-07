
# Piano: Sistema Gestione Operai (Dipendenti Interni + Squadre Esterne)

## Panoramica

Implementare un sistema completo per gestire i costi della manodopera negli ordini, distinguendo tra:
- **Dipendenti Interni**: Operai dell'azienda con stipendio fisso, tracciamento ore per ordine
- **Squadre Esterne**: Fornitori di manodopera con gestione anagrafica e storico pagamenti

Il sistema calcolerà automaticamente il costo manodopera per ordine e lo integrerà nel Conto Economico per il calcolo del margine lordo.

---

## 1. Nuove Tabelle Database

### 1.1 Tabella `employees` (Dipendenti Interni)

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | uuid | Chiave primaria |
| `company_id` | uuid | FK a companies |
| `first_name` | text | Nome |
| `last_name` | text | Cognome |
| `email` | text | Email (opzionale) |
| `phone` | text | Telefono (opzionale) |
| `gross_salary` | numeric | Stipendio lordo mensile |
| `net_salary` | numeric | Stipendio netto mensile |
| `monthly_hours` | integer | Ore lavorative mensili (default 160) |
| `hourly_cost` | numeric | Costo orario calcolato (gross_salary / monthly_hours) |
| `is_active` | boolean | Attivo/Inattivo |
| `created_at` | timestamp | Data creazione |
| `updated_at` | timestamp | Data aggiornamento |

### 1.2 Tabella `external_teams` (Squadre Esterne)

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | uuid | Chiave primaria |
| `company_id` | uuid | FK a companies |
| `name` | text | Nome ditta/squadra |
| `contact_name` | text | Nome referente (opzionale) |
| `phone` | text | Telefono |
| `email` | text | Email (opzionale) |
| `notes` | text | Note |
| `is_active` | boolean | Attiva/Inattiva |
| `created_at` | timestamp | Data creazione |

### 1.3 Tabella `order_employees` (Assegnazione Dipendenti agli Ordini)

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | uuid | Chiave primaria |
| `order_id` | uuid | FK a orders |
| `employee_id` | uuid | FK a employees |
| `hours_worked` | numeric | Ore lavorate su questo ordine |
| `hourly_rate` | numeric | Tariffa oraria al momento dell'assegnazione |
| `total_cost` | numeric | Costo totale (hours_worked x hourly_rate) |
| `notes` | text | Note |
| `created_at` | timestamp | Data creazione |

### 1.4 Tabella `order_external_teams` (Squadre Esterne per Ordine)

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | uuid | Chiave primaria |
| `order_id` | uuid | FK a orders |
| `external_team_id` | uuid | FK a external_teams |
| `total_cost` | numeric | Costo totale manodopera |
| `payment_date` | date | Data pagamento prevista |
| `is_paid` | boolean | Pagato/Non pagato |
| `paid_date` | date | Data pagamento effettivo |
| `notes` | text | Note |
| `created_at` | timestamp | Data creazione |

---

## 2. Pagina Dipendenti

### 2.1 Nuova Route

Aggiungere `/azienda/dipendenti` al routing con una nuova pagina `Employees.tsx`.

### 2.2 Layout Pagina

```text
+----------------------------------------------------------+
| Gestione Personale                                        |
| Dipendenti interni e squadre esterne                      |
+----------------------------------------------------------+
| [Dipendenti Interni] [Squadre Esterne]                   |
+----------------------------------------------------------+
|                                                           |
| Tab Dipendenti:                                           |
| +-------------------------------------------------------+ |
| | Nome        | Stipendio L. | Stipendio N. | Ore/Mese | |
| |-------------|--------------|--------------|----------| |
| | M. Rossi    | € 2.500      | € 1.850      | 160h     | |
| | G. Verdi    | € 2.200      | € 1.650      | 160h     | |
| +-------------------------------------------------------+ |
|                                                           |
| [+ Nuovo Dipendente]                                      |
+----------------------------------------------------------+
```

### 2.3 Funzionalità

**Dipendenti Interni:**
- CRUD completo (crea, visualizza, modifica, elimina)
- Calcolo automatico costo orario: `Stipendio Lordo / Ore Mensili`
- Visualizzazione storico ordini assegnati
- Soft-delete (is_active = false) per mantenere storico

**Squadre Esterne:**
- Anagrafica base (nome, contatto, telefono, email)
- Storico ordini e pagamenti
- Riepilogo totale pagato/da pagare

---

## 3. Sezione Manodopera negli Ordini

### 3.1 Nuovo Componente `OrderLaborCosts.tsx`

Aggiungere nella pagina dettaglio/modifica ordine una nuova card "Manodopera":

```text
+----------------------------------------------------------+
| 👷 Manodopera                                             |
+----------------------------------------------------------+
| [Dipendenti Interni] [Squadre Esterne]                   |
+----------------------------------------------------------+
|                                                           |
| DIPENDENTI ASSEGNATI:                                     |
| +-------------------------------------------------------+ |
| | Mario Rossi    | 24 ore | € 37,50/h | € 900,00  | [X] | |
| | Giuseppe Verdi | 16 ore | € 34,38/h | € 550,00  | [X] | |
| +-------------------------------------------------------+ |
| Totale Dipendenti: € 1.450,00                            |
|                                                           |
| [+ Assegna Dipendente]                                   |
+----------------------------------------------------------+
|                                                           |
| SQUADRE ESTERNE:                                          |
| +-------------------------------------------------------+ |
| | ABC Installazioni | € 2.500 | 15/02/2026 | ⏳ Non pag.| |
| +-------------------------------------------------------+ |
| Totale Squadre: € 2.500,00                               |
|                                                           |
| [+ Aggiungi Squadra]                                     |
+----------------------------------------------------------+
|                                                           |
| TOTALE MANODOPERA: € 3.950,00                            |
+----------------------------------------------------------+
```

### 3.2 Dialog Assegnazione Dipendente

```text
+----------------------------------------+
| Assegna Dipendente                      |
+----------------------------------------+
| Dipendente:  [Mario Rossi v]            |
| Ore Lavorate: [24]                      |
| Costo Orario: € 37,50 (calcolato)       |
| Totale: € 900,00                        |
| Note: [________________]                |
|                                         |
|            [Annulla]  [Assegna]         |
+----------------------------------------+
```

### 3.3 Dialog Squadra Esterna

```text
+----------------------------------------+
| Aggiungi Squadra Esterna                |
+----------------------------------------+
| Squadra: [ABC Installazioni v] [+]      |
| Costo Totale: [€ 2500]                  |
| Data Pagamento Prevista: [📅 15/02]     |
| Note: [________________]                |
|                                         |
|            [Annulla]  [Aggiungi]        |
+----------------------------------------+
```

---

## 4. Integrazione nel Conto Economico

### 4.1 Estensione `OrderEconomics.tsx`

Aggiungere sezione costi manodopera tra "COSTI ARTICOLI" e "MARGINE":

```text
+----------------------------------------------------------+
| Conto Economico                                           |
+----------------------------------------------------------+
| VENDITA                                                   |
| Imponibile:              € 15.000,00                      |
| IVA (22%):               €  3.300,00                      |
| Totale con IVA:          € 18.300,00                      |
+----------------------------------------------------------+
| COSTI ARTICOLI                                            |
| Infissi PVC:             €  4.500,00                      |
| Accessori:               €    350,00                      |
| Totale Articoli:         €  4.850,00                      |
+----------------------------------------------------------+
| COSTI MANODOPERA                           <- NUOVO       |
| Dipendenti Interni:      €  1.450,00                      |
| Squadre Esterne:         €  2.500,00                      |
| Totale Manodopera:       €  3.950,00                      |
+----------------------------------------------------------+
| MARGINE                                                   |
| Margine Lordo:           €  6.200,00  (↑ verde)          |
| Margine %:               41.3%                            |
+----------------------------------------------------------+
```

### 4.2 Nuova Formula Margine

```
Margine Lordo = Imponibile - Costi Articoli - Costi Manodopera
             = 15.000 - 4.850 - 3.950 = 6.200
```

---

## 5. Menu Laterale

Aggiungere voce "Dipendenti" nel menu laterale dell'azienda:

```text
📊 Dashboard
📦 Ordini
👥 Clienti
📅 Calendario
📦 Magazzino
💵 Cash Flow
👷 Dipendenti   <- NUOVO
🎫 Ticket
⚙️ Impostazioni
```

---

## 6. File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `migrations/xxx_create_employees_tables.sql` | Creare | Schema database |
| `src/pages/azienda/Employees.tsx` | Creare | Pagina gestione personale |
| `src/components/orders/OrderLaborCosts.tsx` | Creare | Card manodopera negli ordini |
| `src/components/employees/EmployeeDialog.tsx` | Creare | Dialog crea/modifica dipendente |
| `src/components/employees/ExternalTeamDialog.tsx` | Creare | Dialog squadra esterna |
| `src/components/employees/AssignEmployeeDialog.tsx` | Creare | Dialog assegnazione a ordine |
| `src/components/orders/OrderEconomics.tsx` | Modificare | Aggiungere costi manodopera |
| `src/pages/azienda/OrderDetail.tsx` | Modificare | Integrare OrderLaborCosts |
| `src/pages/azienda/EditOrder.tsx` | Modificare | Integrare OrderLaborCosts |
| `src/components/layouts/CompanyLayout.tsx` | Modificare | Aggiungere link menu |
| `src/App.tsx` | Modificare | Aggiungere route /azienda/dipendenti |

---

## 7. Policy RLS

```sql
-- Employees: solo l'azienda può vedere/gestire i propri dipendenti
CREATE POLICY "Company admins can manage their employees"
ON employees FOR ALL
USING (
  has_role(auth.uid(), 'company_admin') AND 
  company_id = get_user_company_id(auth.uid())
);

-- External Teams: stessa logica
CREATE POLICY "Company admins can manage their external teams"
ON external_teams FOR ALL
USING (
  has_role(auth.uid(), 'company_admin') AND 
  company_id = get_user_company_id(auth.uid())
);

-- Order Employees/External Teams: accesso tramite ordini della propria azienda
CREATE POLICY "Company admins can manage order employees"
ON order_employees FOR ALL
USING (
  has_role(auth.uid(), 'company_admin') AND 
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = order_employees.order_id 
    AND o.company_id = get_user_company_id(auth.uid())
  )
);
```

---

## 8. Riepilogo Benefici

1. **Tracciamento Costi Completo**: Articoli + Manodopera per margine reale
2. **Flessibilità**: Dipendenti fissi o squadre esterne per ordine
3. **Calcolo Automatico**: Costo orario da stipendio, totale da ore lavorate
4. **Storico Pagamenti**: Tracciamento pagamenti squadre esterne
5. **Reportistica**: Dati per analisi costi manodopera per ordine/periodo
