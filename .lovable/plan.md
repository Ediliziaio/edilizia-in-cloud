

# Redesign Pagina Dettaglio Contatto - Stile GHL

## Panoramica
Riscrivere la pagina `MarketingContactDetail.tsx` per replicare fedelmente il layout GHL dallo screenshot, ottimizzando spazi, sidebar destra con icone verticali sul bordo e pannello contenuto interno, header centrale con avatar e azioni, e colonna sinistra con layout compatto.

---

## Modifiche principali

### 1. Colonna sinistra - Redesign completo

**Header:**
- Freccia indietro + testo "Contatto Dettagli" + contatore "X/N" + frecce prev/next (< >)
- Richiede fetch del conteggio totale contatti e navigazione tra di essi

**Sezione avatar:**
- Avatar + nome sulla stessa riga + icona cestino allineata a destra (compatto, come screenshot)

**Titolare e Follower:**
- Disposti fianco a fianco su una riga (grid a 2 colonne) con icone utente
- Dropdown compatti con placeholder "Non assegnato" / icona utente

**Etichette (Tag):**
- Label "Etichette (N)" con bottone "+" per aggiungere
- Badge rimovibili (nome tag + X) sotto la label
- Click su "+" apre il TagSelector esistente

**Tabs sotto etichette:**
- 3 tab: "Tutti i campi" | "DND" | "Azioni"
- Solo "Tutti i campi" e funzionale (gli altri sono placeholder)

**Campo ricerca:**
- Input "Cerca campi e cartelle" con icona filtro a destra (sotto i tab)

**Sezioni collassabili (invariate nel contenuto):**
- Contatto, Informazioni generali, Campi personalizzati
- Stesso funzionamento inline edit attuale

---

### 2. Colonna centrale - Redesign header e timeline

**Header:**
- Avatar piccolo + nome contatto a sinistra
- Icone azione a destra: campanella (con dropdown), telefono, calendario, stella (preferito), busta email

**Timeline:**
- Separatori di data (es. "Ieri", "21 Feb 2026") tra gruppi di attivita
- Entry con icona tipo + testo + "Dettagli" link + data
- Stile piu ricco con icone per tipo attivita

**Footer messaggio:**
- Icona busta con dropdown + input "Digita un messaggio..." + bottone invio con colore primario

---

### 3. Colonna destra - Sidebar con icone verticali

**Layout completamente diverso:**
- Le icone tab sono una colonna verticale stretta (w-10) sul bordo destro della pagina
- Il pannello contenuto (w-64) si apre alla sinistra delle icone
- Ogni icona: documenti, attivita, note, calendario, opportunita, impostazioni

**Pannello Documenti (come screenshot):**
- Header: titolo "Documenti" + "+ Aggiungi" + X per chiudere
- Input ricerca "Cerca per nome del documento"
- Filter tabs: Tutto | Interno | Inviato | Ricevuto
- Lista documenti o stato vuoto "Ancora nessun documento"

**Pannello Note:**
- Header con titolo + X
- Area textarea per nuova nota + bottone aggiungi
- Lista note esistenti

**Altri pannelli:** placeholder coerente con lo stile

---

## Dettaglio tecnico

### File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`

Riscrittura completa del componente. Struttura JSX:

```text
+------------------------------------------------------------------+
|  LEFT (w-80)  |    CENTER (flex-1)    | CONTENT(w-64) | ICONS(w-12) |
|               |                       |  (conditional)|             |
|  Header       |  Avatar+Name+Actions  |  Docs/Notes/  | [icon]      |
|  Avatar+Name  |  ─────────────────    |  etc panel    | [icon]      |
|  Tit | Foll   |  Timeline entries     |               | [icon]      |
|  Tags         |  with date separators |               | [icon]      |
|  Tabs         |                       |               | [icon]      |
|  Search       |                       |               | [icon]      |
|  Collapsibles |  ─────────────────    |               |             |
|               |  Message input bar    |               |             |
+------------------------------------------------------------------+
```

**Query aggiuntiva:** fetch count totale contatti per il contatore "X/N" e IDs per navigazione prev/next.

**Nessuna nuova tabella o migrazione richiesta** - solo refactoring UI.

---

## File coinvolti

| File | Azione |
|------|--------|
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Riscrittura - layout GHL fedele |

## Cosa NON cambia
- Database e tabelle invariati
- Query e mutations esistenti riutilizzate
- Componenti TagSelector, InlineField invariati nella logica
- Routing invariato

