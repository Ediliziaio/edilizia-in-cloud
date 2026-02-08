

# Piano: Verifica Sistema Venditore e Pulizia Codice

## Stato Attuale (Verificato)

La pagina "I Miei Ordini" **è già presente nella navigazione** del venditore:

| Elemento | Stato | Posizione |
|----------|-------|-----------|
| Link "I Miei Ordini" | Presente | SalespersonLayout.tsx, linea 9 |
| Rotta `/venditore/ordini` | Configurata | App.tsx, linea 178 |
| Pagina MyOrders.tsx | Implementata | Completa con tabella ordini |
| Redirect venditore | Attivo | RoleBasedRedirect, linea 89-90 |

---

## Miglioramenti Proposti

### 1. Miglioramento Active State Navigation

Attualmente il check di active state è basato su uguaglianza esatta (`location.pathname === item.href`). 
Migliorare per gestire anche sottopagine future.

```typescript
// Da:
const isActive = location.pathname === item.href;

// A:
const isActive = item.href === "/venditore" 
  ? location.pathname === item.href 
  : location.pathname.startsWith(item.href);
```

### 2. Aggiunta Hover States su Mobile

Nella navigazione mobile manca l'hover state per feedback visivo.

```typescript
// Aggiungere:
"hover:bg-accent hover:text-accent-foreground"
```

### 3. Pulizia Import Inutilizzati

Verificare e rimuovere import non utilizzati nei file del venditore.

---

## File da Modificare

| File | Modifica |
|------|----------|
| `src/components/layouts/SalespersonLayout.tsx` | Migliorare active state e hover mobile |

---

## Verifica Funzionale

Test da eseguire:

1. Login come venditore -> Verifica redirect a `/venditore`
2. Click su "I Miei Ordini" -> Verifica caricamento pagina
3. Verifica highlight corretto nella navbar
4. Test su mobile per scrollabilita navigazione

---

## Output Atteso

- Active state piu robusto per navigazione
- Feedback hover consistente tra desktop e mobile
- Console pulita senza errori

---

## Nota

La funzionalita richiesta (pagina "I Miei Ordini" nella sidebar venditore) **e gia implementata e funzionante**. 
Questo piano si concentra solo su piccoli miglioramenti UX per rendere l'esperienza piu fluida.

