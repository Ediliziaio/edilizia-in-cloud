
## Obiettivo
Correggere il disallineamento tra intestazione (prima riga con LUN/MAR/...) e griglia oraria nelle settimane in **Marketing & Vendita → Appuntamenti**, senza alterare il comportamento funzionale.

## Analisi tecnica (causa probabile)
Dal codice attuale (`src/components/marketing/MarketingCalendarWeekView.tsx`) l’header e il body sono renderizzati in **due griglie separate**:

- Header: `grid grid-cols-[60px_repeat(7,1fr)]`
- Body: `grid grid-cols-[60px_repeat(7,1fr)]`

Anche se sembrano uguali, essendo due container distinti possono calcolare larghezze diverse quando il contenuto interno cambia (pill appuntamenti, testo, badge, ecc.). Questo spiega il bug “prima riga non in linea” già visto in passato.

## Piano di fix

### 1) Stabilizzare il template colonne (header + body)
File: `src/components/marketing/MarketingCalendarWeekView.tsx`

- Sostituire in entrambi i blocchi griglia:
  - da `grid-cols-[60px_repeat(7,1fr)]`
  - a `grid-cols-[60px_repeat(7,minmax(0,1fr))]`

Motivo: `minmax(0,1fr)` impedisce che il contenuto imponga una larghezza minima diversa tra header e body.

### 2) Prevenire overflow che altera il layout
Sempre nello stesso file:

- Aggiungere `min-w-0` ai contenitori colonna giorno (celle header e celle slot) dove necessario.
- Verificare che gli elementi interni già troncati (`truncate`) non forzino larghezze non desiderate.
- Mantenere `min-w-[900px]` solo come soglia di usabilità orizzontale, senza influire sul calcolo differente tra le due griglie.

### 3) Hardening visivo (opzionale ma consigliato)
- Uniformare eventuali bordi/padding laterali tra cella vuota header e colonna orari (`60px`) per evitare offset visivi di 1px (effetto “sembra fuori linea”).
- Verificare la resa con/ senza scrollbar.

## Criteri di accettazione
Il fix è accettato solo se:

1. In vista **Settimana**, tutte le linee verticali dell’intestazione coincidono perfettamente con quelle delle righe orarie.
2. Nessun cambio regressivo su:
   - click slot per creare appuntamento
   - click card appuntamento per modifica
   - badge viaggio/ritardo e tooltip
3. Layout corretto sia con pochi appuntamenti sia con molte card nella stessa giornata.

## Piano QA rapido
1. Aprire `/azienda/marketing/calendario` in vista Settimana.
2. Verificare allineamento colonne su:
   - viewport desktop larga
   - viewport più stretta (con eventuale scroll)
3. Testare una settimana con card lunghe (titoli lunghi + badge viaggio).
4. Navigare settimana precedente/successiva e confermare stabilità.
5. Smoke test interazione: creazione/modifica appuntamento invariata.

## Impatto
- Modifica localizzata al componente settimana.
- Nessuna migrazione DB.
- Nessuna modifica backend.
- Rischio regressione basso.
