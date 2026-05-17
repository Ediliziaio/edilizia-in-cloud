# Archive — storico non attivo

Codice/file conservati per riferimento storico, non più collegati al flow attivo.

## `masterprompt-history/`

Tracce dei masterprompt-driven sprint passati:
- `.mp01/`, `.mp02/`, `.mp03/`, `.mp04/`, `.mp05/` — primi 5 MP del progetto
- `.mp-gap/` — gap analysis pre-MP-CG

## `legacy/`

- `.lovable/` — config storica Lovable (preview iterations); non più referenziata
  dal build attuale (Cloudflare Pages standalone)

## Note

- Il codice qui presente **non è più importato** da nessuna parte del progetto
  (verificato `grep -rn` su `src/`, `supabase/`, `scripts/`)
- Mantenuto per audit/storico — se serve eliminarlo definitivamente, è sicuro
  fare `rm -rf archive/`
- `src/pages/_deprecated/dipendente/` (vecchio portale dipendente) è stato
  invece **eliminato** in questo commit perché le route sono coperte da redirect
  in `companyRoutes.tsx` verso `/campo/*`
