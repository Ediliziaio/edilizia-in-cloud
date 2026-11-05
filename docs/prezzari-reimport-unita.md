# Prezzari regionali: reimport con l'unità di misura

Il 05/11/2026 si è visto che **16 prezzari su 19** in `prezzario_voce` non hanno l'unità di misura
(`unita_misura` NULL su tutte le voci, circa 330.000 voci). Sono stati caricati tutti il 20/06/2026,
in un unico lotto: 11 da leeno.org, gli altri dai siti delle regioni. Il parser trattava l'unità come
facoltativa e importava anche senza riconoscere la colonna.

L'unità resta solo nel testo, a volte composta: Marche 02.03.017* demolizione solai = 3,18 € «al m²
per ogni cm di spessore». Presa per «al m²» sbaglia di 20 volte.

## Cosa cambia nel codice

- `supabase/functions/_shared/prezzarioUnita.ts`: sotto il **90%** di voci valide con l'unità l'import
  si ferma. La Lombardia (93,6%) passa, un file con la colonna non riconosciuta (0%) no.
- Pagina admin «Prezzari regionali»: avviso con il conteggio e conferma esplicita «Importa comunque».
  Senza conferma il pulsante resta spento.
- Edge function `prezzario-import`: stesso controllo, con risposta 422 **prima** di cancellare il
  prezzario esistente. Si passa solo con `consenti_senza_unita: true`.
- Selettore del prezzario (adozione nel listino aziendale): accanto a «Unità del prezziario: non
  indicata» c'è «Come si misura: …».
- Catalogo dei preventivi AI, nel browser (`quoteLocalCatalogue.ts`) e sul server
  (`ai-preventivo-conversazione`): le voci senza unità non spariscono più dalla ricerca. Il server le
  escludeva del tutto (`.not(unita_misura is null)`), quindi per 16 regioni la ricerca per descrizione non
  trovava niente. Ora tornano come candidati di riserva con l'avviso «unità di misura mancante», mai come
  prezzi compatibili.
- Selettore delle voci di tutti i preventivatori e del computo (`ScegliVociListino`: computo,
  ristrutturazione, bagni, tetti, elettrico, termoidraulico, piscine…): una voce del prezzario senza
  unità mostra «unità non indicata».
  Una volta scelta, non si aggiunge finché non si indica l'unità dal menu, accanto a «Come si misura: …».
  L'unità scelta passa per il `mapUnita` del modulo. Prima diventava «cad» in silenzio.

## Prezzari da ricaricare

| Regione | Anno | Voci | Fonte registrata |
|---|---|---|---|
| Piemonte | 2025 | 44.258 | leeno.org |
| Campania | 2025 | 31.723 | leeno.org |
| Calabria | 2025 | 24.594 | leeno.org |
| Emilia-Romagna | 2026 | 23.867 | regione.emilia-romagna.it |
| Toscana (Prov. Firenze) | 2025 | 23.121 | leeno.org |
| Veneto | 2024 | 18.532 | leeno.org |
| Marche | 2025 | 18.521 | leeno.org |
| Basilicata | 2025 | 17.920 | leeno.org |
| Puglia | 2025 | 16.987 | leeno.org |
| Trento (Prov. Aut.) | 2025 | 16.264 | leeno.org |
| Umbria | 2025 | 15.711 | regione.umbria.it |
| Sardegna | 2025 | 14.326 | regione.sardegna.it |
| Bolzano (Prov. Aut.) | 2022 | 11.430 | leeno.org |
| Friuli-Venezia Giulia | 2026 | 9.060 | regione.fvg.it |
| Liguria | 2023 | 9.013 | leeno.org |
| Abruzzo | 2025 | 8.553 | leeno.org |

Sono già a posto: Lombardia 2025 (93,6% con l'unità), Molise 2026 e Sicilia 2024 (100%).

## Come ricaricare

1. Scaricare dal sito della Regione (o della Provincia autonoma) il prezzario dell'anno in **Excel o
   CSV**, nella versione che ha la colonna dell'unità. Le intestazioni riconosciute sono: «U.M.», «UM»,
   «Unità», «Unità di misura», «Misura», «UdM». Se il file ne usa un'altra, va rinominata prima del
   caricamento, oppure aggiunta agli alias in `src/lib/prezzario/import.ts` o in `adapters.ts`.
2. Pagina admin «Prezzari regionali»: stessa **regione, anno e versione** (`ed.1`) della fonte esistente.
   L'edge function riconosce la fonte, ne aggiorna i dati e sostituisce capitoli e voci.
3. Nell'anteprima controllare che compaia il badge «Unità di misura» tra le colonne rilevate e che
   **non** compaia l'avviso «Manca l'unità di misura». Se compare, la colonna non è stata riconosciuta:
   non confermare, sistemare l'intestazione.
4. Dopo l'import, verificare a campione: `select count(*) filter (where unita_misura is not null), count(*)
   from prezzario_voce where fonte_id = '<id>'`.

**Da sapere prima di farlo**

- Il reimport **sostituisce le voci, e i loro id cambiano**. Nessuna tabella ha un vincolo verso
  `prezzario_voce`. Le 290 tariffe già adottate (una sola azienda) sono copie con prezzo e unità propri:
  restano intatte, ma il riferimento `custom_field_values._prezzario.voce_id` non punterà più a una voce
  esistente.
- I file **XPWE di LeenO** (formato PriMus) contengono l'unità nel campo `UnMisura`. La pagina admin
  oggi non legge l'XPWE. Il lettore di `supabase/functions/_shared/computoXpwe.ts` sa già leggere
  `EPItem`, ma per i prezzari va prima provato su un file vero, per non perdere i titoli dei capitoli.
- Non ricavare l'unità con espressioni regolari dal testo: le descrizioni citano densità come «Kg/m³
  13,5», e un'unità sbagliata è peggio di una mancante.
