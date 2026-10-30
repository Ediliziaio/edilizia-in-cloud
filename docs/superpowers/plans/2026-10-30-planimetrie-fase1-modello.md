# Planimetrie fase 1 — modello, controllo, quantità, archivio

> **Per chi esegue:** superpowers:executing-plans, un task alla volta, test prima del codice.

**Obiettivo:** la base su cui lavorano editor, generazione AI, 3D ed esportazioni:
un documento JSON «da edilizia», il suo controllo geometrico, le quantità per il
computo con chiavi stabili, le tabelle con le versioni e l'accesso dal frontend.

**Architettura:** tre moduli puri TypeScript in `shared/planimetrie/` (senza
dipendenze, importabili da Vite e da Deno con estensione `.ts`), un archivio React
Query in `src/lib/planimetrie/archivio.ts`, una migrazione NON applicata.

**Spec:** `docs/superpowers/specs/2026-10-30-planimetrie-design.md` (Scelte 1, 4, 8;
Decisioni dopo la revisione; Risposte del founder; Fasi).

## Vincoli globali

- Unità: centimetri nel documento; quantità in m, mq, mc (arrotondate a 4 decimali,
  come `numeric(16,4)` di `computo_voci_misure`).
- Coordinate: x verso destra, y verso l'alto (come DXF); l'editor capovolge y.
- Origine di ogni misura: `rilevata` | `da_documento` | `stimata`; una quantità porta
  la peggiore (stimata > da_documento > rilevata).
- Chiavi: `fatto:locale:<id>.pavimento_mq`, `progetto:<proposta>:locale:<id>.…`.
- Messaggi in italiano semplice: «parete», «porta», «locale»; niente gergo CAD.
- Niente zod in `shared/`: le edge non hanno import map per `zod`; validatore scritto
  a mano con messaggi italiani.
- Migrazione idempotente, versione `20281030260000` (verificata libera), NON applicata.
- Niente push. Commit locali in italiano.

## Decisioni di modello

- **Proposte = copie complete.** `livello.fatto` contiene solo oggetti `esistente`;
  ogni `livello.proposte[i]` è lo stato di progetto intero (muri esistenti +
  `da_demolire` + `nuovo`). Chi disegna, estrude o esporta una proposta lavora su uno
  `StatoPianta` qualsiasi senza ricostruire differenze. Gli id degli oggetti che
  restano uguali sono gli stessi del fatto.
- **Contorni dei locali salvati** (filo interno delle pareti) e **ricostruibili** dai
  muri con `ricostruisciLocali` (grafo planare degli assi, facce, offset di mezzo
  spessore). L'editor la usa per «le stanze si chiudono da sole», il controllo per
  confrontare.
- **Deduzione aperture:** si detrae il vuoto di superficie **superiore** alla soglia
  (default 4 mq, prassi dei capitolati «vuoto per pieno, dedotti i vani > 4 mq»),
  per intero; opzione `eccedenza` detrae solo la parte oltre la soglia.
- **Battiscopa:** perimetro meno la larghezza delle aperture con davanzale 0.

## Task

1. **Modello** — `shared/planimetrie/modello.ts`, test `planimetrieModello.test.ts`:
   tipi, `VERSIONE_SCHEMA = 1`, `validaPlanimetria(x: unknown): EsitoValidazione`,
   `nuovaPlanimetria(titolo?)`, `ambitiDi(p)`, `origineMisura(oggetto, campo)`,
   `originePeggiore(...o)`.
2. **Geometria + controllo** — `shared/planimetrie/geometria.ts`,
   `shared/planimetrie/controllo.ts`, test `planimetrieControllo.test.ts`:
   `areaPoligono`, `perimetroPoligono`, `lunghezzaMuro`, `ricostruisciLocali(muri)`,
   `apertureDelLocale`, `controllaPlanimetria(p): Problema[]`.
3. **Quantità** — `shared/planimetrie/quantita.ts`, test
   `planimetrieQuantita.test.ts`: `calcolaQuantita(p, opzioni?): MappaQuantita` su
   rettangolo, L, nicchia, porte su pareti diverse, demolito + nuovo, soglia 4 mq.
4. **Esempi** — `shared/planimetrie/esempi/bilocale.json`, `trilocale.json` (con
   proposta A), test `planimetrieEsempi.test.ts`: validi, zero errori, contorni
   ricostruiti = contorni salvati, quantità attese.
5. **Migrazione** — `supabase/migrations/20281030260000_planimetrie_base.sql`, test
   statico `planimetrieMigrazione.test.ts` (RLS, REVOKE, GRANT, idempotenza).
6. **Archivio** — `src/lib/planimetrie/archivio.ts`, test
   `planimetrieArchivio.test.ts` (client Supabase finto).
7. **Contratto** — `docs/planimetrie/modello.md`; verifica finale `npm run build`,
   `node scripts/typecheck-ratchet.mjs`, test.

## Review focus

- Aperture tra due locali: contano in entrambi (pareti e battiscopa di tutti e due).
- Apertura più alta del locale: si detrae solo la parte dentro l'altezza.
- Muro che finisce sull'asse di un altro (a T): va spezzato per chiudere i locali.
- Documento di una versione futura dello schema: rifiutato con messaggio chiaro.
- Proposta senza locali o livello vuoto: quantità vuote, nessuna eccezione.
