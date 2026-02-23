

# Allineamento Tab Impostazioni, Cronologia Iscrizioni e Registro Esecuzione a GHL

## Analisi degli screenshot GHL

### Tab "Impostazioni" (GHL)
La schermata GHL mostra un form ricco con card separate:
- **Contatto**: Toggle "Abilita reinserimento", Toggle "Consenti piu opportunita", Toggle "Interrompi la risposta Attivo"
- **Comunicazione**: Select "Fuso orario", Toggle "Periodo di tempo - Dati specifici", Input "Da Nome" + "Da Email", Select "Da numero"
- **Conversazioni**: Toggle "Segna come letto"

Attualmente il nostro tab Impostazioni ha solo nome + descrizione in un form basico.

### Tab "Cronologia delle iscrizioni" (GHL)
La schermata GHL mostra:
- Titolo "Cronologia delle iscrizioni" + sottotitolo descrittivo
- **Filtri**: Date range picker (Data di inizio -> Data di fine) + Select "ogni Eventi" + Select "Seleziona Contatto" + bottone refresh
- **Tabella** con colonne: Contatto | Iscrizione Ragione | Data Iscritto (CET +01:00) | Azione Attuale | Stato Attuale | Successivo esecuzione Attivo (CET +01:00) | attivita
- Empty state: "Nessuna Iscrizione Trovato" + "La cronologia delle iscrizioni e disponibile fino agli ultimi 30 giorni."

Attualmente il nostro tab mostra solo un'icona centrata con testo generico.

### Tab "Registro di esecuzione" (GHL)
La schermata GHL mostra:
- Titolo "Registro di esecuzione" + sottotitolo descrittivo
- **Filtri**: Date range picker + Select "ogni attivita" + Select "ogni Stato" + Select "Seleziona Contatto" + bottone refresh
- **Tabella** con colonne: Contatto | Azione | Stato | Eseguito Attivo (CET +01:00) | attivita
- Empty state: "Nessun registro di controllo trovato" + "I registri di esecuzione sono disponibili fino agli ultimi 30 giorni."

Attualmente il nostro tab mostra solo un'icona centrata con testo generico.

### Header GHL
L'header GHL ha:
- Sinistra: "< Indietro a Flussi di lavoro" (testo link, non solo icona)
- Centro: nome flusso + icona matita
- Destra: avatar utente, icona salva, undo, redo, "Archivia" (testo)
- Tab row: Builder | Impostazioni | Cronologia delle iscrizioni | Registro di esecuzione (con underline blu sulla tab attiva, non background)

---

## Modifiche da implementare

### File: `src/components/marketing/automations/AutomationBuilder.tsx`

**Header Row 1**:
- Sostituire il bottone freccia con un link testuale "< Indietro a Flussi di lavoro"
- Spostare il nome flusso al centro con icona matita
- A destra: icona avatar, icona salva, undo, redo, testo "Archivia"

**Tab Row**:
- Cambiare lo stile tab da "background accent" a "underline blu" sulla tab attiva (come GHL)

**Tab "Impostazioni"** - Riscrivere completamente con card GHL:
- Card **Contatto**: 3 toggle con titolo + descrizione lunga + link "Scopri Piu"
  - "Abilita reinserimento"
  - "Consenti piu opportunita"
  - "Interrompi la risposta Attivo"
- Card **Comunicazione**: Select fuso orario, toggle periodo di tempo, input Da Nome/Da Email, select Da numero
- Card **Conversazioni**: Toggle "Segna come letto"

**Tab "Cronologia iscrizioni"** - Riscrivere con filtri + tabella:
- Titolo + sottotitolo descrittivo
- Barra filtri: Date range (inizio -> fine) + Select "ogni Eventi" + Select "Seleziona Contatto" + bottone refresh
- Tabella con colonne: Contatto | Iscrizione Ragione | Data Iscritto | Azione Attuale | Stato Attuale | Successivo esecuzione | attivita
- Empty state centrato con icona + "Nessuna Iscrizione Trovato" + nota 30 giorni

**Tab "Registro esecuzione"** - Riscrivere con filtri + tabella:
- Titolo + sottotitolo descrittivo
- Barra filtri: Date range + Select "ogni attivita" + Select "ogni Stato" + Select "Seleziona Contatto" + bottone refresh
- Tabella con colonne: Contatto | Azione | Stato | Eseguito Attivo | attivita
- Empty state centrato con icona + "Nessun registro di controllo trovato" + nota 30 giorni

---

## Riepilogo

| Elemento | Prima | Dopo (GHL) |
|----------|-------|------------|
| Link indietro | Icona freccia | "< Indietro a Flussi di lavoro" testo |
| Tab style | Background accent | Underline blu |
| Impostazioni | Nome + descrizione | 3 card (Contatto, Comunicazione, Conversazioni) con toggle/input |
| Cronologia iscrizioni | Icona + testo generico | Filtri + tabella 7 colonne + empty state GHL |
| Registro esecuzione | Icona + testo generico | Filtri + tabella 5 colonne + empty state GHL |

**File modificato**: `src/components/marketing/automations/AutomationBuilder.tsx`

Nessun file nuovo. Nessuna modifica al database.
