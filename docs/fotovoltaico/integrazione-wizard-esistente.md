# Integrazione nel preventivatore esistente

**Aggiornamento successivo:** [simulazioni, conferma delle modifiche e vista del tetto full black](simulazioni-flusso-e-vista-tetto.md).

Correzione locale del 10 novembre 2026, successiva alla prima anteprima del disegno.

Il disegno è una funzione facoltativa della fase **Configurazione impianto**. La schermata mantiene la testata, le otto fasi, i KPI, Dimensionamento, Modelli da listino, manodopera, servizi, prezzo a corpo, IVA, sconti e l’anteprima economica già esistenti. La prima pagina dimostrativa con testata, prezzi e proposta cliente separati è stata sostituita.

Un riquadro nativo `FvCard` — **Piano di posa (facoltativo)** — contiene il pulsante **Disegna il tetto** o **Modifica disposizione pannelli**. L’editor si apre in un `Dialog` nativo, con un pulsante per tornare alla configurazione. I campi e le righe dell’anteprima originale si aggiornano con le modifiche del disegno. L’esclusione dal PDF conserva il disegno per riprenderlo; aprire e chiudere la finestra senza creare un disegno non cambia la modalità senza mappa. I piani satellitari precedenti restano visibili nel loro componente originale.

## Anteprima locale

http://127.0.0.1:8087/

La pagina monta i componenti reali `Step4Tetto`, `Step5Configurazione`, `FvPageHeader`, `FvTabBar`, `CorpoPreventivatore`, `PannelloAnteprima`, `AnteprimaVeloce` e `FvFooter`. Il percorso dimostrativo riguarda le fasi Tetto e Configurazione; le altre fasi del progetto non sono simulate. Usa un listino di esempio e una bozza nel browser. Gli hook aziendali della sola anteprima restituiscono un contesto senza azienda, disabilitando le query remote; la stima PVGIS usa una località di esempio. Nessun accesso al database di produzione.

Screenshot aggiornati:

- `anteprima-wizard-adattato.png`: la fase Configurazione con riquadro facoltativo e riepilogo nativo.
- `anteprima-disegno-integrato.png`: l’editor nel dialogo del wizard.

## Verifica

- 27 test mirati superati (wizard reale, editor e modalità senza mappa).
- TypeScript mirato su wizard e anteprima: superato.
- ESLint sul componente editor e sui file dell’anteprima: superato.
- Build Vite dell’anteprima con i componenti nativi: superata; avviso sulle dimensioni dei bundle importati dal wizard completo.
- Browser: apertura, creazione, rimozione di un modulo, annullamento, ritorno alla configurazione e corrispondenza con quantità, potenza e totale nell’anteprima originale.

Tutto resta nel ramo locale `codex/fotovoltaico-tetto-facoltativo`. Nessun push o deploy.
