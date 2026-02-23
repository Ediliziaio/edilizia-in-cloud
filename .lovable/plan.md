
Diagnosi completa fatta: il bug non è nei bottoni, ma nel rilevamento della modalità “nuova automazione”.  
La schermata che hai inviato è coerente con un problema di routing/parametri che impedisce la creazione del flow backend e lascia il builder in uno stato locale non persistibile.

Obiettivo del fix: eliminare definitivamente lo stato “Caricamento in corso…” falso, sbloccare il salvataggio, evitare toast di errore fuorvianti e rendere il flusso robusto per Super Admin in impersonificazione.

---

## Root cause reale (bloccante)

Nel routing hai **due route separate**:
- `/azienda/marketing/automazioni/nuova`
- `/azienda/marketing/automazioni/:id`

Nel componente `AutomationBuilder` usi:
- `const { id } = useParams<{ id: string }>()`
- poi controlli `id === "nuova"`

Problema: sulla route `/nuova`, `id` è **undefined** (non esiste il parametro `:id`), quindi:
- la logica “new flow” non parte
- `createFlowMutation` non viene eseguita
- `flowId` resta undefined
- il builder però viene renderizzato e usato localmente
- autosave/manual save falliscono con `Flow non ancora pronto`
- i controlli mostrano “Caricamento in corso…” in modo persistente

In più, quando un nodo viene aggiunto, l’autosave parte dopo debounce e genera toast inutili, creando percezione di bug continuo.

---

## Piano di intervento (implementazione)

### 1) Correggere il riconoscimento “nuova automazione” in modo affidabile
File: `src/components/marketing/automations/AutomationBuilder.tsx`

Intervento:
- introdurre una variabile esplicita:
  - `const isNewFlow = !id || id === "nuova";`
  - `const flowId = isNewFlow ? undefined : id;`
- sostituire tutti i check `id === "nuova"` con `isNewFlow`:
  - creazione flow on first visit
  - stato “Nessuna azienda selezionata”
  - stato “Errore creazione”
  - loading “Creazione automazione in corso…”

Impatto:
- la route `/nuova` viene gestita correttamente anche senza `:id`
- la creazione parte sempre e il redirect al nuovo UUID avviene in modo consistente
- l’utente non resta in un builder non salvabile

---

### 2) Evitare toast aggressivi durante fase non persistibile (autosave/race)
File: `src/hooks/useAutomationBuilder.ts`

Intervento:
- in `saveAll`, separare i casi:
  1. `!flowId || flowId === "nuova"` -> **ritorno silenzioso** (nessun toast distruttivo), perché in creazione/redirect
  2. `!effectiveCompany && !flow?.company_id` -> toast errore contestuale (solo caso realmente bloccante)
- mantenere toast di errore solo per veri errori di scrittura backend, non per fase transitoria di bootstrap

Impatto:
- niente spam di “Impossibile salvare” mentre il flow sta nascendo
- UX più pulita e meno allarmante

---

### 3) Rendere il salvataggio robusto anche in impersonificazione super admin
File: `src/hooks/useAutomationBuilder.ts`

Intervento:
- introdurre `persistCompanyId` risolto in modo sicuro:
  - priorità `effectiveCompany?.id`
  - fallback `flow?.company_id` (se flow già caricato)
- usare `persistCompanyId` in upsert nodi/connessioni al posto di `effectiveCompany.id` diretto
- mantenere il vincolo di sicurezza: non salvare se non esiste nessun companyId risolvibile

Impatto:
- elimina falsi negativi quando il contesto auth arriva in ritardo
- salvataggio stabile senza rompere il modello multi-tenant

---

### 4) Allineare stato dei bottoni al vero stato operativo
File: `src/components/marketing/automations/AutomationBuilder.tsx` (e supporto hook)

Intervento:
- usare una condizione più precisa per tooltip disabilitati:
  - messaggio “Creazione in corso…” solo se `isNewFlow` o dati non pronti
  - messaggio “Nessuna azienda attiva” se manca company context reale
- evitare che il bottone sembri “rotto” senza spiegazione corretta

Impatto:
- feedback coerente con il problema reale
- niente ambiguità “caricamento infinito”

---

### 5) Hardening anti-dead-end nel flusso `/nuova`
File: `src/components/marketing/automations/AutomationBuilder.tsx`

Intervento:
- se creazione non parte entro timeout ragionevole (es. contesto utente/azienda non pronto), mostrare stato guidato con CTA chiare:
  - “Riprova”
  - “Torna alla lista”
- proteggere da stalli silenziosi

Impatto:
- elimina punti morti UX
- migliore recupero errore lato utente

---

## Pulizia tecnica inclusa (senza cambiare comportamento desiderato)

- Verifica dipendenze mancanti nei `useCallback/useEffect` (attualmente ci sono callback con dipendenze incomplete; rischio stale closure)
- Rimozione di condizioni duplicate/legacy relative a `id === "nuova"` sostituite con `isNewFlow` unico
- Uniformazione messaggi toast per coerenza (info/warn/error)

---

## Strategia QA obbligatoria (prima chiusura)

### Smoke test end-to-end (obbligatorio)
1. Da lista automazioni → “Crea Flusso di lavoro”
2. Verificare schermata “Creazione automazione in corso…”
3. Redirect automatico su `/automazioni/:uuid`
4. Aggiungere trigger + azione
5. Salvare manualmente
6. Refresh pagina
7. Verificare persistenza nodi/connessioni/stato bozza
8. Archiviare e verificare ritorno lista

### Test edge cases
- Super Admin in impersonificazione
- Azienda non selezionata
- click rapido su salva durante bootstrap
- autosave durante primo inserimento nodo
- publish senza trigger/azione (deve bloccare con messaggio corretto)

### Responsive
- mobile first (390x844)
- desktop (1366+)

### Console/network
- no error runtime
- no warning forwardRef bloccanti
- richieste backend coerenti (flow create → flow read → nodes/connections upsert)

---

## Output finale che consegnerò dopo implementazione

1. Elenco preciso pulizie effettuate (funzioni/condizioni legacy rimosse)
2. Elenco bug corretti con:
   - problema
   - causa radice
   - fix applicato
3. Elenco miglioramenti UX implementati
4. Esito test completo
5. Scritta “TUTTO OK” solo dopo check integrale completato

---

## Rischi e mitigazioni

- Rischio: cambiare troppo gating e bloccare utenti standard  
  Mitigazione: fallback companyId solo da flow già autorizzato e query attive per tenant corrente
- Rischio: toast nascosti troppo  
  Mitigazione: silenzioso solo durante bootstrap transitorio; errori reali restano visibili
- Rischio: regressione su route esistenti `/automazioni/:id`  
  Mitigazione: `isNewFlow` non impatta route con UUID

Priorità di esecuzione:
1) Fix `isNewFlow` e routing logic
2) Hardening `saveAll`/companyId
3) UX states e tooltip corretti
4) QA completo + report finale
