

## ATT-01 · Attività Unificata — Piano di Implementazione

### Scoperta Schema

Le due pagine **già usano la stessa tabella `tasks`**, separandosi solo per filtro `category`:
- `Tasks.tsx` (Cantieri): `.not("category", "in", "(marketing,contatti,opportunita)")`
- `MarketingTasks.tsx` (Marketing): `.in("category", MARKETING_CATEGORIES)`

La tabella `tasks` ha già: `assigned_to`, `contact_id`, `opportunity_id`, `order_id`, `stock_item_id`, `cost_id`, `ticket_id`, `status` (da_fare/in_corso/completata), `priority` (bassa/normale/alta/urgente), `category`, `due_date`. RLS già configurata con policy per company_admin, staff, employees, super_admin.

**Non serve creare una nuova tabella, enums, o migrare dati.** La tabella è già unificata a livello DB.

---

### Cosa fare

#### 1. Nuova pagina unificata `UnifiedTasksPage.tsx`
Creare `src/pages/azienda/UnifiedTasks.tsx` che:
- Rimuove il filtro per category — mostra **tutte** le attività della company
- Unifica le colonne: mostra sia correlazioni Cantieri (ordine, magazzino, costo) che Marketing (contatto, opportunità)
- Aggiunge un filtro "Fonte" (Cantieri / Marketing / Generale) basato su `category`
- Unisce le join di entrambe le query: `profiles`, `orders`, `warehouse_stock`, `company_costs`, `marketing_contacts`, `marketing_opportunities`
- Mantiene TaskStatCards, TaskDialog, BulkActionsBar esistenti
- Aggiunge colonna "Correlazione" che mostra il link all'entità collegata (ordine, contatto, opportunità)

#### 2. Sidebar — `src/lib/sidebarConfig.ts`
- In `macroAreas`: aggiungere "Attività" come **nuovo item nel gruppo `area_cruscotto`** (terzo elemento dopo Cruscotto e Dashboard), con `url: "/azienda/attivita"`, `icon: CheckSquare`
- Rimuovere "Attività" da `area_cantieri` (riga 109)
- Rimuovere "Attività CRM" da `area_marketing` (riga 163)
- Negli array deprecati (`internalNavItems`, `marketingNavItems`): rimuovere le rispettive voci

#### 3. Routing — `src/routes/companyRoutes.tsx`
- La route `/azienda/attivita` già esiste (riga 162) — puntarla a `UnifiedTasks`
- Rimuovere la route `/azienda/marketing/attivita` (riga 200)
- Aggiungere redirect: `<Route path="marketing/attivita" element={<Navigate to="/azienda/attivita?fonte=marketing" replace />} />`

#### 4. Hook `useMyTaskCount.ts`
Creare `src/hooks/useMyTaskCount.ts` — query semplice sulla tabella `tasks` esistente (no RPC necessaria):
- Conta task assegnati all'utente corrente con `status != 'completata'`
- Conta scadute (`due_date < oggi`), in scadenza (prossimi 3 giorni), da fare oggi
- `refetchInterval: 60_000`

#### 5. Badge sidebar
In `CompanyLayout.tsx`, usare `useMyTaskCount` per mostrare un badge numerico sulla voce "Attività":
- Rosso se ci sono task scadute
- Arancio se scadono oggi
- Nessun badge se tutto ok

---

### File modificati/creati
| File | Azione |
|------|--------|
| `src/pages/azienda/UnifiedTasks.tsx` | **Nuovo** — pagina unificata |
| `src/hooks/useMyTaskCount.ts` | **Nuovo** — badge count |
| `src/lib/sidebarConfig.ts` | Sposta "Attività" in area_cruscotto, rimuovi dalle altre aree |
| `src/routes/companyRoutes.tsx` | Punta route a UnifiedTasks, redirect vecchia route marketing |
| `src/components/layouts/CompanyLayout.tsx` | Badge task sulla voce Attività |

### Note
- Nessuna migrazione DB necessaria — la tabella `tasks` è già unificata
- RLS già in posto, nessuna modifica necessaria
- I file `Tasks.tsx` e `MarketingTasks.tsx` rimangono ma non saranno più raggiungibili dalla sidebar (possono essere rimossi in futuro)

