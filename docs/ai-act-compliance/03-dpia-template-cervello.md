# DPIA Template — Cervello Supremo EiC

Data Protection Impact Assessment (Valutazione d'Impatto sulla Protezione Dati) per il sistema **Cervello Supremo** di Edilizia in Cloud, conformemente a GDPR art. 35 e AI Act.

Da compilare con dati specifici e firmare da DPO + CEO + CTO. Versione di riferimento da aggiornare almeno annualmente o ad ogni modifica significativa.

---

## 1. Identificazione

| Campo | Valore |
|---|---|
| Titolare del trattamento | Edilizia in Cloud (AEDIX) — [P.IVA] |
| Sede legale | [indirizzo] |
| Rappresentante legale | Florin Andriciuc |
| DPO | [nome — email — telefono] |
| Sistema oggetto | Cervello Supremo EiC (Silvio + 18 personas + edge functions AI) |
| Data redazione | 2026-XX-XX |
| Versione | 1.0 |
| Prossima revisione | 2027-XX-XX |

## 2. Descrizione del trattamento

### 2.1 Natura

Sistema di intelligenza artificiale multi-componente che fornisce assistenza conversazionale (chatbot Silvio + 18 personas verticali) ed esecuzione di compiti specifici (generazione contratti, OCR documenti, classificazione fatture, lead scoring, ecc.) per imprese edili italiane clienti EiC.

Il sistema combina:
- Modelli linguistici di terze parti (Claude, GPT, ecc.) tramite AI Router
- Knowledge Base universale di settore edile (RAG)
- Company Brain specifico di ogni azienda cliente (multi-tenant)
- Memoria long-term per utente
- Capacità multimodali (testo, immagini, audio)

### 2.2 Finalità

- Supporto operativo all'imprenditore edile e ai suoi collaboratori
- Riduzione tempo amministrativo
- Suggerimento decisionale basato su dati e best practice di settore
- Automazione di task documentali (preventivi, contratti, classificazione)
- Monitoraggio proattivo di anomalie e opportunità

### 2.3 Categorie di interessati

- **Dipendenti** delle imprese clienti (utenti del sistema)
- **Titolari/amministratori** delle imprese clienti
- **Operai** delle imprese clienti (per app cantiere e dati di lavoro)
- **Clienti finali** delle imprese clienti (dati anagrafici, dati commerciali)
- **Fornitori** delle imprese clienti (dati anagrafici, dati commerciali)

### 2.4 Categorie di dati personali trattati

**Identificativi**: nome, cognome, codice fiscale, P.IVA, email, telefono
**Lavorativi**: ruolo, livello CCNL, retribuzione (per HR personas)
**Contabili**: importi, scadenze, IBAN
**Operativi**: ore lavorate, geolocalizzazione (app cantiere)
**Comportamentali**: interazioni con chat, query effettuate, pattern di utilizzo
**Categorie speciali (eccezionali)**: dati relativi a infortuni (salute), apparente solo se documentazione lo richiede
**Dati aggregati anonimi**: per il data network (con consenso esplicito)

### 2.5 Base giuridica

| Trattamento | Base giuridica |
|---|---|
| Operatività del servizio (esecuzione contratto) | GDPR art. 6.1.b |
| Adempimenti legali (fatturazione, contributi) | GDPR art. 6.1.c |
| Interesse legittimo (efficienza, sicurezza) | GDPR art. 6.1.f |
| Marketing (newsletter EiC) | GDPR art. 6.1.a (consenso) |
| Data network aggregato | GDPR art. 6.1.a (consenso esplicito) |
| Dati relativi alla salute (infortuni) | GDPR art. 9.2.b (obblighi giuridici lavoro) |

## 3. Necessità e proporzionalità

### 3.1 Il trattamento è necessario?

Sì. Il sistema fornisce valore aggiunto significativo:
- Riduzione 30-50% tempo amministrativo
- Riduzione errori operativi
- Miglior controllo gestione e cassa
- Accesso a knowledge specialistico altrimenti non disponibile

L'alternativa (gestione manuale tradizionale) è meno efficiente, più costosa, più rischiosa per errori.

### 3.2 È proporzionato?

Sì. Il sistema:
- Tratta solo dati strettamente necessari (data minimization)
- Limita l'accesso per ruolo (RBAC)
- Conserva i dati per il tempo necessario
- Permette esercizio dei diritti dell'interessato

## 4. Misure di sicurezza tecniche e organizzative

### 4.1 Misure tecniche

✓ **Multi-tenancy con Row Level Security**: dati di un'azienda non accessibili ad altre
✓ **Cifratura at-rest**: AES-256 (Supabase standard)
✓ **Cifratura in-transit**: TLS 1.3
✓ **Autenticazione**: JWT, MFA disponibile per super_admin
✓ **RBAC granulare**: per ruolo + per persona
✓ **Audit log immutabile**: ogni interazione tracciata
✓ **Backup**: giornalieri + off-site
✓ **Hardened RLS** su `ai_brain_facts` (memoria long-term)
✓ **Tool sandboxing**: nessun edge function ha capacità distruttive autonome
✓ **HIL workflow**: decisioni critiche richiedono conferma umana
✓ **Anti-prompt-injection**: preambolo costituzionale + filtri input

### 4.2 Misure organizzative

✓ **DPO designato**: [nome]
✓ **Policy interna AI uso**: in fase di formalizzazione
✓ **AI literacy training**: in pianificazione
✓ **Procedure incident response**: in formalizzazione
✓ **Audit trimestrali**: pianificati
✓ **Penetration test annuali**: pianificati
✓ **Procedura disciplinare**: per uso scorretto AI da team interno

## 5. Identificazione e valutazione rischi

### 5.1 Rischi identificati

| ID | Rischio | Probabilità | Impatto | Punteggio | Mitigazioni |
|---|---|---|---|---|---|
| R1 | Cross-tenant data leak | Bassa | Alto | 6 | RLS + penetration test |
| R2 | Hallucination in risposte critiche | Media | Medio | 6 | RAG + citazioni + HIL su decisioni rilevanti |
| R3 | Discriminazione algoritmica (HR) | Bassa | Alto | 6 | HIL obbligatorio + audit periodico bias |
| R4 | Data breach esterno | Bassa | Alto | 6 | Cybersecurity standard + monitoring |
| R5 | Esfiltrazione via prompt injection | Bassa | Medio | 4 | Preambolo costituzionale + filtri |
| R6 | Dati personali in log | Media | Medio | 6 | Pseudonymization + retention limit |
| R7 | Decisione automatica errata | Media | Medio | 6 | HIL + decision log + outcome tracking |
| R8 | Perdita dati in disastro | Bassa | Alto | 6 | Backup off-site + DR test |

### 5.2 Misure di mitigazione attive

Per ogni rischio, vedere paragrafo 4 (misure tecniche e organizzative).

### 5.3 Rischio residuo

**Valutazione**: il rischio residuo dopo applicazione delle misure è **basso-medio**, accettabile per il tipo di trattamento e i benefici prodotti.

## 6. Diritti dell'interessato

L'interessato può esercitare i seguenti diritti via richiesta a privacy@ediliziaincloud.com:

- **Accesso** (art. 15): export dei propri dati nel sistema
- **Rettifica** (art. 16): correzione di dati inesatti
- **Cancellazione** (art. 17): salvo conservazione per obbligo legale
- **Limitazione** (art. 18): blocco temporaneo trattamento
- **Portabilità** (art. 20): export in formato strutturato (JSON, CSV)
- **Opposizione** (art. 21): cessazione trattamento
- **No decisione automatizzata** (art. 22): garantito da HIL

Tempo di risposta: max 30 giorni (estendibili a 60 in casi complessi).

## 7. Trasferimenti internazionali

I server primari di EiC sono in **EU** (Supabase EU region). Tuttavia:

- Modelli AI di terze parti (Claude, GPT, ecc.) possono essere ospitati extra-UE.
- Lo strato AI Router instrada le query a vari provider; alcuni hanno endpoint USA.
- Trasferimenti regolati da:
  - Standard Contractual Clauses (SCC) con i provider
  - Data Privacy Framework (DPF) per provider USA certificati
  - Adeguatezza per provider in paesi adeguati (es. UK)

Documentazione: lista provider e modalità trasferimento in allegato.

## 8. Conservazione dei dati

| Categoria dato | Periodo | Base |
|---|---|---|
| Account utente | Durata contratto + 30 giorni | Esecuzione contratto |
| Chat history (ai_chat_messages) | 5 anni | Audit AI Act |
| Memoria long-term (ai_brain_facts) | Fino a revoca cliente | Consenso |
| Audit log AI (ai_router_usage_log) | 6 anni | AI Act art. 19 |
| Decision log (silvio_decision_log) | 10 anni | Audit + obblighi fiscali |
| Documenti generati (contratti, POS, ecc.) | 10 anni | Obblighi civilistici |
| Dati aggregati network (cluster) | Indefinito | Sono aggregati anonimi |
| Dati pseudonomizzati network (etl_staging) | Cleanup post-run | Privacy by design |

## 9. Consultazione DPO

Il DPO ha valutato questa DPIA in data [data] e fornisce parere:

- [ ] Favorevole senza riserve
- [ ] Favorevole con raccomandazioni
- [ ] Sfavorevole

Eventuali raccomandazioni:
1. ...
2. ...

## 10. Consultazione Garante Privacy

Caso 1 — DPIA non obbligatoria comunicare:
Se il rischio residuo è basso/medio dopo mitigazioni, NON è necessaria consultazione preventiva del Garante.

Caso 2 — Comunicazione opzionale:
Per maggiore trasparenza e a fini di "good faith compliance", EiC può comunicare l'esistenza del sistema al Garante. Decisione strategica.

Caso 3 — Comunicazione obbligatoria:
Solo se il rischio residuo dopo mitigazioni resta **alto** (improbabile per il caso EiC). Allora consultazione obbligatoria.

## 11. Approvazione

Per validità:

- [ ] **DPO** — firma digitale + data
- [ ] **CEO** — firma digitale + data
- [ ] **CTO** — firma digitale + data
- [ ] **Eventuale revisore esterno** — firma + data

## 12. Allegati

- Mappa tecnica del sistema (link al doc)
- Classificazione rischio per ogni edge function (`02-classificazione-rischio-sistemi-ai.md`)
- Lista provider AI e modalità trasferimento dati
- Modello informativa privacy per clienti
- Modello informativa privacy per dipendenti dei clienti
- Procedure incident response
- Programma AI literacy

## 13. Aggiornamenti

| Versione | Data | Modifiche | Approvato da |
|---|---|---|---|
| 1.0 | 2026-XX-XX | Versione iniziale | (firme) |
| 1.1 | (futuro) | Aggiornamento data network | (firme) |
| ... | | | |

## 14. Note operative per la compilazione

Quando si compila la prima volta questa DPIA per EiC:

1. Sostituire tutti i placeholder ([nome], [data], [P.IVA], ecc.) con dati reali
2. Far compilare tabella rischi a CTO + DPO insieme
3. Validare tempi di conservazione con avvocato (ogni paese può avere specificità)
4. Allegare lista aggiornata dei sub-processor (provider AI usati)
5. Far firmare digitalmente da CEO, CTO, DPO
6. Conservare versione firmata in vault aziendale + copia su Supabase
7. Schedulare review annuale

In caso di **modifica significativa** del sistema (es. nuova edge function ad alto rischio, nuovo data flow, cambio strategia), la DPIA va **rivista entro 30 giorni** e ri-firmata.

## 15. Riferimenti normativi

- **GDPR** (Reg. UE 2016/679) — artt. 35, 36
- **D.Lgs 196/2003** (Codice Privacy IT)
- **AI Act** (Reg. UE 2024/1689) — artt. 9, 12, 13, 14, 15
- **Legge italiana 132/2025** — disciplina nazionale AI
- **Linee guida EDPB** su DPIA
- **Linee guida Garante Privacy** su sistemi AI

---

**Note finali**: questo documento è template di partenza. Personalizzazione completa richiede:
- Coinvolgimento legale specializzato in privacy + AI
- Revisione tecnica con CTO
- Allineamento strategico con CEO

Investimento iniziale: 5-15k€ (consulenza esterna). Mantenimento annuale: 1-3k€ per aggiornamenti.

ROI: protezione da sanzioni Garante (fino al 4% fatturato annuo), conformità AI Act (fino al 7%), credibilità presso clienti enterprise.
