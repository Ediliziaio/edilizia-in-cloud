

# FIX 12: AgentToolsTab — Migliorare persistenza toggle

## Stato attuale

La persistenza **esiste già**: il componente legge `tools_config` da `ai_agents` al mount e chiama `saveConfig` ad ogni toggle. Anche la colonna `tools_config jsonb` esiste già in DB. Nessuna migration necessaria.

## Problemi da risolvere

1. **Nessun debounce** — ogni toggle genera una chiamata DB immediata
2. **Nessun indicatore di salvataggio** — l'utente non sa se il salvataggio è andato a buon fine
3. **Strumenti EdiliziaInCloud non toggleabili** — sono statici senza Switch, non persistiti
4. **Nessun feedback di successo** — solo toast di errore, mai conferma visiva

## Piano di modifica

### File: `src/modules/ai-agents/components/AgentToolsTab.tsx`

**Debounce 500ms**: aggiungere `useRef` per timer debounce. I toggle system/edilizia usano `debouncedSave`, mentre add/remove custom tool salvano immediatamente.

**Stato `ediliziaEnabled`**: nuovo state `Record<string, boolean>` per i tool nativi EdiliziaInCloud (default tutti `true`). Persistito in `tools_config.edilizia_tools`.

**Indicatore salvataggio**: stato `saveStatus` (`idle` | `saving` | `saved`). Mostra spinner `Loader2` durante il save, checkmark `Check` per 2 secondi dopo il successo. Posizionato nell'header accanto al bottone "Aggiungi strumento".

**Switch sugli strumenti EdiliziaInCloud**: aggiungere `<Switch>` accanto al badge "Nativo" per ogni tool EdiliziaInCloud, collegato a `toggleEdiliziaTool`.

**Load config aggiornato**: leggere anche `edilizia_tools` dal config salvato e fare merge con i default.

**Cleanup timer**: `useEffect` con cleanup per debounce e saved timer su unmount.

Nessun altro file da modificare.

