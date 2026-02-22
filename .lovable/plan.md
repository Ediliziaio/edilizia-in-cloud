
# Modifiche al dettaglio opportunita - Sezione Contatto

## Cosa cambia

### File: `src/components/opportunities/OpportunityDetailDialog.tsx`

### 1. Rimuovere "Contatti aggiuntivo" (righe 536-541)
La sezione placeholder "Contatti aggiuntivo / Aggiungi altri contatti" verra eliminata completamente. Non ha funzionalita reale.

### 2. Rimuovere i campi personalizzati del contatto (righe 543-546)
Il blocco che renderizza i custom fields del contatto (es. "prova del cavolo") verra rimosso dalla sezione "Contatto Dettagli". I campi personalizzati resteranno gestibili dalla pagina dedicata del contatto, ma non compariranno piu nel dettaglio opportunita.

```
// Questo blocco verra rimosso:
{contactCustomFields.map((field) =>
  renderCustomField(field, contactCustomValues, setContactCustomValues)
)}
```

### 3. Aggiungere campo "Citta" dopo il telefono (prima di dove c'era "Contatti aggiuntivo")
Verra aggiunto un campo inline che mostra la citta del contatto (`contact.city`), con possibilita di modifica. Il valore verra inizializzato dal contatto caricato e salvato insieme agli altri campi contatto.

Servira:
- Nuovo stato `contactCity` inizializzato da `contact.city`
- Campo Input con label "Citta" nella sezione contatto, visibile se non vuoto o se `hideEmpty` e disattivo
- Salvataggio del campo `city` nel `handleSave` insieme a email e phone

### Riepilogo visivo della sezione Contatto dopo le modifiche

```
Contatto Dettagli
  - Nome del contatto primario  [Cambia]
  - Email primaria
  - Telefono primario
  - Citta                        <-- NUOVO
```

Nessun custom field, nessun "Contatti aggiuntivo".

### Dettaglio tecnico

| Azione | Righe | Dettaglio |
|--------|-------|-----------|
| Nuovo stato `contactCity` | ~76-78 | `const [contactCity, setContactCity] = useState("")` |
| Inizializzazione da contact | ~130-140 | Aggiungere `setContactCity(contact.city or "")` nell'useEffect |
| Campo Citta nel JSX | dopo riga 534 | Input con label "Citta" |
| Rimuovere "Contatti aggiuntivo" | 536-541 | Eliminare intero blocco |
| Rimuovere custom fields contatto | 543-546 | Eliminare il `.map(renderCustomField)` per contatto |
| Salvataggio city | nella funzione handleSave | Aggiungere `city: contactCity` nell'update del contatto |
