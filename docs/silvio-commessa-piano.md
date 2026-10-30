# Silvio sulla commessa — piano (31/10/2026)

Florin: «metti in alto Silvio AI, e Silvio ti aiuta e prepara tutto quanto».

## Da dove si parte

Silvio non è da costruire: ha più di 200 strumenti (`_shared/silvioTools.ts`) e un
motore che gestisce permessi e conferme (`executeToolWithRouting`: le azioni gialle e
rosse diventano proposte da confermare, con audit e annullamento). Sulla commessa sa
già fare queste cose:

- `registra_rapportino`, `approva_rapportini`, `aggiungi_nota_commessa`
- `aggiorna_stato_commessa`, `fissa_appuntamento`, `crea_task`, `crea_sopralluogo`
- `crea_ordine_fornitore`, `registra_pagamento_commessa`, `carica_documento_cantiere`

Il problema non è che manchino gli strumenti: Silvio non **vede** la commessa. Chi
apre la chat da una commessa deve ancora dirgli di quale si tratta, e Silvio non
conosce le cose che abbiamo costruito questo mese: sottofasi, cronoprogramma, voci
dal listino, ditte e contratti, mezzi del cantiere, rapportini dell'ufficio.

## Cosa dicono i dati (ultimi 30 giorni, misurati il 31/10/2026)

- **La chat si usa poco.** 37 risposte di Silvio in un mese, in 3 aziende. Per
  rispondere ci mette in media **14 secondi** e ogni risposta costa circa **7
  centesimi**. Una risposta lenta e generica non invoglia a chiedere di nuovo.
- **Le proposte di Silvio non le accetta nessuno.** Su 240 proposte automatiche,
  0 accettate, 3 rifiutate, 174 scadute e 63 ancora in attesa. Le due più frequenti
  sono «manda il sollecito di pagamento» (96) e «rivedi il cantiere in ritardo»
  (89). Arrivano in un elenco a parte, lontano dalla commessa a cui si riferiscono,
  e scadono senza che nessuno le veda.
- **Il brief del mattino** (27-28 persone ogni giorno fino al 18/10) dal 19/10
  parte solo per le aziende che lo accendono, come deciso quel giorno. Oggi lo
  riceve una sola persona, della Demo.
- **Gli strumenti funzionano**: 1.528 esecuzioni, 0 errori. Il limite non è
  quello che Silvio sa fare, è dove e quando lo propone.

Quindi le priorità sono:
1. Silvio deve rispondere sulla commessa che hai davanti, con i dati veri (fase 1).
2. Le sue proposte devono comparire dove si lavora: nel popup di Silvio della
   commessa, accanto ai punti da sistemare, e non in un elenco a parte. Meno
   proposte, raggruppate per commessa (fase 3).
3. Deve rispondere più in fretta. Le domande sulla pagina aperta partono con il
   quadro della commessa già letto, invece di cercarlo strumento per strumento.

## Fatto oggi (fase 0)

- Il menu **«Silvio AI»** in testa alla commessa sostituisce «Chiedi a Silvio» e il
  blocco «Supporto AI per le assegnazioni» in fondo a Lavorazioni. Contiene:
  - **Chiedi a Silvio**: la chat si apre sopra la commessa, senza cambiare pagina;
  - **Analizza la commessa**;
  - **Suggerisci chi assegnare**: lo stesso dialogo di prima;
  - **Rapportini dai documenti**: apre «Scrivi rapportini» nella vista Rapportini.
- La vista «Diario» si chiama **Rapportini**. «Rapportini» e «Scrivi rapportini» non
  stanno più in Lavorazioni.

## Fase 1 — Silvio sa su quale commessa sei (in corso)

Fatto il 31/10/2026:
- strumento **`quadro_commessa`** (`_shared/silvioQuadroCommessa.ts`). Dà fasi,
  sottofasi, persone e ditte per fase, contratti, mezzi, rapportini da approvare
  e mancanti, materiali senza fornitore o prezzo, più l'elenco «da_sistemare»
  con le stesse regole dei popup;
- quando la chat è aperta da una commessa, Silvio riceve l'indicazione di
  chiamarlo per primo con l'id di quella commessa.

Obiettivo: dalla commessa si chiede «chi manca domani?» e Silvio risponde su
*questa* commessa, senza che la si nomini.

1. La chat aperta dal menu manda il **contesto pagina** (`order_id`) a `silvio-chat`.
   Esiste già `SilvioContextBar`: va collegato alla commessa e mostrato in chat
   («Stai parlando della commessa O-0002»), con la possibilità di toglierlo.
2. Un nuovo strumento **`quadro_commessa`** (verde, sola lettura) restituisce in un
   colpo:
   - fasi e sottofasi con date, giorni e ritardi;
   - chi lavora, ditte e contratti;
   - mezzi prenotati e presenti;
   - rapportini da approvare;
   - costi previsti e consuntivi senza IVA delle ditte, e margine.

   Riusa le funzioni pure già scritte (`economiaFasi`, `cronoprogramma`,
   `righeMezziCantiere`) invece di riscrivere i conti.
3. Il prompt di sistema, quando c'è una commessa, chiama `quadro_commessa` prima
   di rispondere.

**Fatto quando**: da O-0002 di Dimora la domanda «come siamo messi?» riceve una
risposta con i numeri giusti, verificati a mano su 3 domande.

## Fase 2 — Silvio prepara, chi lavora conferma

Ogni azione nuova è **gialla**: Silvio propone, una scheda in chat mostra cosa
cambia, si conferma con un clic. Niente scritture a sorpresa.

| Strumento nuovo | Cosa prepara | Riusa |
|---|---|---|
| `pianifica_fasi` | Date e giorni di fasi e sottofasi dal computo; sposta le fasi successive | `pianoInSequenza`, trigger `fase_allarga_a_sottofasi` |
| `proponi_ditte_e_costi` | Ditta per ogni fase dalle commesse passate e costo previsto dal listino | `dittaProposta`, `costoFaseDitta` (ditteLavori.ts) |
| `prepara_contratto_ditta` | Contratto di subappalto in bozza con l'Allegato A | `elencoLavoriDitta`, `contratti_subappalto` |
| `assegna_persone_fase` | Operai e squadre su una fase, con le ore previste | `AllocazioneOperaiAIDialog`, `order_employees` |
| `prenota_mezzo` | Mezzo sul cantiere per le date delle fasi | `salva_piano_mezzo` |
| `rapportini_da_documento` | Bozze di rapportini da foto, PDF ed Excel in chat | la funzione `ai-rapportini-da-documento` di oggi |

Le funzioni pure di questo mese (sottofasi, ditteLavori, pianoCantiere,
rapportiniUfficio) stanno nel frontend: si spostano in `shared/` così le usano sia
la pagina sia Silvio, con un solo conto per due ingressi.

**Fatto quando**: su una commessa nuova di Demo 2, «prepara il cantiere» porta in
una conversazione a fasi datate, ditte con il costo, un contratto in bozza e i
mezzi prenotati. Ogni passo viene confermato, ed è tutto annullabile.

## Fase 3 — Silvio ti avvisa prima

Usa i cron che esistono già (`silvio-trigger-tick`, briefing del mattino), con un
avviso per commessa nella campanella:

- fasi in ritardo e sottofasi ferme;
- prenotazioni di mezzi da allineare perché le fasi si sono spostate;
- ditta senza contratto firmato a 3 giorni dall'inizio della sua fase;
- rapportini mancanti nei giorni di cantiere;
- costi oltre il previsto.

Ogni avviso porta la sua azione pronta («Allinea alle fasi», «Prepara il
contratto»).

## Regole che valgono per tutte le fasi

- **Un conto, un posto.** Silvio legge e scrive con le stesse funzioni e RPC della
  pagina (`ufficio_crea_rapportini`, `salva_piano_mezzo`, `commessa_assegna_subappaltatore`),
  mai con insert paralleli. Esempio: le ore dei rapportini diventano costo solo
  all'approvazione.
- **Ogni strumento nuovo** si prova su Demo 2 in una transazione annullata,
  con il claim service_role come il runtime. Il nome nel registro deve essere
  uguale a `schema.function.name`.
- **Costi** senza IVA per le ditte (reverse charge) e con le stesse regole di
  `economiaFasi`.
- **Credito AI**: ogni chiamata passa dal router, che segnala credito finito e chiavi
  rifiutate (`segnalaErroreAI`).

## Ordine e stima

1. Fase 1: contesto e `quadro_commessa`, circa 1 giorno. È la base di tutto.
2. Fase 2, a lotti di due strumenti, ognuno provato su Demo 2, circa 3 giorni:
   - prima `proponi_ditte_e_costi` e `prepara_contratto_ditta`;
   - poi `pianifica_fasi` e `assegna_persone_fase`;
   - per ultimi `prenota_mezzo` e `rapportini_da_documento`.
3. Fase 3: avvisi, circa 1 giorno.
