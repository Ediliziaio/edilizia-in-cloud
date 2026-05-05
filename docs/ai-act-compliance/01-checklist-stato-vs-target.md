# Checklist AI Act Compliance — Stato vs Target

Audit completo dei 7 principi non negoziabili (vedi Area 10 del KB) e degli obblighi AI Act, con stato attuale del sistema EiC e azioni residue.

Legenda stato:
- ✅ **Implementato** — soddisfa già il requisito
- 🟡 **Parziale** — implementato ma da formalizzare/estendere
- ❌ **Mancante** — da costruire
- 📋 **Documentale** — esiste ma manca documentazione formale

---

## Principio 1: Isolamento dati per azienda (multi-tenancy)

| Requisito | Stato | Note |
|---|---|---|
| Multi-tenancy con `company_id` | ✅ | Tutte le tabelle hanno company_id + RLS |
| Row-Level Security policies | ✅ | Pattern documentato e in uso |
| Test penetration cross-tenant periodici | 🟡 | Da formalizzare e schedulare |
| Documentazione architetturale | 📋 | Esiste a livello tecnico, da formalizzare per audit |
| Procedura incident response in caso di leak | ❌ | Da definire e testare |

**Azioni residue**:
1. Schedulare penetration test cross-tenant trimestrale (Q3 2026)
2. Documento architetturale formale "Multi-tenancy & Data Isolation"
3. Procedura "Cross-tenant data leak — Incident Response Playbook"

---

## Principio 2: Controllo accessi per ruolo (RBAC)

| Requisito | Stato | Note |
|---|---|---|
| Schema ruoli definito | ✅ | super_admin, company_admin, company_staff, salesperson, employee, ecc. |
| RBAC enforced via RLS | ✅ | Pattern in uso |
| `can_user_use_persona()` RPC | ✅ | Esistente |
| Filtraggio KB per persona (`kb_areas_filter`) | ❌ → 🟡 | Track 1 lo implementerà |
| Audit log accessi | 🟡 | `ai_router_usage_log` esistente, può servire estensione |
| Documentazione ruoli e permessi | 📋 | Da formalizzare in matrice |

**Azioni residue**:
1. Eseguire migration Track 1 (`kb_areas_filter` + system prompts)
2. Matrice formale "Ruoli × Risorse × Permessi" per audit
3. Procedura di review accessi periodica (semestrale)

---

## Principio 3: Niente invenzioni (anti-hallucination)

| Requisito | Stato | Note |
|---|---|---|
| RAG su KB universale + Company Brain | 🟡 | Architettura presente, KB universale da popolare via Track 2 |
| Citazioni fonti nelle risposte | 🟡 | Comportamento da rinforzare via system prompt aggiornato (Track 1) |
| Rifiuto su dati mancanti | 🟡 | Da rinforzare nel system prompt |
| Confidence calibration | ❌ → 🟡 | Da implementare nel prompt + UI |
| Test set per validazione | ❌ → ✅ | Track 2 fornisce test set 45 domande |
| Monitoring tasso hallucination | ❌ | Da implementare |

**Azioni residue**:
1. Rollout Track 1 (system prompts) + Track 2 (KB ingestion)
2. Eseguire test set 45 domande dopo ingestion
3. Implementare meccanismo feedback "questa risposta è corretta?" in UI
4. Dashboard monitoraggio hallucination rate

---

## Principio 4: Niente azioni distruttive

| Requisito | Stato | Note |
|---|---|---|
| Tool sandboxing (no eliminazioni) | ✅ | I tool registrati in silvioTools.ts non includono eliminazioni |
| Soft delete invece di hard delete | 🟡 | Pattern da verificare per ogni tabella critica |
| Backup multipli + off-site | 🟡 | Standard Supabase, da verificare strategia recovery |
| Audit log immutabile | ✅ | `ai_router_usage_log` append-only |
| Procedura formale eliminazioni | ❌ → 📋 | Da formalizzare con DPO |
| Disaster recovery testato | ❌ | Da testare almeno annualmente |

**Azioni residue**:
1. Audit di tutti i tool: nessuno deve avere capacità distruttive
2. Verifica soft-delete su tabelle critiche (anagrafiche, fatture, contratti)
3. Test disaster recovery (almeno una volta nel 2026)
4. Procedura formale "Hard Delete Approval Workflow"

---

## Principio 5: Human-in-the-Loop su decisioni critiche

| Requisito | Stato | Note |
|---|---|---|
| `propose_action` con risk_level | ✅ | Esistente in silvioTools |
| `silvio-execute-action` solo dopo conferma | ✅ | Esistente |
| `ai_action_proposals` tabella | ✅ | Esistente |
| UI per review proposals | ✅ | SilvioActionProposals esistente |
| Decision log unificato | ❌ → ✅ | Track 3 fornisce |
| Soglie per HIL configurate | 🟡 | Da formalizzare per ogni tipo di azione |
| Doppia firma su azioni critiche | ❌ | Da implementare per soglie alte |

**Azioni residue**:
1. Deploy Track 3 (decision_log)
2. Tabella `silvio_hil_thresholds` con soglie configurabili
3. Workflow doppia approvazione per azioni > soglia critica

---

## Principio 6: Trasparenza ed explainability

| Requisito | Stato | Note |
|---|---|---|
| Identità AI dichiarata in chat | 🟡 | Da rinforzare nel system prompt (Track 1) |
| Citazione fonti nelle risposte | 🟡 | Track 1 + Track 2 lo abilitano |
| Spiegazione del ragionamento | 🟡 | Nel formato proposta strutturata (Track 4) |
| Etichettatura contenuti generati | 🟡 | Da implementare in documenti generati (es. contratti, preventivi) |
| Diritto a spiegazione per decisioni automatizzate | ❌ → 🟡 | Decision log fornisce traccia |

**Azioni residue**:
1. Banner UI "Stai parlando con un'AI" all'apertura chat
2. Footer in documenti generati: "Bozza preparata con assistenza AI, revisionata da [nome]"
3. UI per visualizzare decisione + ragionamento + fonti

---

## Principio 7: Tracciabilità totale (audit log)

| Requisito | Stato | Note |
|---|---|---|
| `ai_router_usage_log` per chiamate AI | ✅ | Esistente, completo |
| `ai_chat_messages` per conversazioni | ✅ | Esistente |
| `silvio_alerts` per allerte | ✅ | Esistente |
| `silvio_decision_log` unificato | ❌ → ✅ | Track 3 fornisce |
| Conservazione log 5+ anni | 🟡 | Strategia da formalizzare |
| Export per audit | ❌ → ✅ | Track 3 RPC `silvio_decision_log_audit_export` |
| Immutabilità log (append-only) | ✅ | Pattern in uso |

**Azioni residue**:
1. Deploy Track 3
2. Policy retention log (5 anni minimo per AI Act, 10 per fiscale)
3. Backup off-site dei log

---

## Obblighi specifici AI Act (oltre i 7 principi)

### Trasparenza per utenti finali (art. 50)

| Requisito | Stato |
|---|---|
| Utente sa di interagire con AI | 🟡 (rinforzato via Track 1) |
| Etichetta su contenuti generati | 🟡 (da implementare) |
| Notifica per riconoscimento emozioni o categorizzazione biometrica | N/A (EiC non lo fa) |

### AI literacy obbligatoria (art. 4) — IN VIGORE DAL 2 FEBBRAIO 2025

| Requisito | Stato |
|---|---|
| Programma formativo team interno EiC | ❌ |
| Programma formativo per clienti | ❌ |
| Documentazione completamento corsi | ❌ |

⚠️ **Critico**: questo obbligo è **già in vigore**. Da affrontare con priorità.

**Azioni**:
1. Programma formativo interno EiC (4 settimane, ruoli differenziati)
2. E-learning integrato in piattaforma per clienti
3. Attestati conservati per audit

### Gestione del rischio (art. 9)

| Requisito | Stato |
|---|---|
| Sistema di gestione rischio per AI ad alto rischio | 🟡 (formalizzare se applicabile) |
| Identificazione rischi prevedibili | 🟡 |
| Misure mitigazione documentate | 📋 |

EiC dovrebbe classificare ogni edge function AI (vedi `02-classificazione-rischio-sistemi-ai.md`). Per la maggior parte sarà "rischio limitato", semplificando obblighi.

### Cybersecurity (art. 15)

| Requisito | Stato |
|---|---|
| Cifratura at-rest e in-transit | ✅ (Supabase standard) |
| Protezione contro prompt injection | 🟡 (rinforzato via system prompt + Track 1) |
| Penetration test periodici | 🟡 (da formalizzare) |
| Incident response plan | ❌ (da formalizzare) |

### Documentazione tecnica (art. 11 + Allegato IV)

| Requisito | Stato |
|---|---|
| Descrizione del sistema AI | 📋 (esiste mappa, da formalizzare) |
| Descrizione del processo di sviluppo | ❌ |
| Specifiche dei dati di training | N/A (EiC non addestra modelli) |
| Documenti di test e validazione | ❌ |
| Misure di gestione rischio | ❌ |

Per **PMI** l'AI Act prevede modulo di documentazione tecnica semplificato. Quando rilasciato dalla Commissione, EiC compilerà secondo quel modulo.

### Notifica violazioni (art. 73)

| Requisito | Stato |
|---|---|
| Procedura notifica autorità (ACN) | ❌ |
| Procedura notifica utenti | 🟡 (esiste in policy GDPR) |

### Conservazione log (art. 12)

| Requisito | Stato |
|---|---|
| Logging automatico interazioni | ✅ |
| Conservazione minimo 6 mesi | ✅ (storage indefinito attualmente) |
| Possibilità di estrazione per audit | ❌ → ✅ (Track 3) |

---

## Sintesi quantitativa

| Categoria | Implementati | Parziali | Mancanti | Documentali |
|---|---|---|---|---|
| 7 principi non negoziabili | 12 | 18 | 8 | 5 |
| Obblighi AI Act | 3 | 7 | 7 | 2 |
| **Totale** | **15** | **25** | **15** | **7** |

**Compliance rate attuale**: ~25% (implementati) + ~40% (parziale, da rifinire) = **65% di copertura** prima dei track 1-6.

**Compliance rate target post Track 1-6**: **>90%** (residuo: documentazione formale, training programs, monitoring continuo).

---

## Action plan riepilogativo

### Priorità ALTA (entro 3 mesi)
1. Track 1 (system prompts) → rinforza principi 2, 3, 4, 6
2. Track 3 (decision log) → completa principio 7 e obbligo art. 12
3. AI literacy program interno → adempie art. 4 (già fuori scadenza)
4. Documentazione tecnica formale del sistema (per audit)

### Priorità MEDIA (entro 6 mesi)
5. Track 2 (ingestion KB) → migliora principio 3
6. DPIA aggiornata firmata da DPO
7. Policy interna EiC firmata da team
8. Contratto cliente aggiornato con clausole AI Act
9. Penetration test cross-tenant
10. Disaster recovery test

### Priorità BASSA (entro 12 mesi)
11. Track 4 (playbook orchestrator) → potenzia principio 5
12. Track 5 (data network) → moat competitivo + DPIA estesa
13. Programma formativo per clienti su AI Act
14. Audit interno trimestrale formalizzato

---

## Sign-off

Per validità formale di questa checklist, firme richieste:

- [ ] CTO EiC
- [ ] DPO EiC
- [ ] Avvocato esterno (compliance AI Act)
- [ ] CEO EiC

Aggiornamento: ogni 6 mesi o ad ogni modifica architetturale rilevante.

Versione: 1.0 — 2026-05-05
