
# Audit Completo - Pulizia e Stabilizzazione

## 1. File UI non utilizzati da rimuovere

15 componenti UI che non sono mai importati da nessun file del progetto:

| File | Motivo rimozione |
|------|-----------------|
| `src/components/ui/aspect-ratio.tsx` | Mai importato |
| `src/components/ui/hover-card.tsx` | Mai importato |
| `src/components/ui/menubar.tsx` | Mai importato |
| `src/components/ui/navigation-menu.tsx` | Mai importato |
| `src/components/ui/context-menu.tsx` | Mai importato |
| `src/components/ui/input-otp.tsx` | Mai importato |
| `src/components/ui/carousel.tsx` | Mai importato |
| `src/components/ui/radio-group.tsx` | Mai importato |
| `src/components/ui/slider.tsx` | Mai importato |
| `src/components/ui/resizable.tsx` | Mai importato |
| `src/components/ui/drawer.tsx` | Mai importato |
| `src/components/ui/breadcrumb.tsx` | Mai importato |
| `src/components/ui/pagination.tsx` | Mai importato |
| `src/components/ui/accordion.tsx` | Mai importato |
| `src/components/ui/chart.tsx` | Mai importato |

## 2. Fix inconsistenza toast

Il progetto usa **due sistemi toast in parallelo**:
- `@/hooks/use-toast` (Radix-based) -- usato da 46 file
- `sonner` -- usato da 9 file

Entrambi i Toaster sono montati in `App.tsx`. Funziona, ma e ridondante.

**Azione**: Non migrare tutti i 46 file (troppo invasivo, rischio di regressioni). Pero correggere l'unico file che importa dal percorso sbagliato:

- `src/components/settings/SuppliersConfig.tsx`: importa `toast` da `@/components/ui/use-toast` invece che da `@/hooks/use-toast`. Allineare all'import standard.

## 3. Nessun altro problema trovato

Verifiche completate:

| Check | Risultato |
|-------|-----------|
| Hook custom (7 file) | Tutti utilizzati |
| Lib utility (9 file) | Tutti utilizzati |
| Componenti business | Tutti referenziati da route o altri componenti |
| NavLink | Usato in 4 layout |
| File orfani | Nessuno trovato |
| Import inutili nei file | Non rilevati (verificati i file principali) |
| Console errors | Nessun errore |
| Test file | `example.test.ts` e placeholder di vitest, non da rimuovere |

## 4. Piano implementazione

### Step 1: Eliminare i 15 file UI inutilizzati

Rimuovere tutti i file elencati nella tabella sopra.

### Step 2: Fix import toast in SuppliersConfig

In `src/components/settings/SuppliersConfig.tsx`, cambiare:
```typescript
import { toast } from "@/components/ui/use-toast";
```
in:
```typescript
import { useToast } from "@/hooks/use-toast";
```
e usare `const { toast } = useToast();` nel componente (come fanno tutti gli altri 45 file).

### Risultato atteso

- 15 file rimossi (codice morto)
- 1 fix coerenza import
- Zero cambiamenti funzionali
- Codebase piu leggero e coerente
