---
area: 11-advisor-strategico
titolo: Template di un playbook tattico
tags: [playbook, template, advisor, schema]
livello: intermedio
applicabile_a: [autori-playbook, dev-team]
versione: 0.1
aggiornato_il: 2026-05-05
stato: template di riferimento per ogni playbook V3.x
---

# Template di un playbook tattico

> **Template di riferimento**: questo file mostra la struttura standard di un playbook. Quando si scrivono i playbook reali (in V3.0+), si parte da questo schema. Sostituire i placeholder con contenuti specifici della situazione.

## Frontmatter standard di un playbook

```yaml
---
area: 11-advisor-strategico
titolo: [Titolo del playbook — situazione che affronta]
tipo: playbook
categoria: [cassa | margini | commerciale | hr | strategia | crisi | compliance | opportunita]
livello_advisory: [2-monitoraggio | 3-tattico | 4-strategico | 5-crisi]
trigger_id: [identificatore del trigger associato]
severita_default: [info | warning | alert | critical]
cooldown_giorni: [N]
target_imprese:
  - dimensione: [piccola | media | strutturata | qualunque]
  - fase: [artigiana | piccola | strutturata | consolidata | qualunque]
  - specializzazione: [generalista | specialista | qualunque]
kpi_correlati: [lista di KPI rilevanti]
versione: 1.0
aggiornato_il: 2026-XX-XX
---
```

## Struttura del documento

### 1. Quando si attiva

Descrizione precisa della **condizione di attivazione**:
- Quale evento, soglia o pattern fa scattare il playbook
- Quali pre-requisiti devono essere soddisfatti per attivazione affidabile
- Eventuali condizioni di esclusione (situazioni in cui questo playbook NON è appropriato)

Esempio:
> "Il playbook si attiva quando la cassa proiettata a 30 giorni è inferiore al 50% dei costi operativi mensili medi degli ultimi 90 giorni, e l'azienda ha almeno 6 mesi di dati nel sistema."

### 2. Diagnosi

Le **domande che il sistema si pone** prima di proporre, e i dati che consulta per rispondere:

- Domanda 1: [es. "È un evento transitorio o strutturale?"]
  - Dati consultati: [variabili dal sistema]
  - Logica: [come si interpretano i dati]
- Domanda 2: ...
- Domanda 3: ...

La diagnosi può portare a sotto-classificazioni (es. tensione di cassa **temporanea** vs **strutturale**) che indirizzano verso opzioni diverse.

### 3. Opzioni da proporre

Per ogni opzione standard, struttura:

**Opzione A — [Nome breve]**

- **In cosa consiste**: descrizione 2-4 righe
- **Quando funziona meglio**: condizioni in cui è la mossa giusta
- **Pro**: 2-4 punti
- **Contro**: 2-4 punti
- **Costo stimato**: in € o in % o in tempo (con range realistico)
- **Tempo di implementazione**: ore/giorni/settimane
- **Rischio**: basso / medio / alto + descrizione del rischio specifico
- **Reversibilità**: facilmente reversibile / parzialmente / irreversibile
- **Risorse necessarie**: persone, budget, strumenti

**Opzione B — ...**

**Opzione C — ...**

(Tipico: 3-5 opzioni per playbook)

### 4. Raccomandazione condizionata

Schema decisionale per orientare:

| Se la situazione è ... | Allora considera ... |
|---|---|
| Tensione transitoria, cliente affidabile | Opzione A |
| Tensione strutturale, cassa ridotta | Opzione B |
| Crisi acuta, rischio default | Opzione C + escalation |

Importante: il sistema **propone**, non decide. Anche con confidence alta, presenta sempre più opzioni e lascia scelta all'umano.

### 5. Cosa il sistema NON deve suggerire

Esplicito: cosa **non** è una mossa accettabile, anche se "funzionerebbe".

Esempio per playbook tensione cassa:
- ❌ Inviare comunicazioni ingannevoli ai clienti per ottenere pagamento (rischio reputazionale + legale)
- ❌ Ritardare versamenti contributivi/fiscali (sanzioni + perdita DURC)
- ❌ Lavoro nero per ridurre costi (rischio penale + amministrativo)
- ❌ Fatturazione anticipata di lavori non eseguiti (problema fiscale + contabile)

Questi confini vengono dall'Area 10 (governance) e si specificano per ogni playbook.

### 6. Quando coinvolgere chi

Mappa di **escalation** per la decisione:

| Livello decisionale | Coinvolge |
|---|---|
| Operativo (entro perimetro) | Responsabile dell'area |
| Tattico (impatto rilevante) | Direzione |
| Strategico (impatto strutturale) | Direzione + advisor esterno |
| Legale/fiscale | Avvocato + commercialista |
| Crisi | Esperto crisi d'impresa + DPO se rilevante |

### 7. Comunicazioni associate

Se il playbook prevede comunicazioni esterne (es. ai clienti, fornitori, banca), elenco delle bozze che il Cervello può preparare:

- Bozza 1: [nome] — [destinatario]
- Bozza 2: [nome] — [destinatario]
- ecc.

Le bozze sono **sempre da revisionare** prima dell'invio. Il sistema le prepara, l'umano firma e invia.

### 8. KPI da osservare

Metriche da monitorare per valutare se la mossa scelta sta funzionando:

- **KPI 1**: [nome] — frequenza di osservazione (giornaliera/settimanale/mensile) — soglia di "ok" e "non ok"
- **KPI 2**: idem
- **KPI 3**: idem

Schedulazione di follow-up: il sistema rivisita la situazione automaticamente dopo X giorni per verificare l'evoluzione.

### 9. Casi limite e variazioni

Sottocasi della situazione standard che potrebbero richiedere variazioni:

- **Variante 1**: [descrizione situazione speciale] → modifica delle opzioni proposte
- **Variante 2**: ...

### 10. Decision log esemplificativo

Per ogni playbook, log di esempio (anonimizzato) di una scelta passata:

```
2026-MM-GG - Cliente: [tenant_anonimo]
- Trigger attivato: [trigger_id]
- Diagnosi sistema: [sintesi]
- Proposta sistema: [opzioni A/B/C]
- Scelta utente: Opzione B con modifiche
- Razionale dichiarato: [motivazione]
- Outcome a 30 gg: [risultato]
- Outcome a 60 gg: [risultato]
- Outcome a 90 gg: [risultato]
- Lessons learned: [riflessione]
```

Questi esempi alimentano l'apprendimento del sistema (cosa funziona, cosa no).

## Esempio di applicazione del template

Per dare concretezza, ecco come si applicherebbe il template a un playbook reale (in versione abbreviata):

---

**Playbook: tensione-cassa-30-giorni**

**Quando si attiva**: cassa proiettata a 30 giorni < 50% dei costi operativi mensili.

**Diagnosi**:
- È un evento puntuale (es. ritardo di 1 cliente specifico) o strutturale (DSO in aumento da 6 mesi)?
- Quali clienti sono in ritardo? Sono recuperabili?
- Ci sono fatture emesse non ancora scadute con anticipi possibili?
- C'è capacità di fido bancario inutilizzato?

**Opzioni**:
- **A. Anticipo SBF su fatture in scadenza**: cassa in 24-48h, costo ~6-8% annuo proporzionato. Funziona se c'è linea SBF aperta.
- **B. Sconto pagamento immediato a clienti scaduti**: cassa in 7-15 giorni, costo 2-4% sconto. Funziona con clienti relazionati.
- **C. Negoziazione differimento con fornitori**: nessun costo finanziario ma rischio relazionale. Funziona con fornitori storici.
- **D. Aumento temporaneo fido bancario**: cassa in 5-15 giorni, costo dipendente da banca. Funziona se rapporto banca solido.

**Quando NON suggerire**:
- Ritardo selettivo dei versamenti F24 (perdita DURC)
- Comunicazioni ingannevoli ai clienti
- Fatturazione anticipata di lavori non eseguiti

**Coinvolgimento**: Responsabile amministrativo + Direzione. Se opzione D: rapporto diretto con banca.

**KPI da osservare**:
- Cassa effettiva 7/14/30/60 giorni dopo
- DSO medio nei prossimi 60 giorni
- Eventuali insoluti emersi

---

Questo è solo un abbozzo. Il playbook completo (in V3.0) avrà ulteriori dettagli, sotto-casi, esempi di interazione utente.

## Note operative per chi scrive playbook

**Lunghezza**: 1.500-3.000 parole per playbook. Più lunghi confondono, più corti sono superficiali.

**Linguaggio**: imprenditore-a-imprenditore (vedi `00-meta/voice-and-tone.md`). Vocabolario del cantiere e dell'amministrazione. Niente teoria astratta.

**Dati**: ogni playbook deve **citare i dati** che consulta. Non "consideriamo la situazione finanziaria" ma "consultiamo cassa attuale, scadenzario, fido residuo".

**Pratico**: ogni opzione deve essere **eseguibile**. Niente consigli vaghi tipo "ottimizzare la gestione".

**Modulare**: ogni playbook è autonomo. Riferimenti incrociati ad altre aree del KB sono benvenuti, ma il playbook si capisce da solo.

**Aggiornabile**: il mondo cambia (normativa, mercato, prassi). Ogni playbook ha versione e data, e va rivisto almeno annualmente.

**Testabile**: ogni playbook deve poter essere testato su casi reali e raffinato in base ai risultati.

## Roadmap di popolamento

V3.0 obiettivo: 5-10 playbook core nelle aree:
- Tensione di cassa breve termine
- Margine commessa in calo
- Cliente importante in ritardo cronico
- Pipeline commerciale vuota
- Scadenza compliance imminente

V3.x: estensione progressiva, ~1-2 playbook nuovi al mese, fino a copertura di 25-30 situazioni ricorrenti.

V4.0: arricchimento dei playbook con benchmark da data network aggregato (vedi `framework-advisor-proattivo.md`).
