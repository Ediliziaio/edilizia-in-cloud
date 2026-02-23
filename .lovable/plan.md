

# Fix Pannello Destro Automazioni - Stile GHL (Sidebar invece di Dialog)

## Problema Identificato

Attualmente i picker Trigger e Azione usano **Dialog modali** (popup centrali). In GoHighLevel, come mostrato nello screenshot, questi sono **pannelli laterali a destra** che si aprono direttamente nel builder. Inoltre, c'e un warning React nella console causato dal Dialog che riceve un ref su un function component.

## Modifiche

### 1. Convertire TriggerPickerDialog in pannello laterale destro

**File: `src/components/marketing/automations/TriggerPickerDialog.tsx`**

Riscrivere il componente da Dialog a un pannello `div` fisso a destra (stesso pattern di `AutomationNodeConfig`):
- Header "Aggiungi Trigger" con pulsante X per chiudere
- Barra di ricerca
- Categorie collapsabili con icone (Contatto, Opportunita, Appuntamenti, Comunicazioni, Sistema)
- Ogni voce con icona + label + chevron destro
- Al click su una voce: seleziona il trigger e chiude il pannello
- Larghezza: `w-80` (stessa di AutomationNodeConfig)
- Scroll interno per lista lunga

### 2. Convertire ActionPickerDialog in pannello laterale destro

**File: `src/components/marketing/automations/ActionPickerDialog.tsx`**

Stessa conversione: da Dialog a pannello laterale destro con le categorie azione (Comunicazione, CRM, Logica, Integrazione).

### 3. Aggiornare AutomationBuilder per gestire il pannello destro

**File: `src/components/marketing/automations/AutomationBuilder.tsx`**

Il pannello destro ora ha 3 stati mutuamente esclusivi:
- **Trigger picker aperto** (quando non c'e trigger o si clicca "+")
- **Action picker aperto** (quando si clicca "+" dopo un nodo)
- **Node config aperto** (quando si seleziona un nodo esistente)
- **Nessun pannello** (canvas a schermo pieno)

Logica:
- Quando si apre un picker, si chiude il pannello config (e viceversa)
- I picker non sono piu Dialog, ma componenti inline nel layout flex

### 4. Auto-apertura del pannello Trigger

Quando si crea una nuova automazione e non ci sono nodi, il pannello Trigger si apre automaticamente a destra (come in GHL nello screenshot).

### 5. Fix warning console

Rimuovere il Dialog wrapper elimina il warning "Function components cannot be given refs" che appare nella console.

## Riepilogo tecnico

| Cosa | Prima | Dopo |
|------|-------|------|
| Trigger picker | Dialog modale centrale | Pannello laterale destro |
| Action picker | Dialog modale centrale | Pannello laterale destro |
| Warning console ref | Presente | Rimosso |
| Auto-apertura trigger | No | Si (su nuovo flusso senza nodi) |
| Pattern UX | Popup interrompe il flusso | Pannello integrato nel canvas (come GHL) |

## File modificati

| File | Tipo modifica |
|------|---------------|
| `TriggerPickerDialog.tsx` | Riscrittura (Dialog -> pannello sidebar) |
| `ActionPickerDialog.tsx` | Riscrittura (Dialog -> pannello sidebar) |
| `AutomationBuilder.tsx` | Aggiornamento layout (pannello destro condizionale) |

Nessun file nuovo o eliminato. Nessuna modifica al database.
