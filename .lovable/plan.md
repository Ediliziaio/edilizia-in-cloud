
Obiettivo immediato: risolvere in modo definitivo il fatto che “Bozza” e “Salva” non rispondono, con priorità su affidabilità del builder nella route `/azienda/marketing/automazioni/nuova` (attualmente in stato di caricamento) e sulle azioni di persistenza/stato.

## Diagnosi tecnica (basata sul codice attuale)

1. Creazione flow “nuova” fragile
- In `useAutomationBuilder`, la creazione iniziale usa `effectiveCompany!.id` e `user!.id` senza guardie.
- Se `effectiveCompany` non è pronto/null (caso frequente su super admin senza impersonazione attiva o race di bootstrap auth), la mutation fallisce.
- In `AutomationBuilder`, l’effetto di creazione su `id === "nuova"` può riprovare in loop (isPending/data), lasciando UX bloccata su loading o comportamento non deterministico.

2. Azioni Save/Bozza non protette dallo stato “flow non pronto”
- `saveAll` ritorna silenziosamente se `flowId` manca (`return` senza feedback), percepito come “non funziona”.
- `togglePublish` dipende da `flow`; se non disponibile, ritorna senza informare.
- In UI i comandi restano visibili/cliccabili anche quando il flow non è ancora pronto.

3. UX di errore insufficiente nei punti critici
- Mancano messaggi contestuali chiari quando il problema è “contesto non inizializzato” (azienda non selezionata / flow non creato).
- Lo stato di caricamento non distingue:
  - “sto creando il flow”
  - “creazione fallita”
  - “flow pronto”.

4. Segnale collaterale da warning React
- C’è un warning ref-related nella pagina lista automazioni (non il root diretto di Save/Bozza), ma va incluso nel ciclo di stabilizzazione per ridurre rumore e possibili side-effect di rendering.

## Intervento proposto (implementazione)

### A) Stabilizzazione creazione flow in `/nuova`
File: `src/components/marketing/automations/AutomationBuilder.tsx`, `src/hooks/useAutomationBuilder.ts`

- Introdurre stato esplicito di bootstrap flow:
  - `isCreatingInitialFlow`
  - `createInitialFlowError`
  - `initialFlowId` (opzionale, per gating UI)
- Eseguire creazione solo quando prerequisiti sono pronti:
  - `id === "nuova"`
  - `effectiveCompany` presente
  - `user` presente
  - non già in creazione
  - non già creato
- Evitare retry loop automatici incontrollati.
- In caso errore, mostrare stato di errore con CTA:
  - “Riprova creazione flow”
  - “Torna alla lista automazioni”

### B) Gating forte dei comandi Save / Bozza / Archivia
File: `src/components/marketing/automations/AutomationBuilder.tsx`, `src/hooks/useAutomationBuilder.ts`

- Calcolare `canPersist = Boolean(flowId && flow && effectiveCompany)`.
- Disabilitare:
  - bottone Save
  - switch Bozza/Pubblicata
  - bottone Archivia
  quando `canPersist` è false.
- Se utente forza azione senza contesto pronto (shortcut o click race):
  - toast esplicito: “Flow non ancora pronto. Attendi il completamento della creazione.”
- Per Save:
  - mantenere spinner coerente
  - feedback successo/errore sempre presente.

### C) Correzione comportamento save “silente”
File: `src/hooks/useAutomationBuilder.ts`

- In `saveAll`, sostituire i `return` silenziosi con esiti espliciti:
  - se manca `flowId/effectiveCompany`: toast informativo e uscita controllata.
- Confermare che `saveAllRef` punti sempre all’ultima closure (già introdotto), mantenendo debounce affidabile.
- Pulizia timer al teardown componente per evitare race al cambio route.

### D) Pubblica/Bozza robusto e deterministico
File: `src/hooks/useAutomationBuilder.ts`

- In `togglePublish`:
  - guardia su `flow.id` e `flow.status` validi
  - blocco re-entrancy se mutation in corso
  - invalidate query del flow e (se necessario) della lista automazioni per consistenza badge/stato.
- Gestione errori con messaggio leggibile lato utente.

### E) Miglioria UX anti-dead-end
File: `src/components/marketing/automations/AutomationBuilder.tsx`

- Differenziare vista di loading:
  - “Creazione automazione in corso…”
- Aggiungere stato errore dedicato (non solo spinner infinito).
- CTA sempre presenti:
  - riprova
  - torna alla lista.

### F) Riduzione warning React (stabilizzazione)
File target da verificare durante implementazione:
- `src/pages/azienda/marketing/MarketingAutomations.tsx`
- `src/components/marketing/automations/AutomationFlowsList.tsx`
- eventuali componenti custom usati come child di primitive `asChild` (ref forwarding)

- Identificare il punto che passa ref a function component non `forwardRef` e riallineare al pattern corretto.
- Obiettivo: console pulita sui path automazioni per debugging affidabile.

## Sequenza di lavoro (ordine esecuzione)

1. Hardening hook `useAutomationBuilder` (guardie, save/publish/cleanup timer).
2. Hardening UI `AutomationBuilder` (gating bottoni, stati loading/error, CTA).
3. Fix warning ref in lista automazioni.
4. Test funzionali end-to-end e regressione UX.

## Test plan obbligatorio (che eseguirò dopo implementazione)

1. Smoke test completo
- `/azienda/marketing/automazioni`
- crea nuovo flow (`/nuova`) -> redirect su `/:id`
- aggiungi nodo trigger/azione
- salva manuale
- autosave (attesa debounce)
- toggle Bozza/Pubblicata
- archivia e ritorno lista.

2. Edge cases
- click Save immediato durante creazione flow
- toggle Bozza con flow non pronto
- refresh pagina su `/:id` e su `/nuova`
- back/forward browser
- sessione con contesto azienda non disponibile (messaggio + CTA, no freeze).

3. Responsive
- mobile first (390x844): nessun blocco CTA, controlli raggiungibili
- desktop: comportamento invariato.

4. Performance base
- nessun loading infinito
- nessun loop mutation
- debounce save stabile senza spam.

5. Console quality gate
- nessun runtime error
- warning solo non bloccanti (idealmente azzerati nell’area automazioni).

## Deliverable finale che produrrò dopo implementazione

- elenco preciso di ciò che rimuovo/pulisco (import, rami legacy, codice morto relativo all’area toccata)
- elenco bug corretti con causa tecnica e fix applicato
- elenco miglioramenti UX implementati
- esito test con evidenza puntuale; “TUTTO OK” solo dopo completamento completo della checklist sopra.
