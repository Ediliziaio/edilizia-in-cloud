# Accessibility — Principi & Checklist

Stack: React 18 + Radix UI + shadcn + Tailwind. La maggior parte degli
elementi Radix gestisce a11y nativamente, ma serve disciplina nei custom.

## Quick-wins prioritari (baseline maggio 2026)

Lo script `scripts/check-a11y-quickwins.mjs` rilascia una baseline da non
peggiorare:

| Categoria | Soglia attuale | Obiettivo |
|---|---:|---:|
| Bottoni icon-only senza `aria-label` | 626 | scendere di 50/sprint |
| Testo low-contrast (slate/gray 300/400) | 417 | scendere di 50/sprint |

Decrementare le soglie in `check-a11y-quickwins.mjs` ad ogni sprint di
pulizia.

## Pattern obbligatori per nuovi componenti

### 1. Bottoni icona-only

```tsx
// ❌
<Button variant="ghost" size="icon" onClick={onEdit}>
  <Pencil className="h-4 w-4" />
</Button>

// ✅
<Button variant="ghost" size="icon" onClick={onEdit} aria-label="Modifica documento">
  <Pencil className="h-4 w-4" />
</Button>
```

Se l'aria-label è dinamica, costruirla con `aria-label={\`Modifica \${doc.name}\`}`.

### 2. Contrasto colore (WCAG AA = 4.5:1)

```tsx
// ❌ slate-400 su bg-white = 3.2:1 (fail AA)
<span className="text-slate-400">Bozza</span>

// ✅ slate-600 = 4.6:1 (pass AA)
<span className="text-slate-600 dark:text-slate-300">Bozza</span>
```

Tool di verifica: <https://webaim.org/resources/contrastchecker/>.

### 3. Form fields

```tsx
<Label htmlFor="piva">Partita IVA</Label>
<Input
  id="piva"
  value={piva}
  onChange={(e) => setPiva(e.target.value)}
  aria-invalid={!!pivaError}
  aria-describedby={pivaError ? "piva-error" : undefined}
/>
{pivaError && (
  <p id="piva-error" role="alert" className="text-red-600 text-sm mt-1">
    {pivaError}
  </p>
)}
```

### 4. Loading states con aria-live

```tsx
<div role="status" aria-live="polite" aria-busy={isLoading}>
  {isLoading && (
    <>
      <Spinner />
      <span className="sr-only">Caricamento dati in corso</span>
    </>
  )}
  {!isLoading && data && /* contenuto */}
</div>
```

### 5. Modali

Usare sempre `<Dialog>` / `<AlertDialog>` di shadcn/Radix — gestiscono
focus trap e Escape nativamente. Evitare `<div fixed inset-0>` custom.

## Cose già automatizzate

- `scripts/check-a11y-quickwins.mjs` — baseline guard
- ESLint `jsx-a11y/*` (eslint.config.js) — alcuni warning attivi

## Cosa NON è automatizzato (richiede audit umano)

- Tab navigation order
- Screen reader announcements coerenti
- Skip-links + landmark ARIA
- Lighthouse a11y score per pagina (richiede dev server attivo)
