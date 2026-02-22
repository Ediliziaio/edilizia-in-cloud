

# Redesign Dialog "Nuovo Calendario" (stile GHL)

## Panoramica

Ricostruire il dialog `CalendarDialog.tsx` per replicare fedelmente il layout di GoHighLevel, senza il campo "URL personalizzato" come richiesto.

---

## Layout del nuovo dialog (dall'alto in basso)

1. **Titolo**: "Nuovo calendario" (o "Modifica calendario")
2. **Nome del calendario** - Input con label + icona info tooltip, placeholder "(es.) Portata in uscita"
3. **"— Rimuovi descrizione" / "+ Aggiungi descrizione"** - Link toggle per mostrare/nascondere il campo descrizione
4. **Descrizione** (collassabile) - Textarea con placeholder "Scrivi descrizione" (niente rich text editor per semplicita)
5. **Seleziona membro del team** - Select con label + icona info tooltip, lista dei membri admin/staff della company
6. **Durata dell'incontro** - Input numerico + Select unita (Minuti/Ore), con icona info tooltip
7. **Nota informativa**: "Per personalizzare ulteriormente il tuo orario di lavoro, vai alle impostazioni avanzate."
8. **Footer**: Link "Impostazioni avanzate" a sinistra, bottoni "Annulla" e "Conferma" a destra

---

## Modifiche tecniche

### File: `src/components/settings/CalendarDialog.tsx` (riscrittura)

| Elemento | Dettaglio |
|----------|-----------|
| Campo "Nome del calendario" | Label con Tooltip info icon, placeholder "(es.) Portata in uscita" |
| Descrizione collapsabile | State `showDescription`, toggle con link "— Rimuovi descrizione" / "+ Aggiungi descrizione" |
| Team member select | Query `profiles` filtrata per `company_id`, solo ruoli `company_admin` e `company_staff`. Usa pattern simile a `AssignedToSelect` |
| Durata | Input numerico (default 30) + Select per unita ("Minuti" / "Ore") |
| Impostazioni avanzate | Link che porta al tab Disponibilita nella stessa pagina |
| Footer layout | `justify-between` con link a sinistra e bottoni a destra |
| Rimuovere | Campi "Gruppo" e "Tipo" dal dialog principale (restano gestibili dalla tabella) |

### Aggiornamento interfaccia `CalendarFormData`

Aggiungere `owner_id: string` per il membro del team selezionato. Rimuovere `group_name` e `calendar_type` dal dialog (verranno impostati con valori default).

### File: `src/components/settings/MarketingCalendarsConfig.tsx`

Aggiornare la chiamata al dialog per passare/ricevere `owner_id` e gestire i valori default per `group_name` e `calendar_type`.

---

## Nessuna modifica al database

Le colonne esistenti supportano gia tutti i campi. `owner_id` e gia presente nella tabella `marketing_calendars`.

