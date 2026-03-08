

# Fix: Nascondere "Impostazioni Piattaforma" durante impersonazione

## Problema

Quando un Super Admin impersona un'azienda, il tab "Impostazioni" (API Key ElevenLabs, Prezzi & Markup) rimane visibile nella sidebar Agenti AI. Queste sono impostazioni **a livello piattaforma**, non pertinenti al contesto aziendale. Durante l'impersonazione dovrebbe apparire "Il mio piano" come per gli utenti normali.

## Soluzione

Modificare la logica di visibilità in due punti per trattare l'impersonazione come un utente aziendale:

### 1. `AgentSidebar.tsx`
- Importare `isImpersonating` da `useAuth()`
- Condizione sidebar: mostrare "Impostazioni" solo se `isSuperAdmin && !isImpersonating`
- Durante impersonazione, mostrare "Il mio piano" al suo posto

### 2. `index.tsx` (SuperAdminGuard)
- Aggiungere check `isImpersonating` al guard
- Se il super_admin sta impersonando, redirect a `/azienda/marketing/agente-ai` (come per utenti non-admin)

### File da modificare
| File | Modifica |
|------|----------|
| `src/modules/ai-agents/components/AgentSidebar.tsx` | `isSuperAdmin && !isImpersonating` per il tab Impostazioni |
| `src/modules/ai-agents/index.tsx` | `SuperAdminGuard` blocca anche durante impersonazione |

