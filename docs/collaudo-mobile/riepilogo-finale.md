# Collaudo mobile — riepilogo finale (23/11/2026)

Matrice: `docs/collaudo-mobile/matrice.md`, righe 1–86, tutte provate da telefono (390/360 px)
su Demo Azienda 2. Tutto è **in locale**: niente push, niente deploy. L'unica eccezione,
approvata dal founder in chat, è la correzione della schermata bianca
(`useFinancialLive`, commit 051f9b236, già online).

## Cosa è cambiato, in breve

- **Testi**: scala unica 17/15/14/13/12/11. Titoli di pagina a 17px, minimo 11px: le classi
  `text-[9px]`/`text-[10px]` sul telefono sono portate a 11 da `index.css`.
- **Finestre e pannelli**: a pagina intera sul telefono, senza bordi né angoli
  (`dialog.tsx`, `sheet.tsx`).
- **Una sola azione principale per schermata.** Le azioni secondarie vanno nel menu «⋯»:
  scheda DDT, Prima nota, commessa (Proforma/DDT/N. Credito in «Altro»).
- **Niente selettori doppi.** Sul telefono la vista elenco è l'unica:
  - DDT, Sicurezza cantiere, ordini fornitore;
  - in Scadenzario e Prima nota spariscono le caselle di selezione.
- **Elenchi a una riga**:
  - magazzino, con gli articoli a zero nascosti e il bottone «Mostra anche N a zero»;
  - mezzi, DDT, assistenza (ticket chiusi in fondo e senza scadenza).
- **Soldi della commessa**: «questa parte fa cagare». Ora:
  - meno colonne sul telefono e niente etichetta «Azioni»;
  - i filtri stanno su una riga;
  - «Segna incassata» è un bottone solo;
  - l'esposizione si legge in una riga.
- **Numeri in testa** detti in una riga di testo invece di tessere strette: Attività, mezzi,
  scheda cliente.
- **Due guasti veri** sui canali realtime col nome fisso, che facevano cadere la pagina:
  - commessa, già online;
  - statistiche Agenti AI, in locale.

## Dati della vetrina toccati (solo Demo 2, con ok)

Sono descritti in `pulizia-vetrina-2026-11-23.md`, con le query per tornare indietro:
- 720 documenti doppi messi nel cestino (`deleted_at`). Gli id sono in
  `ripristino/demo2-fatture-importate-doppie-ids.txt`.
- 9 fatture «FT/2026/301» rinumerate in 092–100.
- La funzione notturna della vetrina è corretta, così non tronca più i numeri.

## Cosa andrebbe pubblicato

1. **Codice frontend**: i file di questo collaudo, elencati per area nelle righe della
   matrice (colonna «codice»).
   - Nella cartella ci sono anche modifiche di altre sessioni: l'area `/campo`, le mappe del
     calendario e la lingua. Vanno separate, quindi conviene un commit per area.
   - Prima del push: build completa e `scripts/typecheck-ratchet.mjs` su una macchina con più
     memoria. Sul Mac da 8 GB non finiscono.
2. **Due migrazioni già applicate sul database ma senza file su main.** Per questo il
   controllo «Supabase Preview» è rosso:
   - `20290510100000_demo_scenario_numero_fattura`: il file c'è in locale
     (`supabase/migrations/`), basta committarlo;
   - `20290523090000_profiles_lingua`: il file sta sul ramo della lingua (commit 064f23eaf,
     rami `claude/lingua-*` / `campo-lingua-23nov`). Entra con l'unione di quel ramo, che
     fa la sessione «collaudo-campo».
3. **Documenti**: la cartella `docs/collaudo-mobile/`.

## Test che falliscono già, non per questo lavoro

- `dpiEsterni`
- `prodottiSds`
- `bolleSoloFotoUfficio` (etichetta)
- `rataFornitoreDataEffettiva`
- `indirizziUnaRicerca` (file di un'altra sessione)
- un test PDF con emoji

Instabili sotto carico (da soli passano): `hrDocumentiStorage`, `faseCampiProtetti`.

## In attesa del founder

- ~~Nome vero del founder nei ticket della vetrina~~: fatto il 23/11 (4 come cliente, 23 come assegnatario; vedi pulizia-vetrina).
- Il portale del cliente e le pagine admin: per provarli servono accessi dedicati, e gli
  account non vanno creati senza ok.

## Secondo giro (23/11/2026, sera) — in locale, da pubblicare

Righe 87–105 della matrice. Tutto in locale, niente pubblicato:
- Attività (home): agenda, priorità del team, popup «Approva», schede attività.
- Tablet: minimo 11px fino a 1024px e su ogni schermo touch; Assistenza e Manutenzioni senza tabelle laterali.
- Una forma sola da telefono: schede a pillole tonde (componente `Tabs`, `SelettoreSezione`), «+» tondo al posto di «Nuovo», numeri in pillole (`KpiMobili`), bottone filtri a icona.
- Commesse: riepilogo sempre aperto, pillole di stato «Attive · Tutte · …», righe con nome, stato e cliente; sezioni Rapportini, Sopralluoghi (ora con righe da telefono), Acquisti, DDT con lo stesso schema.
- Pagine da scrivania che dal telefono non compaiono (`SoloDaTabletOComputer` + menu App), solo le 5 scelte dal founder: Fabbisogno materiali, Registro incassi, Contabilità generale, Planimetrie (anche dettaglio e stanza), Fiscalità.
- Elenchi lunghi da telefono a blocchi con «Mostra altri»: Fabbisogno, Registro incassi, Fatture ricevute; Firma elettronica a righe.

Decisione del founder (24/11): il nome vero nella vetrina su Manutenzioni e Attività NON si tocca. Restano da guardare: nome vero ancora nella vetrina su 2 impianti delle Manutenzioni, alcune attività del team,
alcune richieste di firma e l'operaio collegato all'account amministratore; «Computo» crea da sé una bozza all'apertura.
