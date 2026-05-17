# STATUS MP-010 — Cleanup README + portale dipendente

## Stato

Completato lato codice su branch `chore/cleanup-readme-dipendente`.

## Checklist

- [x] README riscritto con descrizione progetto AEDIX, stack, test, deploy e struttura.
- [x] `/dipendente/*` deprecato con redirect verso `/campo/*`.
- [x] Redirect ruolo `employee` aggiornato verso `/campo`.
- [x] Pagine storiche `src/pages/dipendente/*` spostate in `src/pages/_deprecated/dipendente/*`.
- [x] `EmployeeLayout` marcato come deprecato e mantenuto per rollback.
- [x] `ARCHITECTURE.md` aggiornato nella sezione routing.
- [x] Type check.
- [x] Test.
- [x] Build.
- [x] Lint mirato sui file modificati.

## Note operative

La comunicazione email massiva agli utenti employee resta un'azione operativa
esterna al codice e non viene eseguita automaticamente da questo branch.
