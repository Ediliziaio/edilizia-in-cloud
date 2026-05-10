# MP-XXX-NN — [Titolo conciso]

## 🎯 Obiettivo
[Una frase che descrive cosa deve essere realizzato.]

## 📦 Context
- **Repo**: `github.com/Ediliziaio/edilizia-in-cloud`
- **Branch**: crea `feat/mp-xxx-nn-slug` da `main`
- **Stack**: React 18 + TypeScript + Vite + Supabase + Tailwind + shadcn/ui + Capacitor
- **Dipendenze MP**: [es. richiede MP-AIE-02 completato]
- **Skill da consultare prima**:
  - `/mnt/skills/user/stabilization-edilizia-in-cloud/SKILL.md`

## 🔍 Analisi Preliminare (obbligatoria)
Prima di scrivere codice, esegui:
1. `git log --oneline -20` su area target
2. `find` + `grep` per individuare file da modificare
3. Verifica che le tabelle DB esistano (con `supabase migration list`)
4. Leggi i file chiave esistenti per capire pattern in uso

## 📐 Architettura Target
[Diagramma o descrizione del sistema dopo la modifica.]

## 🛠️ Implementazione step-by-step

### Step 1 — [titolo]
File: `[percorso/file.ts]`
Operazione: [crea | modifica | elimina]

[Codice da scrivere o snippet di esempio]

### Step 2 — [titolo]
[...]

## ✅ Acceptance Criteria
- [ ] TypeScript: 0 errori (`bun x tsc --noEmit`)
- [ ] Build: 0 errori (`bun run build`)
- [ ] Test: [test specifici da scrivere]
- [ ] DB: [migrazioni create + applicate localmente]
- [ ] RLS: [policy rispettate, regola d'oro EiC]
- [ ] Lingua: tutti i testi UI in italiano (`it-IT`)
- [ ] Loading states: skeleton per ogni async operation
- [ ] Error handling: try/catch + toast user-friendly
- [ ] Mobile: layout funziona su 375px
- [ ] Zero `any`: tipizzazione TS stretta

## 🔒 Vincoli Non Negoziabili (regole d'oro EiC)
1. **NO `any`** in TypeScript
2. **RLS obbligatoria** su ogni tabella nuova
3. **Tenant isolation**: `company_id` su ogni query
4. **Italian UX**: tutti i testi in italiano corretto
5. **Skeleton loaders**: mai spinner generici
6. **`it-IT` locale**: per date/numeri/valute
7. **Audit log**: ogni operazione critica loggata
8. **Idempotenza**: ogni edge function deve essere idempotente

## 🚦 Verifica autonoma (Claude Code esegue)
Al termine, esegui:
```bash
bun x tsc --noEmit
bun run build
bun run lint
```
Se uno fallisce, correggi prima di chiudere.

## 📝 Output atteso
1. Branch `feat/mp-xxx-nn-slug` con commit puliti (1 commit per step)
2. PR title: "feat(MP-XXX-NN): [titolo]"
3. PR description: lista cose fatte + screenshot UI se applicabile
4. Update `masterprompts/README.md` con stato MP

## 🔗 Risorse
- [Link a documenti rilevanti]
- [Link a issue GitHub se esistono]
