

# Full-Screen Automation Builder (stile GHL) + Fix Stabilita

## Obiettivo
Quando l'utente apre il builder di automazione (`/nuova` o `/:id`), la pagina deve essere full-screen senza sidebar, header o padding -- esattamente come GoHighLevel. Il bottone "indietro" nel builder stesso riporta alla lista.

## Approccio tecnico

### 1. Spostare le route del builder FUORI dal CompanyLayout
File: `src/App.tsx`

Le route `marketing/automazioni/nuova` e `marketing/automazioni/:id` sono attualmente annidate dentro `<CompanyLayout>`, che aggiunge sidebar, header, padding, banner di impersonificazione ecc.

**Intervento**: spostare queste due route come route indipendenti allo stesso livello di `CompanyLayout`, protette dallo stesso `ProtectedRoute` ma senza il layout wrapper:

```
<Route element={<ProtectedRoute .../>}>
  {/* Full-screen builder routes - FUORI dal CompanyLayout */}
  <Route path="azienda/marketing/automazioni/nuova" element={<MarketingAutomationBuilder />} />
  <Route path="azienda/marketing/automazioni/:id" element={<MarketingAutomationBuilder />} />
  
  {/* CompanyLayout con sidebar per tutto il resto */}
  <Route path="azienda" element={<CompanyLayout />}>
    ...tutte le altre route...
  </Route>
</Route>
```

**Risultato**: il builder si renderizza a schermo intero (100vw x 100vh), senza sidebar, senza header, senza padding. Tutta la navigazione e gestita internamente dal componente `AutomationBuilder` (che ha gia il suo header con bottone "indietro alla lista").

### 2. Assicurare che AutomationBuilder gestisca il proprio layout full-screen
File: `src/components/marketing/automations/AutomationBuilder.tsx`

Il componente ha gia un proprio header con:
- Bottone indietro (navigate alla lista)
- Nome del flow editabile
- Bottoni Salva/Bozza/Archivia
- Tabs (Builder/Impostazioni/etc.)

Serve solo assicurarsi che il container root occupi `h-screen w-screen` invece di dipendere dal layout padre. Aggiungere le classi appropriate al div radice del builder.

### 3. Nessuna modifica al CompanyLayout
Il `CompanyLayout` resta invariato. Semplicemente le due route del builder non passano piu attraverso di esso.

## Vantaggi
- Il builder ha tutto lo spazio disponibile (come GHL)
- Nessuna sidebar che toglie spazio al canvas
- Nessun header duplicato
- La navigazione "Torna alla lista" e gia integrata nel builder
- Zero regressioni sulle altre pagine
- Il banner di impersonificazione puo essere integrato minimalmente nel builder se necessario

## File modificati
1. `src/App.tsx` -- spostamento route
2. `src/components/marketing/automations/AutomationBuilder.tsx` -- classi full-screen sul container root
3. `src/pages/azienda/marketing/MarketingAutomationBuilder.tsx` -- eventuale wrapper minimo per layout standalone

