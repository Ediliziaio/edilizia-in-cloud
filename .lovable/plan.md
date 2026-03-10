

# Piano: Ottimizzare la Sidebar SuperAdmin come quella Azienda

## Stato attuale
La sidebar SuperAdmin (`AdminMainSidebar`) mostra tutti gli item in liste piatte sotto due `SidebarGroup` ("Navigazione" e "Marketing & Vendita"), senza sottocategorie collassabili, senza stile voce attiva con bordo sinistro, e senza separatori tratteggiati.

La sidebar Azienda (`CompanyLayout`) invece usa:
- Macro-sezioni collassabili con `Collapsible` (Gestione Interna, Marketing e Vendita)
- Sottocategorie con `SidebarSubcategory` (collassabili, con auto-expand sulla rotta attiva)
- Stile attivo: `bg-primary/10 text-primary font-semibold border-l-2 border-primary`
- Separatori tratteggiati tra items: `divide-y divide-dashed divide-border/40`

## Modifiche

### 1. Definire sottocategorie per la sidebar admin

Raggruppare i 12 item di "Navigazione" in sottocategorie logiche:

| Sottocategoria | ID | Items |
|---|---|---|
| Overview | `sa_overview` | Dashboard |
| Gestione Clienti | `sa_clienti` | Aziende, Assistenza, Lifecycle, CS Onboarding, CS Tasks |
| Piattaforma | `sa_piattaforma` | Piani, Feature Flags, Annunci, Sync Logs, GDPR |
| Programmi | `sa_programmi` | Referral |

Raggruppare i Marketing items:

| Sottocategoria | ID | Items |
|---|---|---|
| CRM | `sa_mkt_crm` | Dashboard, Contatti & Lead, Opportunità, Calendario |
| Comunicazione | `sa_mkt_comunicazione` | Email Marketing, WhatsApp |
| Automazione & AI | `sa_mkt_automation` | Automazioni, Agenti AI |

### 2. Aggiungere config sottocategorie in `AdminLayout.tsx`

Definire array `adminSubcategories` e `adminMarketingSubcategories` con struttura identica a `sidebarConfig.ts`, e aggiungere campo `subcategory` a ogni item in `allNavItems` e `adminMarketingNavItems`.

### 3. Creare hook `useAdminSidebarSections`

Riutilizzare la stessa logica di `useSidebarSections` ma con storage key separata (`admin_sidebar_sections_state`) e la mappa rotte admin. Oppure rendere `useSidebarSections` parametrico.

### 4. Refactoring `AdminMainSidebar`

- Wrappare "Navigazione" in `Collapsible` con icona e chevron (come CompanyLayout)
- Wrappare "Marketing & Vendita" in `Collapsible` con icona e chevron
- Dentro ogni collapsible, usare `SidebarSubcategory` per ogni sottocategoria
- Applicare stile attivo: `activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"`
- Aggiungere `divide-y divide-dashed divide-border/40` al `SidebarMenu`
- Partire con sezioni chiuse, auto-expand sulla rotta attiva

### File da modificare
| File | Cambiamento |
|---|---|
| `src/components/layouts/AdminLayout.tsx` | Refactoring completo di `AdminMainSidebar`: subcategory config, Collapsible, SidebarSubcategory, stile attivo |
| `src/hooks/useSidebarSections.ts` | Rendere parametrico (accettare navItems e storageKey custom) oppure creare hook dedicato inline |

