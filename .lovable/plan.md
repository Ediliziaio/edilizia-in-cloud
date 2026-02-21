
# Ristrutturazione Sidebar: Macrocategorie Collassabili

## Obiettivo
Trasformare la sidebar principale dell'area Azienda introducendo due macrocategorie espandibili/collassabili:
- **Gestione Interna** (tutte le voci attuali, invariate)
- **Marketing e Vendita** (nuova sezione con pagine placeholder)

## Approccio
Modifiche minime e isolate: la configurazione delle due macrocategorie viene definita in un file dedicato, le pagine "Marketing e Vendita" sono semplici placeholder pronti per essere sviluppati in futuro.

---

## Dettaglio tecnico

### 1. Nuovo file di configurazione: `src/lib/sidebarConfig.ts`

File dedicato che esporta due array separati di `NavItem`:
- `internalNavItems` -- contiene esattamente gli stessi 12 item attuali (copiati da `allNavItems`), nessuna modifica a route/permessi/icone
- `marketingNavItems` -- contiene le 6 nuove voci:

| Voce | Route | Icona |
|------|-------|-------|
| Dashboard | `/azienda/marketing` | LayoutDashboard |
| Contatti | `/azienda/marketing/contatti` | Contact |
| Opportunita | `/azienda/marketing/opportunita` | Target |
| Calendario | `/azienda/marketing/calendario` | CalendarDays |
| Automazioni | `/azienda/marketing/automazioni` | Zap |
| Agente AI | `/azienda/marketing/agente-ai` | Bot |

Ogni item ha un campo `category: "internal" | "marketing"` per separare le due macrocategorie a livello di dati.

### 2. Modifica sidebar: `src/components/layouts/CompanyLayout.tsx`

Nel ramo non-settings della `CompanySidebar`:
- Rimuovere il SidebarGroup unico "Menu"
- Sostituirlo con due blocchi `Collapsible` (gia disponibile in `src/components/ui/collapsible.tsx`):
  - **Gestione Interna**: `CollapsibleTrigger` con icona `ChevronDown` che ruota, dentro `CollapsibleContent` il `SidebarMenu` con `internalNavItems` filtrati (stessa logica permessi/moduli attuale)
  - **Marketing e Vendita**: stesso pattern con `marketingNavItems` filtrati
- Entrambe le sezioni hanno `defaultOpen` basato sulla rotta corrente (se la rotta inizia con `/azienda/marketing` apre Marketing, altrimenti apre Gestione Interna)
- Il resto della sidebar (logo, footer con avatar/logout, impostazioni, settings route) resta identico
- L'array `allNavItems` viene rimosso dal file e spostato in `sidebarConfig.ts`

### 3. Nuove pagine placeholder: 6 file in `src/pages/azienda/marketing/`

Ciascuna pagina e un componente minimale con titolo e messaggio "In arrivo":
- `MarketingDashboard.tsx`
- `MarketingContacts.tsx`
- `MarketingOpportunities.tsx`
- `MarketingCalendar.tsx`
- `MarketingAutomations.tsx`
- `MarketingAiAgent.tsx`

### 4. Routing: `src/App.tsx`

Aggiungere le 6 route sotto `/azienda`:
```
<Route path="marketing" element={<MarketingDashboard />} />
<Route path="marketing/contatti" element={<MarketingContacts />} />
<Route path="marketing/opportunita" element={<MarketingOpportunities />} />
<Route path="marketing/calendario" element={<MarketingCalendar />} />
<Route path="marketing/automazioni" element={<MarketingAutomations />} />
<Route path="marketing/agente-ai" element={<MarketingAiAgent />} />
```

Tutte dentro il blocco `<Route path="/azienda">` esistente, protette dagli stessi ruoli (`company_admin`, `company_staff`, `super_admin`).

---

## File coinvolti

| File | Azione |
|------|--------|
| `src/lib/sidebarConfig.ts` | Nuovo - config separata per le due macrocategorie |
| `src/components/layouts/CompanyLayout.tsx` | Modifica - due Collapsible al posto del SidebarGroup unico |
| `src/App.tsx` | Modifica - aggiunta 6 route marketing |
| `src/pages/azienda/marketing/MarketingDashboard.tsx` | Nuovo - placeholder |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Nuovo - placeholder |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Nuovo - placeholder |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Nuovo - placeholder |
| `src/pages/azienda/marketing/MarketingAutomations.tsx` | Nuovo - placeholder |
| `src/pages/azienda/marketing/MarketingAiAgent.tsx` | Nuovo - placeholder |

## Cosa NON cambia
- Nessuna modifica a route, permessi, logica o componenti delle sezioni "Gestione Interna"
- Nessuna modifica alla sidebar settings (gia dinamica)
- Nessuna modifica al sistema di permessi o al database
- Nessuna modifica ai layout o alle pagine esistenti
