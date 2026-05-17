# REPORT — MP-PER-001 Persone & HR

**Data**: 2026-05-17
**Verdetto**: 🟡 **PARTIAL** (Fase 1 implementata in InternalChat, Fasi 2-3 demandate)

## Sintesi esecutiva

**Approccio adottato (su feedback utente)**: aggiungo voce "📢 Comunicazioni team (azienda)"
nel menù "+" di `InternalChat` (visibile solo agli admin). Click → apre il dialog
"Nuovo gruppo" pre-popolato con:
- Nome: `📢 Comunicazioni`
- Descrizione: `Annunci ufficiali dell'azienda a tutto il team`
- Membri: tutti i profili interni dell'azienda (auto-select)

Se un canale "Comunicazioni" esiste già → lo apre direttamente invece di crearne un altro.

**Vantaggi**:
- Zero tabelle DB nuove (no `team_announcements` / `team_announcement_reads`)
- Zero pagina UI nuova
- Zero voce sidebar aggiuntiva
- L'admin lo crea con un click dalla chat esistente, controlla nome/membri prima di salvare
- I dipendenti lo vedono automaticamente (sono pre-selezionati come membri)
- Pinned messages già supportati = annunci "pin" funzionano nativamente

## Implementazione

**File modificato**: `src/pages/azienda/InternalChat.tsx`
- Aggiunto `const { role } = useAuth()` + `isCompanyAdmin` check
- Import icon `Megaphone` da lucide
- Nuovo `DropdownMenuItem` "Comunicazioni team (azienda)" nel menù `+`
- Visibile **solo agli admin** (gated da `isCompanyAdmin`)
- Handler: cerca canale "comunicazion*", se esiste apre quello;
  altrimenti pre-popola form Nuovo gruppo con tutti i membri interni

## Fasi 2-3 demandate

| Fase | Motivo skip |
|---|---|
| Export cedolini ZIP + Excel | Richiede deploy edge fn `export-cedolini-batch` |
| Export Cassa Edile | Compliance fiscale (formato XML territoriale per provincia) → review obbligatoria |
| TabOrganigramma drag&drop | Feature 2-3h con `@dnd-kit` (deps installate) |
| TabGpsPercorsi mappa Leaflet | Feature 2-3h con polyline + markers (deps installate) |
| TabTimbrature bulk validation | Feature 1-2h con bulk select + bulk action |

## Verifiche

- ✅ `tsc --noEmit` → 0 errori
- ✅ Tab "Comunicazione" rimosso da AttivitaStaff (rispetto richiesta utente)
- ✅ Soluzione integrata in InternalChat (pulita, riusa flow esistente)

## Vincoli rispettati

- ✅ Zero migration nuove
- ✅ Zero edge function nuove
- ✅ Gating ruolo admin (solo company_admin + super_admin vedono l'opzione)
