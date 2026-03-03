

# Analisi Cruscotto Aziendale — Visione CEO/Imprenditore

## Cosa c'e' di buono

Il cruscotto ha una struttura solida: Health Score in cima, sintesi esecutiva, alert operativi, KPI finanziari e commerciali, e sezioni di dettaglio. La gerarchia visiva e' corretta (cose importanti sopra, dettaglio sotto). I filtri temporali sono comodi.

---

## Cosa manca — Il punto di vista di un CEO vero

### 1. E' un cruscotto "statico" — non mi dice COSA FARE ORA

Un CEO apre il cruscotto per **decidere**, non per leggere numeri. Oggi il cruscotto mostra dati ma non risponde alle 3 domande che un imprenditore si fa ogni mattina:

- **"Come stiamo rispetto al piano?"** — Non ci sono TARGET. Fatturato 0€ non significa nulla se non so che il target e' 50.000€. Serve una barra progresso "X% del target mensile" sui KPI chiave.
- **"Cosa devo fare oggi?"** — Manca un blocco "Priorita' del giorno" con le 3-5 azioni piu' urgenti estratte automaticamente dai dati (pagamenti da sollecitare, lead caldi da chiamare, ordini in scadenza questa settimana).
- **"Come andremo a finire il mese?"** — Il forecast c'e' ma e' nascosto in fondo. Serve una proiezione visiva "a fine mese chiudiamo a €X" basata sulla velocity attuale, posizionata in alto.

### 2. Manca la "Agenda Settimanale" operativa

Un imprenditore di edilizia ragiona per settimana. Serve un widget "Prossimi 7 giorni" che mostri:
- Quanti incassi sono previsti (pagamenti con scadenza questa settimana)
- Quanti costi scadono
- Quanti cantieri/lavori hanno date di consegna
- Quanti appuntamenti commerciali

Questo e' il widget piu' utile in assoluto per chi gestisce un'azienda.

### 3. Il Trend e' inutile cosi' com'e'

Il grafico "Trend Temporale" in fondo mostra "Nessun dato nel periodo" — e anche quando ha dati, un singolo grafico generico non aiuta. Un CEO vuole vedere:
- **Fatturato cumulativo mese** vs stesso periodo mese scorso (linea sovrapposta)
- **Pipeline evolution** — come cresce/decresce la pipeline settimana dopo settimana

### 4. Manca il "Polso" del team

La sezione HR mostra solo un ranking. Un CEO vuole sapere:
- **Chi sta lavorando su cosa oggi** — quanti ordini ha ogni persona, quanti lead sta gestendo
- **Chi e' sovraccarico e chi e' scarico** — distribuzione del lavoro
- Questa e' la differenza tra un cruscotto e un foglio Excel

### 5. I numeri sono tutti a zero — UX di "vuoto"

Quando i dati sono zero (come nello screenshot), il cruscotto sembra rotto. Servono:
- Empty state intelligenti: "Nessun ordine ancora. Crea il tuo primo ordine →" con CTA
- Dati demo/placeholder per i nuovi utenti che stanno esplorando
- Messaggio contestuale: "Il cruscotto si popola automaticamente con i tuoi dati di ordini, lead e costi"

### 6. Manca un "Quick Access" alle azioni principali

Un CEO non vuole navigare menu. Servono bottoni rapidi:
- "Nuovo Ordine" / "Nuovo Lead" / "Registra Costo" — accessibili direttamente dal cruscotto
- Link rapido a "Ordini in ritardo" quando il numero e' > 0

### 7. Il Mobile e' sottovalutato

Un imprenditore controlla il cruscotto dal telefono alle 7 di mattina. Le 12 KPI card in griglia sono troppe su mobile. Serve:
- Una versione mobile che mostri solo Health Score + 4 KPI chiave + Alert + Agenda settimana
- Il resto accessibile con uno swipe o un "Mostra dettagli"

---

## Piano di Intervento (prioritizzato)

### P0 — Empty State intelligente
Quando i dati sono zero, mostrare un messaggio guida con CTA ("Crea il tuo primo ordine", "Importa i tuoi lead") invece di righe di zeri che fanno sembrare il prodotto rotto.

### P0 — Widget "Scadenze Settimana"
Nuovo componente above-the-fold: aggregazione dei prossimi 7 giorni (incassi previsti, costi in scadenza, lavori da consegnare, appuntamenti). Query su `orders` (pagamenti con `expected_date` nei prossimi 7gg) + `company_costs` (con `due_date` nei prossimi 7gg).

### P1 — Target sui KPI principali
Aggiungere barra di progresso sotto Fatturato, Contratti Vinti, Lead Nuovi con target mensile. Target inizialmente configurabili da un campo in settings (o hardcoded, poi configurabile).

### P1 — "Priorita' del Giorno" (auto-generato)
Blocco in cima che estrae le top 3-5 azioni urgenti dai dati esistenti: pagamenti scaduti da sollecitare, lead caldi non contattati, ordini in ritardo da verificare. Ogni item cliccabile con link diretto.

### P1 — Proiezione fine mese
Calcolo: `(fatturato attuale / giorni passati) * giorni nel mese` = proiezione. Mostrare come numero grande accanto al fatturato attuale nell'Executive Overview.

### P2 — Quick Actions bar
Riga di bottoni sotto l'header: "Nuovo Ordine", "Nuovo Lead", "Registra Costo" — shortcut diretti.

### P2 — Mobile-first KPI view
Su viewport < 768px, collassare le KPI in un carosello swipeable con solo i 4 indicatori chiave.

---

## File da creare/modificare

| Azione | File |
|--------|------|
| Creare | `src/components/cruscotto/WeeklyAgenda.tsx` — Scadenze prossimi 7gg |
| Creare | `src/components/cruscotto/DailyPriorities.tsx` — Top 5 azioni urgenti auto-generate |
| Creare | `src/components/cruscotto/QuickActions.tsx` — Bottoni shortcut |
| Creare | `src/components/cruscotto/EmptyStateGuide.tsx` — Guida onboarding dati zero |
| Modificare | `src/components/cruscotto/ExecutiveOverview.tsx` — Aggiungere proiezione fine mese + target bar |
| Modificare | `src/pages/azienda/CruscottoAziendale.tsx` — Integrare nuovi widget + empty state |
| Modificare | `src/hooks/useCruscottoData.ts` — Query scadenze settimanali |

Nessuna migrazione DB necessaria — tutti i dati sono gia' nelle tabelle `orders` e `company_costs`.

