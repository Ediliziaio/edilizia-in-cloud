# Preventivo predittivo — piano (26/10/2026)

Obiettivo: nel preventivatore edile (8 moduli: bagni, climatizzazione, elettrico, termoidraulico,
pavimenti, piscine, ristrutturazione, tetti) chi prepara l'offerta può chiedere «come faccio questo
lavoro a X euro con questo margine?» e avere numeri, non opinioni.

Regola di fondo: **la AI capisce la domanda, il programma fa i conti.** Nessun numero nasce dal
modello; ogni stima porta le sue assunzioni, scritte e modificabili.

## Livello 1 — Calcolo a ritroso (margine)
- Funzione pura `src/lib/preventivi/obiettivoMargine.ts`: dato prezzo (netto o ivato) e margine
  desiderato → tetto di costo, scarto sui costi attuali, prezzo minimo per quel margine, quota
  materiali/manodopera, voci su cui tagliare (taglio proporzionale al peso).
- Costi incompleti (righe senza costo) = niente percentuali inventate: lo dice.
- Card condivisa `ObiettivoETempiCard` nello step Economia degli 8 moduli, solo per chi vede costi e margini.

## Livello 2 — Tempi e personale dalle voci
- Funzione pura `src/lib/preventivi/stimaTempi.ts`: ore-persona = costo manodopera della voce ÷ costo
  orario della squadra; giorni = ore ÷ (operai × ore/giorno × resa); operai necessari per chiudere in N
  giorni; ripartizione per capitolo.
- Ipotesi esplicite e modificabili: costo orario, operai, ore/giorno, resa. Voci senza costo di
  manodopera = non stimabili, contate e mostrate.
- Stesso componente, stessa card.

## Livello 3 — E se… (in loop dopo 1 e 2)
- 3a. Confronto scenari: meno operai / consegna in 3 settimane → ricalcolo di margine, scadenza,
  personale e cosa si rompe. Riusa `quotePlanningScenario.ts` (fa già squadre, ferie, viaggi).
- 3b. Dalla chat: intento deterministico («lavoro a 18.000 € col 25%») → risposta calcolata in locale.
- 3c. Storico vero: ore dei rapportini e costi chiusi per tipo di voce → «di solito servono 11 giorni».
  Prima serve legare le ore dei rapportini alle voci (oggi non c'è il legame).

## Criteri di fine lotto
Test della funzione pura (casi limite: costi incompleti, sconto, IVA, margine ≥ 100%), typecheck col
cricchetto, test critici, prova dal vivo su Demo Azienda 2, poi push.
