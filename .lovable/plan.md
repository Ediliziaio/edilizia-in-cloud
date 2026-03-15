

## Piano: UNIF-AGE-06 — Bug Fix & Pre-Go-Live

Audit completo del codice esistente rispetto al documento. Molti bug segnalati nel documento **non si applicano** alla nostra implementazione. Ecco lo stato reale:

### Bug che NON si applicano (già risolti o non presenti)

| # | Bug | Motivo |
|---|-----|--------|
| 1 | API key EL esposta frontend | Nessuna chiamata diretta a `api.elevenlabs.io` nei file `.tsx` — tutto passa dal proxy |
| 3 | Route AgentDetailPage mancante | Route `agenti-ai/:agentId` esiste in `companyRoutes.tsx` |
| 4 | Tailwind classi dinamiche | `TIPO_CONFIG` usa classi statiche con HSL vars, nessun template literal |
| 6 | KB file sync mancante | `kb-sync` gestisce già il case `file` con download da storage + FormData |
| 7 | `get_current_company_id()` | Usiamo `get_my_company_id()` che esiste già |
| 10 | Tab statistiche mancante | Già presente nell'array TABS |

### Bug REALI da correggere (5 fix)

| # | Bug | Priorità | File |
|---|-----|----------|------|
| 5 | Blob URL audio non revocato — memory leak | P1 | `ConversazioniTab.tsx` |
| 8 | HMAC `!==` vulnerabile a timing attack | P2 | `elevenlabs-webhook/index.ts` |
| 9 | Double-click toggle AgentCard | P2 | `AgentCardUnified.tsx` |
| 2 | `ai_elevenlabs_config` — creare view sicura | P1 | SQL migration |
| 11 | CreditiTab — transazioni senza paginazione | P3 | `CreditiTab.tsx` |

### Implementazione

#### 1. SQL Migration
- Creare view `ai_elevenlabs_config_safe` che maschera `api_key_encrypted` (mostra solo ultimi 4 char)
- Verificare/aggiungere RLS su `ai_elevenlabs_config` se mancante
- Aggiungere indici mancanti per performance (se non esistono)

#### 2. Edge Function — Webhook HMAC fix
- In `elevenlabs-webhook/index.ts` riga 43: sostituire `signature !== expectedSig` con confronto timing-safe usando `crypto.subtle` (Deno non ha `crypto.timingSafeEqual` nativo, ma possiamo fare un confronto costante-tempo con loop XOR)

#### 3. Frontend fixes

| File | Fix |
|---|---|
| `ConversazioniTab.tsx` | Aggiungere cleanup `URL.revokeObjectURL()` in un `useEffect` return per `audioSrc` nel componente `ConversazioneDetail` |
| `AgentCardUnified.tsx` | Il toggle play/pause passa `onToggleStatus` dal parent — aggiungere `disabled` prop e usare `isPending` dal mutation nel parent `AgentiTab.tsx` |
| `CreditiTab.tsx` | Le transazioni usano già la tabella completa senza `slice(0,20)` — questo bug non si applica. Verifico comunque che non ci sia un limite hardcoded |

#### 4. Miglioramenti performance (P3)
- Aggiungere `useMemo` per la lista filtrata in `AgentiTab.tsx`

### File da modificare

| File | Azione |
|---|---|
| SQL migration | View sicura `ai_elevenlabs_config_safe` + RLS check |
| `supabase/functions/elevenlabs-webhook/index.ts` | Timing-safe HMAC comparison |
| `src/components/agenti/ConversazioniTab.tsx` | Blob URL cleanup |
| `src/components/agenti/AgentCardUnified.tsx` | Disable toggle durante mutation |
| `src/components/agenti/AgentiTab.tsx` | Pass `isPending` + `useMemo` filtri |

