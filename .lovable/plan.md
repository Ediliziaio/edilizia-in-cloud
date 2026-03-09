

# Sotto-categorie chiuse di default

Modifica minima: cambiare i valori di default in `useSidebarSections.ts` da `true` a `false` per tutte le sotto-categorie. L'auto-espansione sulla route attiva resta attiva, quindi la sezione corrente si aprirà comunque.

### File da modificare

**`src/hooks/useSidebarSections.ts`** — Linee 7-17: tutti i valori in `DEFAULT_STATE` da `true` a `false`.

