
# Riscrittura Dialog Creazione Opportunita - Stile GHL

## Cosa cambia

Il dialog di creazione opportunita (`OpportunityDialog.tsx`) viene riscritto per replicare esattamente il layout GHL mostrato negli screenshot.

## Layout GHL (dagli screenshot)

### Struttura generale
- **Header**: "Aggiungi Nuovo opportunita" + sottotitolo "Crea Nuovo opportunita in dettagli e selezionando un contatto"
- **Sidebar sinistra**: Tab "Dettagli dell'opportunita" (come nel dialog di modifica)
- **Contenuto a destra**: diviso in due macro-sezioni

### Sezione 1: Contatto Dettagli
- **Nome del contatto primario** (campo obbligatorio con asterisco rosso): select/combobox che cerca tra i contatti esistenti
  - Se trova risultati: mostra lista contatti
  - Se non trova: mostra icona "No Data" + opzione "+ [testo digitato] (Crea nuovo contatto)" in blu
  - Se campo vuoto: mostra icona "No Data" + opzione "+ (Crea nuovo contatto)"
- **Email primaria**: input testo con icona chat rossa a destra (placeholder "Inserisci email")
- **Telefono primario**: input testo (placeholder "Telefono") - visibile solo dopo selezione contatto

### Sezione 2: Opportunita Dettagli
- **Nome opportunita** (obbligatorio con asterisco rosso): input testo
- **Sequenza / Fase**: due select affiancati (pipeline read-only, fase selezionabile)
- **Stato / Valore dell'opportunita**: select stato (Aperta) + input valore (EUR 0)
- **Titolare / Follower**: due select affiancati
- **Nome dell'azienda / Fonte dell'opportunita**: due input affiancati
- **Etichette**: multi-select con TagSelector (placeholder "Aggiungi etichette")
- **Campi custom dell'opportunita**: renderizzati dinamicamente da `marketing_custom_fields` con `object_type = 'opportunity'`

### Footer
- **Sinistra**: Link "Aggiungi/gestisci campi" con icona (naviga a impostazioni campi personalizzati)
- **Destra**: "Annulla" + "Crea" (pulsante blu)

## Dettaglio tecnico

### File modificato (1)
**`src/components/opportunities/OpportunityDialog.tsx`** - Riscrittura completa

### Cambiamenti principali
1. **Layout con sidebar**: aggiungere sidebar sinistra con tab "Dettagli dell'opportunita" (identica al dialog modifica)
2. **Contatto combobox GHL-style**: sostituire il campo di ricerca attuale con un select/combobox che:
   - Mostra dropdown con lista contatti quando si digita
   - Mostra "No Data" con icona quando non trova risultati
   - Mostra sempre "+ [testo] (Crea nuovo contatto)" in fondo come link blu
   - Quando selezionato, popola automaticamente email e telefono dai dati del contatto
3. **Email primaria + Telefono primario**: due campi separati sotto il nome contatto (email accanto al nome, telefono sotto)
4. **Sezione "Opportunita Dettagli"**: identica a GHL con tutti i campi gia presenti piu:
   - Select "Stato" (Aperta/Vinta/Persa/Abbandonata)
   - Select "Sequenza" (read-only, mostra la pipeline corrente)
   - Multi-select "Etichette" usando il componente `TagSelector` esistente
5. **Link "Aggiungi/gestisci campi"**: in basso a sinistra, naviga a `/azienda/impostazioni/campi-personalizzati`
6. **Dialog piu largo**: `max-w-2xl` per ospitare il layout con sidebar
7. **Salvataggio tags**: alla creazione, salva anche i tags selezionati nel campo `tags` della tabella `marketing_opportunities`
8. **Rimuovere il campo Note**: non presente nel dialog di creazione GHL (le note si aggiungono dopo dalla modifica)

### Dati da usare
- Contatti: query esistente `marketing_contacts`
- Staff: hook esistente `useCompanyStaff`
- Custom fields: query esistente `marketing_custom_fields` con `object_type = 'opportunity'`
- Tags: componente `TagSelector` gia pronto
- Pipelines: prop `pipelineId` e nome dalla pipeline selezionata

### Cosa NON cambia
- Hook `useCreateOpportunity` rimane invariato
- Pagina `MarketingOpportunities.tsx` rimane invariata
- Dialog dettaglio rimane invariato
- Database e RLS non cambiano
