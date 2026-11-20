# Rapportini, fasi, mezzi e trasporti — 20 novembre 2026

La richiesta riguarda i comandi che Federica deve usare nell'interfaccia. La successiva precisazione esclude una pulizia manuale dei dati: i rapportini di prova verranno individuati e rimossi dagli utenti.

## Interventi

1. Completare Correggi rapportino: testi, persone, ore, mezzi, materiali e righe già inserite; selettori dalle anagrafiche aziendali, validazione dei numeri, errore/Riprova, storico e aggiornamento dei riepiloghi.
2. Separare la possibilità di correggere dalla decisione di approvazione. Una correzione del proprio rapportino già approvato da parte dello staff richiede una nuova approvazione; non introduce autoapprovazioni. Preservare blocchi su rendiconti confermati e giornale firmato.
3. Rendere disponibili Elimina/Annulla dalla lista globale, dal dettaglio e dalla commessa. Usare l'annullamento esistente, che rimuove il documento dagli elenchi operativi e storna gli effetti, mantenendo la traccia.
4. Aggiungere la modifica delle voci economiche già salvate, con controllo della versione, permessi, storico privo di costi riservati e invalidazione del PDF nella stessa transazione.
5. Rendere idempotente l'applicazione di un modello di fasi: serializzare per commessa, mantenere le fasi esistenti e aggiungere soltanto le fasi/sottofasi mancanti. Segnalare i nomi ripetuti e rendere evidente il comando Elimina fase esistente.
6. Spiegare e collegare costo interno del mezzo, nolo del listino venduto al cliente e spesa/fattura del noleggio. Mostrare errori di caricamento e permettere di iniziare la pianificazione anche senza risorse già presenti.
7. Portare Rapporto trasporti anche nei rapportini della commessa, precompilando commessa e indirizzo, lasciando scegliere il trasportatore destinatario. Riutilizzare l'editor PDF esistente e distinguere il documento manuale dal rendiconto dei viaggi approvati.

## Riscontri iniziali

- Base: `aa2c053a53225b8849d2e0c422464807ad63865e`.
- TypeScript prima delle modifiche: 0 errori, `npm run typecheck:ci`.
- La correzione esistente non aggiunge persone o mezzi e lascia in sola lettura i nomi delle righe; nasconde inoltre gli errori di caricamento dietro Carico.
- L'elenco globale non offre l'annullamento, disponibile soltanto nella commessa; i rapportini respinti non offrono Correggi.
- In Vulcano la commessa 25000068 ha 12 nomi di fase ripetuti quattro volte, creati in quattro applicazioni ravvicinate il 13 novembre. Nessun dato è stato rimosso.
- Rapporto trasporti manuale e rendiconto trasporti esistono già nell'elenco generale dei rapportini; manca il collegamento diretto dalla commessa.
- Health Supabase senza avvisi; nessun evento delle tre RPC individuate nei log Postgres dell'ultima giornata. Advisory globali rilevati, da distinguere dalle modifiche di questo intervento.

## Verifica e rilascio

Test significativi su correzioni, permessi, concorrenza, costi/presenze/mezzi, voci economiche, annullamento, applicazione ripetuta dei modelli e documenti di trasporto. SQL proposto fuori da `supabase/migrations` finché non è pronto e autorizzato; collaudo su database isolato. PR concreta con controlli verdi prima di chiedere l'eventuale migrazione e rilascio. Nessun messaggio o documento inviato a persone durante le prove.

## Chiarimento emerso dal collaudo PDF

Il rapporto trasporti manuale è destinato al trasportatore che conferma i viaggi prima della fattura, come previsto dal modello esistente. Non va intestato automaticamente al cliente della commessa. Il rendiconto dei viaggi approvati resta invece intestato al committente. Etichette e guida riportano questa distinzione.

## Autorizzazione al rilascio

Il 20 novembre 2026 l’utente ha autorizzato migrazione, merge e rilascio della PR 186. La proposta SQL è trasferita in `supabase/migrations/20290422150000_rapportini_modifica_e_fasi_idempotenti.sql`, con aggiornamento del percorso nel test su Postgres isolato. Nessuna pulizia dei dati cliente prevista.

Migrazione applicata via MCP e registro allineato alla versione `20290422150000`. Le impronte dei tre corpi funzione coincidono con il file SQL; accesso anonimo revocato e accesso autenticato esplicito. Health Supabase senza avvisi dopo l’applicazione. I 149 test mirati passano usando il file definitivo della migrazione.
