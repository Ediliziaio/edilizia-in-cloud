

## Piano: Fix Sidebar — Larghezza e Modalita Collapsed

### Problemi identificati (dagli screenshot)

1. **Larghezza sidebar troppo ampia**: attualmente `16rem` (256px). Ridurre a `14rem` (224px).
2. **Logo visibile in modalita collapsed**: il logo header (riga 450-465) non si nasconde quando la sidebar e ridotta a icone, causando un logo tagliato/sovrapposto.
3. **Sezione utente in basso rotta in collapsed**: Avatar, nome, ruolo e bottone "Esci" (righe 821-846) vengono renderizzati sempre a piena larghezza, traboccando nella modalita icon-only.

### Fix

**File: `src/components/ui/sidebar.tsx`**
- Cambiare `SIDEBAR_WIDTH` da `"16rem"` a `"14rem"`

**File: `src/components/layouts/CompanyLayout.tsx`**

1. **Header logo** (righe 450-465): Wrappare il contenuto del logo con un check su `collapsed`. Quando collapsed, mostrare solo l'icona del logo (o nasconderlo del tutto) invece del logo completo.

2. **Sezione utente in basso** (righe 821-846): 
   - In modalita expanded: mostrare avatar + nome + ruolo + bottone "Esci" (come adesso)
   - In modalita collapsed: mostrare solo l'avatar (come icona) e un'icona LogOut sotto, entrambi con tooltip. Nascondere nome, ruolo e testo del bottone.

3. **Sezione Impostazioni** (righe 802-819): gia usa `tooltip` sul `SidebarMenuButton`, quindi funziona correttamente in collapsed.

### Dettaglio tecnico

Il componente `CompanySidebar` gia ha accesso a `useSidebar()` tramite `MacroAreaCollapsible`. Serve aggiungere `const { state } = useSidebar()` direttamente in `CompanySidebar` e usare `state === "collapsed"` per condizionare logo e footer.

### File da modificare

| File | Modifica |
|---|---|
| `src/components/ui/sidebar.tsx` | `SIDEBAR_WIDTH`: `"16rem"` → `"14rem"` |
| `src/components/layouts/CompanyLayout.tsx` | Logo: nascondi in collapsed. Footer utente: solo icone in collapsed. |

