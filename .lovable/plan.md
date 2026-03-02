

# Analisi Sezione Aziende — Gap Marketing, Vendite e SaaS

## Cosa c'e gia
La lista ha filtri, sorting, export CSV, toggle Lista/Pipeline, Health Score, expanded row con KPI. Il dettaglio ha 7 tab (Panoramica, Dettagli, Team, SaaS, Abbonamento, Attivita, Note), Conversion Card per trial e Next Best Actions.

## Cosa manca — Prospettiva Growth/Sales/SaaS

### 1. KPI Strip in cima alla lista
Non c'e nessun riassunto aggregato. Un CSM o Sales Manager che apre la pagina non vede subito: quante aziende attive, MRR totale, tasso conversione trial, churn rate. Servono 4 card compatte sopra la tabella.

**Metriche:** Aziende Attive, MRR Totale, Tasso Conversione Trial (attive / attive+trial+expired), Aziende a Rischio (health critical/at_risk).

### 2. Ultimo Accesso nella tabella
Era previsto ma manca. Sapere quando un tenant ha fatto l'ultimo login e cruciale per identificare churn silenzioso. Colonna con data + indicatore colore (verde < 7gg, giallo < 30gg, rosso > 30gg).

**Implementazione:** Query su `profiles` per `last_sign_in_at` raggruppato per `company_id` (MAX).

### 3. Azioni rapide dal menu contestuale
Dalla lista non si puo fare nulla se non "Apri" o "Accedi". Mancano azioni rapide: cambia stato, estendi trial, invia email. Un dropdown con azioni contestuali per ogni riga riduce i click.

### 4. Tags / Segmenti per le aziende
Non c'e modo di etichettare le aziende (es. "VIP", "Upsell Q2", "Churned - da recuperare"). I tag permettono segmentazione per campagne marketing e prioritizzazione vendite.

**Implementazione:** Nuova tabella `company_tags` (id, company_id, tag, color). Chip colorati nella riga della tabella.

### 5. Contatori Utenti nella lista
La colonna utenti non esiste nella tabella principale. Sapere quanti utenti ha un tenant e un segnale di adozione e di potenziale upsell.

### 6. Sparkline trend nella expanded row
La expanded row mostra KPI statici ma nessun trend visivo. Una mini sparkline degli ordini degli ultimi 6 mesi darebbe contesto immediato senza aprire il dettaglio.

---

## Piano di Implementazione

### File nuovi
- `src/components/admin/company/CompaniesKPIStrip.tsx` — 4 card aggregate (Attive, MRR, Conversione Trial, A Rischio)

### File modificati
- `src/pages/admin/CompaniesList.tsx`:
  - Inserire `CompaniesKPIStrip` sopra i filtri
  - Aggiungere colonna "Utenti" alla tabella
  - Aggiungere colonna "Ultimo Accesso" con query su profiles
  - Aggiungere dropdown azioni rapide per riga (cambia stato, estendi trial)
  - Aggiungere sparkline ordini nella expanded row

### Database
- Nuova tabella `company_tags` con RLS per super_admin
- Query `last_sign_in_at` dai profili (no nuove tabelle, dato gia presente)

### Nessun breaking change
Tutte le aggiunte sono additive. La tabella esistente non perde colonne.

