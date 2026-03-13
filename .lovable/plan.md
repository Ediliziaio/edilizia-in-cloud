

## Piano: Pulizia Sidebar — Rimuovi voci ridondanti

### Modifiche

**1. `src/lib/sidebarConfig.ts` (righe 123-126)**
Rimuovere le 3 voci ridondanti dalla macro-area `area_finanza`:
- Riga 124: `Proforma` → rimuovere
- Riga 125: `Note di Credito` → rimuovere  
- Riga 126: `DDT` → rimuovere

Anche nell'array legacy `internalNavItems` (righe 218-219), rimuovere `DDT` e `Preventivi` (che puntano a route ora redirect).

**2. `src/components/layouts/CompanyLayout.tsx` (righe 161-173)**
Aggiornare `isActive` per gestire il caso speciale `/azienda/documenti`: deve risultare attiva anche con query params `?tipo=...`, ma NON quando si è su sottopagine autonome (`/anagrafiche`, `/incassi`, `/cassetto-sdi`, `/report`). La logica "more specific match" attuale già gestisce parzialmente questo, ma dopo la rimozione delle voci Proforma/NC/DDT da `visibleItems`, il match specifico non avviene più — quindi il fallback `startsWith` farà sì che "Fatture" resti attiva correttamente. Serve solo aggiungere la protezione per le sottopagine autonome.

**3. `src/hooks/useBreadcrumb.ts`**
Aggiungere case speciale: quando `pathname === "/azienda/documenti"`, leggere `search` params per determinare il label breadcrumb (es. "Pro forma" per `?tipo=proforma`). Richiede accesso a `useLocation().search`.

**4. `src/routes/companyRoutes.tsx`**
Nessuna modifica — i redirect sono già in place (righe 177, 181-183).

### Riepilogo
- 3 voci rimosse dalla sidebar (`Proforma`, `Note di Credito`, `DDT`)
- `isActive` aggiornata per sottopagine autonome
- Breadcrumb mostra label corretta per ogni tab tipo

