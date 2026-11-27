# Rapportino e rendiconto giornaliero: due cose diverse (piano, 27/11/2026)

Bozza locale. Nessuna migrazione applicata, nessun push.

## La decisione del titolare

- **Rapportino** = diario interno del cantiere: chi c'era, ore, mezzi usati, avanzamento,
  materiali, foto. Si possono scrivere valori, ma **non contano più** per il committente.
- **Rendiconto giornaliero** = il foglio di economia per il committente. È un documento suo:
  si scrive **direttamente** (non serve un rapportino prima, niente doppio lavoro), con
  manodopera, mezzi, trasporti, materiali e voci, ognuna con quantità e prezzo.
  Prezzo: eccezione di cantiere → listino del committente → listino generale → a mano.
- **Rendiconto del periodo** (lo `appalto_sal` di oggi) = somma dei rendiconti giornalieri
  confermati. Il meccanismo esistente resta: prende le righe `confermata` senza `sal_id`.
- In commessa: **due schede distinte**, «Rapportini» e «Rendiconti», con una riga che dice
  cos'è l'uno e cos'è l'altro.
- I rapportini già scritti (Vulcano) si **trasformano** in rendiconti in bozza.

## Stato di partenza (27/11/2026)

- `appalto_rendiconto_righe` ha già data, prezzo, quantità, stato
  (`bozza/confermata/in_sal/fatturata`), `sal_id`, `employee_id`, `mezzo_id`,
  `rapportino_id`, `voce_libera_id`. In tutto il sistema: 54 righe, quasi tutte della Demo 2.
  Vulcano: 0 righe.
- Le righe nascono oggi dall'approvazione del rapportino (trigger
  `trg_appalto_rendiconto_da_rapportino`, `rapportino_voce_applica`,
  `rapportino_mezzo_rendiconta`, `appalto_rendiconto_crea_righe`).
- `appalto_rendiconto_prepara` (trigger) **sovrascrive il prezzo** quando c'è `tariffa_id` e
  pretende il contratto sulla commessa: un prezzo a mano su una voce di listino oggi si perde.
- Vulcano: 105 rapportini (15 approvati, 63 inviati, 27 rifiutati), 137 voci libere, 37 voci nel
  listino committente, 12 mezzi su 38 col nolo collegato.

## Modello dati (Lotto 1)

Nuova tabella `rendiconti_giornalieri` (la testata del giorno):
`id, company_id, order_id, data, numero (progressivo per commessa), stato
(bozza|confermato|annullato), descrizione_lavori, note, rapportino_id (da cui è nato, unico),
accettato_da_nome, accettato_il, created_by, confermato_da, confermato_at, timestamps,
deleted_at`.

Le righe restano in `appalto_rendiconto_righe`, con colonne nuove:
- `rendiconto_giornaliero_id` (FK, `on delete cascade`)
- `categoria` (`manodopera|mezzo|trasporto|materiale|voce`)
- `listino_voce_id` → `tariffe_aziendali` (il legame al listino generale; `tariffa_id` resta
  la voce del contratto)
- `prezzo_fonte` (`cantiere|committente|generale|manuale`)
- `prezzo_a_mano` boolean: se vero, il trigger non riscrive il prezzo.

Stato: le righe di un giornaliero seguono la testata (bozza → `bozza`, confermato →
`confermata`). Un giornaliero con righe già in un rendiconto del periodo non si riapre.

Funzioni (definer, `REVOKE … FROM PUBLIC, anon`, GRANT ad `authenticated`, controllo
`puo_modificare_commessa` + `can_view_order_amounts` come le policy delle righe):
- `rendiconto_giornaliero_salva(p jsonb)` — crea o aggiorna testata + righe in un colpo (solo bozza).
- `rendiconto_giornaliero_conferma(id)` / `rendiconto_giornaliero_riapri(id)` / `_annulla(id)`.
- `rendiconto_giornaliero_da_rapportino(rapportino_id)` — bozza dal rapportino: persone×ore
  (manodopera), mezzi×ore, viaggi (trasporto), voci libere e materiali; prezzi con la regola unica.
  Idempotente: se esiste già, restituisce quello.
- `rendiconti_giornalieri_da_rapportini(order_id | company_id, prova boolean)` — trasformazione
  in blocco; `prova=true` conta e non scrive.

## Rapportino senza valori che contano (Lotto 3)

- Dal 27/11 l'approvazione del rapportino **non scrive più righe di rendiconto** sulle commesse
  che hanno rendiconti giornalieri; il costo interno (manodopera, mezzi) resta per il Controllo
  di gestione.
- Nel modulo rapportino: niente prezzo sul mezzo (giusto così); il «Quadro economico» del
  rapportino non mostra più la «quota interna» del mezzo calcolata dalle fatture quando il
  numero non è credibile; sulla scheda mezzo si può scrivere il costo orario a mano, che vince.
- PDF dei rapportini: si può stampare anche chi non è approvato, con «BOZZA – non approvato».

## Interfaccia (Lotto 2)

- Commessa: scheda «Rapportini» (diario) e scheda «Rendiconti» (giornalieri + del periodo).
- Rendiconti: elenco per giorno (data, n°, righe, totale, stato), «Nuovo rendiconto del giorno»,
  «Crea dai rapportini» (quelli del periodo non ancora trasformati), apertura del singolo foglio
  con righe per categoria, ricerca nel listino (`commessa_listino_cerca`), prezzo modificabile,
  totale, «Conferma», PDF del foglio.
- Sotto, il rendiconto del periodo com'è oggi (`appalto_sal`).
- Dal rapportino: «Crea il rendiconto di questo giorno».

## Fuori da questo piano, segnalato

- «Attività non creata» in Commessa → Attività: errore sull'inserimento in `tasks`, da leggere nei log.

## Prima della pubblicazione

- Migrazioni 20290629100000, 100100, 110000: APPLICATE e riallineate il 27/11/2026 col via del titolare
  e provate in transazioni annullate. Si applicano solo col via del titolare.
- Trasformazione dei rapportini di Vulcano: prima `prova=true`, poi col titolare.
