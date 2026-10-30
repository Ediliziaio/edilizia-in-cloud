# Planimetrie — fase 3: generazione con l'AI (esito)

Branch `claude/planimetrie-fase3-ai-2eab0d`. Piano: [`../superpowers/specs/2026-10-30-planimetrie-design.md`](../superpowers/specs/2026-10-30-planimetrie-design.md) («Scelte» 3).
Modello e controllo: [`modello.md`](modello.md) (fase 1).

## Stato

| Cosa | Stato |
|---|---|
| Edge function `planimetria-genera` (documento, schizzo, descrizione, sopralluogo, DXF) | fatta, **non deployata** |
| Modello e controllo della fase 1 | in uso (merge di `claude/planimetrie-fase1-modello-48d51a`) |
| Banco di prova (16 campioni, punteggio, storico) | fatto |
| Collaudo della catena con l'«oracolo» (risposta perfetta, 0 $) | 16/16, zero errori e zero avvisi del controllo |
| **Punteggio con modelli veri e scelta del modello** | **da fare: manca la chiave OpenRouter** (vedi sotto) |
| Spesa AI finora | **0 $** |

## Come funziona

```
file / testo / sopralluogo
   │
   ├─ documento, schizzo, descrizione ─► modello di visione (prompt.ts)
   │        il modello DESCRIVE ciò che vede: contorni delle stanze, vani, quote lette
   │        (coordinate 0–1000 sull'immagine, oppure in metri per schizzo e testo)
   │                    │
   │                    ▼
   │        costruisci.ts: scala → muri dai contorni → vani sui muri → origini → y verso l'alto
   │                    │
   │                    ▼
   │        controlloAI.ts = controllo della fase 1 (solo errori) + stanze sovrapposte
   │           ok ─► risposta     errori ─► 2° tentativo con gli errori nel prompt
   │                                         ancora errori ─► frase semplice, credito rimborsato
   │
   ├─ sopralluogo ─► daSopralluogo.ts: riquadri con le superfici esatte, forma «stimata»
   └─ dxf ─────────► sfondoDxf.ts: pianta vuota + DXF sotto (unità e ingombro), da ricalcare
```

Perché il modello non scrive direttamente il documento: un modello di visione legge bene
i numeri e la forma delle stanze, male spessori e allineamenti al centimetro. Muri, spessori,
angoli chiusi e scala li ricava il codice, che è deterministico e testato.

### Scala e origine delle misure

| Come si fissa la scala | Origine delle misure in pianta | `da_confermare` |
|---|---|---|
| quota letta sul disegno (2+ quote concordi) | da_documento | no |
| una sola quota, o superfici scritte | da_documento | sì |
| porte larghe 80 cm (nessuna misura scritta, es. catastale) | stimata | sì |
| l'utente scrive «questa parete è 4,20 m» (`applicaMisuraUtente` / `applicaMisuraLocale`) | da_documento, la parete **rilevata** | no |
| schizzo: misure scritte nella stanza | da_documento; stanze senza misure: stimata | sì |
| descrizione a parole | tutto stimato | sì |
| sopralluogo | superfici rilevate (esatte), forma stimata, altezze rilevate se scritte | no |

Spessori dei muri, altezze di porte e finestre, davanzali: sempre `stimata`.
Altezza dei locali: `da_documento` se scritta («h 2,70»), altrimenti 270 `stimata`.
La conferma della scala vale solo per i disegni in scala; sullo schizzo una misura si
corregge parete per parete nell'editor.

### La funzione

- `serveConMetricheRapida` (a pg_net risponde subito; dall'interfaccia l'esito completo).
  Due tentativi stanno sotto i 120 s; se il primo ne prende più di metà, il secondo salta.
- `requireAuth` + `canAccessCompany`; il file sta nel contenitore `planimetrie` sotto
  `<azienda>/…` oppure arriva in base64.
- Crediti: 1 credito render (`deductRenderCreditSafe`) per documento, schizzo e descrizione;
  **rimborsato** se la pianta non viene (`refundRenderCreditSafe`). Sopralluogo e DXF gratis.
  Le chiamate al modello passano dal router con `skipCharge` (niente doppio addebito).
- Modelli: `PLANIMETRIA_MODELLI` (variabile d'ambiente), il primo e poi il secondo se il
  provider non risponde; ripiego automatico del router spento (la catena di default ha
  modelli che non leggono immagini). Gli errori del provider (credito finito, chiave) li
  segnala il router con `segnalaErroreAI` in ogni tentativo.
- La pianta **non si salva** nella funzione: torna al browser già controllata, con
  `origine_versione` (`ai_pdf`, `ai_foto`, `ai_schizzo`, `ai_testo`, `sopralluogo`,
  `importazione`) da passare a `planimetria_crea` / `planimetria_salva_versione`.

## Banco di prova

`scripts/planimetrie-banco/` — piante **sintetiche** generate dal codice (nessun dato reale),
con la verità esatta:

| Gruppo | Campioni | Cosa prova |
|---|---|---|
| geometra `g01–g07` | 7 (5 PNG, 2 PDF) | quote interne e totali, superfici o altezze scritte su alcuni |
| catastale `c01–c03` | 3 (2 PNG, 1 PDF) | nessuna quota, nomi abbreviati (W.C., Dis.), h = 2,70; la scala la dà una misura «dell'utente» |
| schizzo `s01–s03` | 3 PNG | a mano, non in scala, misure scritte; in `s03` il disimpegno non ha misure |
| descrizione `t01–t03` | 3 testi | stanze e superfici dette a parole |

```bash
node scripts/planimetrie-banco/genera-campioni.ts           # rigenera i campioni (deterministico)
node scripts/planimetrie-banco/esegui.ts --modello oracolo   # collaudo della catena, 0 $
node scripts/planimetrie-banco/esegui.ts --modello google/gemini-2.5-flash --max-usd 1
```

Punteggio (`punteggio.ts`): stanze abbinate per destinazione e superficie; **correzioni** =
stanze mancanti + stanze in più + stanze con superficie fuori tolleranza (10%; 20% per le
descrizioni) + porte in più o in meno + finestre in più o in meno + 1 se è servita la conferma
della scala. Una pianta è **corretta** con al massimo 5 correzioni (obiettivo del piano: 8 su 10).
Ogni giro salva `risultati/<data>_<prompt>_<modello>.json` e una riga in `STORICO.md`.

### Punteggio

| Prompt | Modello | Corrette | Disegni corretti | Scarto area medio | Spesa |
|---|---|---|---|---|---|
| p1 | oracolo (collaudo) | 16/16 | 13/13 | 0,1% (disegni) | 0 $ |
| p1 | modelli veri | — | — | — | — |

**Modelli veri non ancora misurati.** La chiave OpenRouter non c'è in locale e la decisione
di darla è del founder. Quando c'è, in `~/edilizia-in-cloud/.env.planimetrie.local`
(`OPENROUTER_API_KEY=…`, già escluso da git):

```bash
node scripts/planimetrie-banco/esegui.ts --modello google/gemini-2.5-flash --max-usd 0.5
node scripts/planimetrie-banco/esegui.ts --modello google/gemini-2.5-pro --max-usd 1.5
node scripts/planimetrie-banco/esegui.ts --modello anthropic/claude-sonnet-4.5 --max-usd 1.5
```

Stima di spesa per un giro completo dei tre: 2–4 $. Se una chiamata risponde 402 (credito
finito) il banco si ferma da solo. I modelli in `PLANIMETRIA_MODELLI` (oggi Gemini 2.5 Pro,
poi Claude Sonnet 4.5) sono un'ipotesi da confermare con questi giri.

## Prima di andare online

1. Applicare la migrazione della fase 1 (tabelle, contenitore `planimetrie`): senza, il
   download da `file_path` fallisce (funziona solo il base64).
2. Misurare i modelli col banco e fissare `PLANIMETRIA_MODELLI`.
3. Facoltativo: una riga `planimetria_genera` in `ai_router_config` (oggi la funzione sceglie
   il modello da sé e il router usa la configurazione di ripiego solo per i parametri).
4. Per la fase 2 (editor): `generazione.sfondo_dxf` non ha un posto nel documento; o lo
   tiene l'editor accanto alla pianta, o la fase 1 aggiunge un campo facoltativo in
   `riferimenti`.
5. `.env.planimetrie` è escluso da git solo su questo branch: usare `.env.planimetrie.local`.

## Limiti noti

- Muri solo dai contorni dei locali: un muro senza stanze accanto (un muretto, un vano
  scala non disegnato come locale) non c'è.
- Stanze storte: un lato obliquo diventa un tramezzo di 10 cm a sé.
- Il PDF va al modello com'è (`type: file`); una pianta in un PDF di molte pagine usa la prima
  che il modello legge. Il browser può mandare un'immagine della pagina giusta.
- Piante a più piani: un livello solo.
