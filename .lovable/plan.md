

# Piano: Hook useSubscriptionLimits, Banner di Stato e Gestione Funzionalita per Piano

## Panoramica

Creare un sistema che:
1. Permetta al Super Admin di decidere quali moduli/funzionalita sono inclusi in ogni piano
2. Fornisca un hook `useSubscriptionLimits` che controlla limiti numerici e moduli disponibili
3. Mostri banner di avviso nell'area azienda per trial in scadenza, expired e suspended
4. Filtri la sidebar dell'azienda nascondendo i moduli non inclusi nel piano

---

## Step 1: Schema Database

Aggiungere una colonna `included_modules` (jsonb) alla tabella `subscription_plans` per definire quali sezioni dell'app sono accessibili per ogni piano.

Moduli gestibili:
- `orders` (Ordini)
- `warehouse` (Magazzino)
- `calendar` (Calendario)
- `customers` (Clienti)
- `employees` (Dipendenti)
- `tickets` (Assistenza)
- `forecast` (Previsionale)

Di default tutti i moduli sono inclusi nei piani esistenti.

---

## Step 2: UI Admin - Gestione Moduli per Piano

Aggiornare `SubscriptionPlans.tsx`:
- Aggiungere nel dialog di creazione/modifica una sezione "Moduli inclusi" con una griglia di Switch per ogni modulo
- Ogni switch attiva/disattiva un modulo specifico per quel piano
- I moduli vengono salvati come array jsonb (es. `["orders", "warehouse", "calendar"]`)
- Nella card del piano mostrare i moduli inclusi con icone

---

## Step 3: Hook `useSubscriptionLimits`

Nuovo file `src/hooks/useSubscriptionLimits.ts`:

Espone:
- `companyStatus`: stato corrente dell'azienda (trial/active/suspended/expired)
- `trialDaysLeft`: giorni rimanenti di trial (null se non in trial)
- `currentPlan`: dati del piano attivo
- `canCreateOrder`: boolean (controlla max_orders)
- `canAddUser`: boolean (controlla max_users)
- `isModuleEnabled(moduleKey)`: controlla se un modulo e nel piano
- `remainingOrders`: ordini rimanenti (-1 se illimitati)
- `remainingUsers`: utenti rimanenti
- `isFullyOperational`: true solo se status = 'active' o 'trial' non scaduto
- `isLoading`: stato caricamento

Logica: query sul piano dell'azienda (via `effectiveCompany.subscription_plan_id`), count ordini e utenti attuali, confronto con limiti.

Il Super Admin in impersonation bypassa tutti i limiti.

---

## Step 4: Banner di Stato in CompanyLayout

Aggiungere un componente `SubscriptionBanner` sopra il contenuto in `CompanyLayout.tsx`:

| Stato | Colore | Messaggio |
|-------|--------|-----------|
| trial (>3 giorni) | Blu | "Stai usando il piano di prova. Rimangono X giorni." + bottone Upgrade |
| trial (<=3 giorni) | Arancione | "Il tuo periodo di prova scade tra X giorni! Attiva un piano." |
| trial (scaduto) | Rosso | "Il periodo di prova e scaduto. Attiva un piano per continuare." |
| suspended | Arancione | "Il tuo abbonamento e sospeso. Contatta il supporto." |
| expired | Rosso | "Il tuo abbonamento e scaduto. Rinnova per continuare a usare la piattaforma." |
| active | Nessun banner | - |

Il banner non appare quando il Super Admin sta impersonando.

---

## Step 5: Filtro Sidebar per Moduli

Aggiornare `CompanyLayout.tsx` per filtrare le voci di navigazione in base ai moduli inclusi nel piano:

- Mappare ogni nav item a un `moduleKey` (es. "Magazzino" -> `warehouse`)
- Se il modulo non e nel piano, la voce non appare nella sidebar
- Dashboard e Impostazioni sono sempre visibili (non dipendono dal piano)

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| Migrazione SQL | Crea | Aggiungere `included_modules` a `subscription_plans` |
| `src/hooks/useSubscriptionLimits.ts` | Crea | Hook per limiti e stato abbonamento |
| `src/components/layouts/CompanyLayout.tsx` | Modifica | Aggiungere banner + filtro sidebar per moduli |
| `src/pages/admin/SubscriptionPlans.tsx` | Modifica | Aggiungere sezione moduli nel dialog |

---

## Dettagli Tecnici

### Migrazione SQL
```text
ALTER TABLE subscription_plans 
ADD COLUMN included_modules jsonb DEFAULT '["orders","warehouse","calendar","customers","employees","tickets","forecast"]'::jsonb;

UPDATE subscription_plans SET included_modules = '["orders","warehouse","calendar","customers","employees","tickets","forecast"]';
```

### Mapping Moduli -> Nav Items
```text
orders     -> Ordini
warehouse  -> Magazzino
calendar   -> Calendario
customers  -> Clienti
employees  -> Dipendenti
tickets    -> Assistenza
forecast   -> Previsionale
```

### Hook: conteggio ordini e utenti
- Ordini: `SELECT count(*) FROM orders WHERE company_id = X`
- Utenti: `SELECT count(*) FROM profiles WHERE company_id = X`
- Confronto con `max_orders` e `max_users` del piano (-1 = illimitato)

