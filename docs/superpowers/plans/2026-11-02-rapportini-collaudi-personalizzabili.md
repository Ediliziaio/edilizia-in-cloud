# Rapportini e verbali di collaudo personalizzabili per azienda — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni azienda decide da Impostazioni quali parti del rapportino usare, aggiunge i propri campi e crea i propri modelli di verbale di collaudo; senza scelte tutto resta come oggi.

**Architecture:** Una tabella `moduli_cantiere` tiene il modello dell'azienda in un JSON (`schema`). Il rapportino salva i valori in `campo_rapportini.campi_extra`, il verbale in `content.valori` di `order_acceptance_reports`, sempre con etichetta e tipo dentro il valore: ogni documento si legge e si stampa da solo anche se poi il modello cambia. Un solo modulo puro condiviso tra browser e funzioni edge contiene le regole.

**Tech Stack:** React + TanStack Query, Supabase (Postgres, RLS, RPC), edge function Deno, pdf-lib, Vitest.

**Spec:** questo documento, sezioni «Situazione verificata» e «Decisioni». Non esiste un documento separato.

## Situazione verificata (02/11/2026)

**Punti di ingresso del rapportino.** App operaio/capo (`src/pages/campo/CampoRapportino.tsx`, 1.794 righe), inserimento a mano dall'ufficio (`src/components/orders/RapportiniUfficio.tsx` + RPC `ufficio_crea_rapportini`), lettura AI di un documento (`ai-rapportini-da-documento`, passa dalla stessa finestra dell'ufficio), WhatsApp (`whatsapp-ai-processor/tools/operaio/crea_rapportino.ts`), vocale.

**Cosa si può già configurare.** Solo il flusso, in Impostazioni → Rapportini e presenze (`RegoleCampoConfig.tsx`, tabella `campo_regole_azienda`): chi compila, da dove vengono le ore, avviso scostamento, giorni indietro. Le parti del modulo sono fisse.

**I «collaudi» oggi sono due cose diverse.**
- *Collaudi firmati in cantiere* (`CollaudiDalCantiere.tsx`): un rapportino con `lavoro_completato` o firma. In produzione nessun rapportino ha una firma cliente.
- *Verbale di verifica e consegna* (`OrderAcceptanceReports.tsx`, edge `collaudo-commessa`, tabella `order_acceptance_reports`): lo fa l'ufficio. Le 4 voci sono fisse in `emptyAcceptance`, ma `content.checks` è già salvato come elenco con la sua etichetta, quindi il formato regge voci diverse.

**Il verbale non si firma.** Il PDF dice «EDIZIONE NON FIRMATA» e la firma elettronica non è collegata. L'edge chiede `can_edit_orders` anche per salvare, e la lettura diretta chiede `can_view_orders`: oggi un capocantiere non può usarlo.

**Dati reali.** 4.226 rapportini, di cui 4.223 nelle due aziende Demo e 3 in aziende reali; 378 scritti da subappaltatori; solo 5 risultano dall'app. 145 verbali, 144 Demo e 1 reale. Il blocco mezzi è usato in 1 solo rapportino. `rapportini_intervento` ha 0 righe. Operai assegnati ai cantieri in 3 aziende su 32. Il rischio di migrare dati è quasi nullo; i rischi veri sono cambiare il flusso a chi non ha scelto nulla e costruire una configurazione che nessuno usa: un'azienda deve arrivare a un modulo pronto in un minuto.

**App nativa.** `capacitor.config.ts` non ha un indirizzo remoto: l'app contiene il suo codice, quindi i campi nuovi arrivano ai telefoni solo con una nuova release.

**Perché non si riusano i campi personalizzati esistenti** (`marketing_custom_fields` + `entity_custom_field_values`):
- `cf_can_access` richiede un permesso d'ufficio: un operaio senza `can_edit_orders` verrebbe rifiutato.
- Il valore sarebbe una seconda scrittura separata dal rapportino: se la prima riesce e la seconda no, il dato si perde.
- L'oggetto `rapportino` in `src/lib/custom-fields/objects.ts` significa già «Rapportino Intervento» e non è mostrato da nessuna scheda.
- In produzione i campi esistenti sono solo 32 sui contatti, di una sola azienda: non c'è una base da preservare.

**Cosa si riusa.** `FieldRenderer` dei sopralluoghi (`src/components/surveys/engine/FieldRenderer.tsx`: campi controllati da `value`/`onChange`, senza scritture proprie) e il modo in cui `fasi_lavorate` conserva il nome dentro la voce.

## Decisioni

1. **Tre livelli, in quest'ordine di semplicità:** parti standard accese/spente, campi propri dell'azienda, modelli di verbale.
2. **Sempre presenti e non spegnibili:** ore e descrizione. Le ore alimentano costi e paghe; la descrizione è richiesta dall'RPC dell'ufficio e dal PDF.
3. **Spegnibili:** `fasi`, `materiali`, `mezzi`, `foto`, `straordinario`, `avanzamento`. Spegnere nasconde solo l'inserimento: i dati già scritti restano leggibili e stampati. L'impostazione avvisa delle conseguenze:
   - `materiali`: «Il consumo materiali della commessa non si aggiorna più dai rapportini.»
   - `mezzi`: «Le giornate e i costi dei mezzi non si registrano più dai rapportini.»
   - `fasi`: «Avanzamento fasi e cronoprogramma non si aggiornano più dai rapportini.»
   - `avanzamento`: «La percentuale di avanzamento non si aggiorna più dai rapportini.»
4. **Un modello di rapportino per azienda; più modelli di verbale** (es. Serramenti, Fotovoltaico), scelti alla creazione.
5. **Tipi di campo:** testo, testo lungo, numero, data, una scelta, più scelte, sì/no.
6. **Per ogni campo:** etichetta, tipo, obbligatorio, opzioni, unità di misura per i numeri, e queste scelte:
   - `chi`: `tutti` o `capo`;
   - `ditte`: `tutti`, `dipendenti` o `subappaltatori`;
   - `quando`: `giornaliero`, `fine_lavori` o `sempre`;
   - `livello`: `rapportino` o `fase`;
   - `stampa`: `mai`, `interno` o `cliente`.
7. **Obbligatorio vale nell'app e nella finestra dell'ufficio, non sul server.** WhatsApp, vocale, AI e versioni vecchie dell'app non conoscono i campi: non vanno bloccati. Il rapportino arriva e l'ufficio vede «Da completare: …», può compilarlo e può comunque approvare.
8. **Il modello si copia nel documento.** `ValoreCampo` contiene etichetta e tipo: rinominare o eliminare un campo non altera i rapportini passati.
9. **Il verbale si può compilare e far firmare anche in cantiere**, solo dal capocantiere interno assegnato alla commessa e solo se il modello ha `dal_cantiere` attivo. Senza il cliente presente il capo salva la bozza e la chiude l'ufficio. Il rapportino di fine lavori resta com'è, personalizzato dai campi con `quando = fine_lavori`.
10. **Modelli di partenza** per non partire da zero: rapportino Edile, Serramenti, Impianti; verbale Generico, Serramenti, Fotovoltaico, Impianti.
11. **Si modifica da tablet e computer** (`desktopOnly`, come Integrazioni); il telefono compila soltanto.
12. **Firma del verbale su schermo:** il cliente firma col dito, si salvano immagine, nome, data e chi l'ha raccolta, e la firma entra nel PDF prima di congelarlo. Non è la firma elettronica FEA e il documento non lo presenta come tale.
13. **I numeri servono:** per ogni commessa si vedono il totale dei campi numero e il conteggio dei sì, separando approvati e da approvare. Tutti i campi escono in un Excel, una riga per rapportino.
14. **Campi per fase:** con `livello = fase` il campo si compila una volta per ogni fase lavorata e il valore si salva in `campi_extra` con `phase_id` e nome della fase, non in `fasi_lavorate`, che alimenta l'avanzamento. Con il blocco fasi spento, o senza fasi, si compila una volta sul rapportino.
15. **Chi compila dipende dal flusso già scelto:**
    - `ognuno`: ciascuno compila i suoi campi;
    - `capo`: gli operai non hanno il modulo, i campi li compila il capo;
    - `ore_proprie`: l'operaio manda solo le ore, senza campi, e il resto è del capo;
    - le parti spente valgono anche per i subappaltatori;
    - l'ufficio vede tutti i campi.
16. **Interno o cliente:** il PDF di un rapportino di fine lavori o firmato è un documento per il cliente e stampa solo `cliente`. Il giornaliero stampa `interno` e `cliente`. Il verbale stampa solo `cliente`; gli altri valori restano visibili nell'app.
17. **Modifiche a un modello già usato:** il tipo di un campo con dati non si cambia, né il suo passaggio tra rapportino e fase, e il server lo rifiuta. Eliminare un campo con dati lo archivia: non si compila più, ma i dati e i totali restano e la sua chiave non si riusa. Togliere un'opzione non tocca i valori già scritti.

**Fuori da questo piano** (lo schema li permette dopo):
- firma elettronica FEA sul verbale
- filtro dei rapportini per valore di un campo
- righe ripetibili (es. «Finestra 1, 2, 3»)
- reazioni automatiche a un valore (avvisi, attività)
- campi foto e firma personalizzati
- campi che compaiono in base a un altro campo
- modello diverso per tipo di commessa
- AI e WhatsApp che compilano i campi propri
- campi propri in giornale lavori, Silvio ed esportazioni
- rapportini di intervento (`TecnicoRapportino`), oggi senza dati

## Global Constraints

- Senza riga in `moduli_cantiere` il comportamento è identico a oggi: `SCHEMA_COME_OGGI` ha tutti i blocchi accesi e nessun campo, e il capocantiere non vede il verbale.
- Non si scrive mai «firma elettronica», «firma qualificata» o «a norma» per la firma su schermo, né si presentano i modelli pronti come documenti a norma.
- Testi in italiano, una sola scheda per dato (nessuna sezione doppione: i campi vanno dove il dato già sta).
- Da telefono: denso, niente testi descrittivi aggiuntivi, campi a 14px, verifica a 375 px.
- Modulo condiviso con import relativi con estensione `.ts` (Deno); in Deno niente alias `@/`.
- Permessi modello: lettura `can_view_settings_orders`, scrittura `can_edit_settings_orders`, sempre con `has_permission_for_company`, mai `has_permission`.
- Migrazioni con versione libera sopra l'ultima di produzione; controllare `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` subito prima del push. Mai `supabase db push`.
- **Blocco da risolvere prima di pubblicare:** al 02/11 «Supabase Preview» è rosso perché in produzione c'è `20281106160000_documenti_azienda_conta_versioni` senza file su main. Questo piano contiene migrazioni: se il controllo è ancora rosso al momento del push, fermarsi e chiedere all'utente.
- Push su main solo su richiesta esplicita; cambiando le edge `genera-pdf-rapportino` e `collaudo-commessa` il deploy passa dal CI.

## Review Focus

1. **Rapportino respinto con materiali, mezzi o foto già scritti, e blocco spento dopo:** al rimando i dati non si cancellano. → Task 3.
2. **Campo rinominato o eliminato dopo l'invio:** il rapportino vecchio mostra e stampa ancora etichetta e valore originali; riaprendo un respinto il valore del campo eliminato resta. → Task 1 e Task 3.
3. **App vecchia o database senza la RPC:** l'operaio compila come oggi, senza errori. → Task 2.
4. **Operaio con un capo sopra e campo obbligatorio:** il campo si vede nel passo principale, non chiuso dentro «Altro da segnalare», e non gli vengono chiesti i campi del capo. → Task 3.
5. **Bozza salvata e ripresa, anche con il modello cambiato nel frattempo:** i valori tornano e le chiavi non più nel modello non fanno fallire l'invio. → Task 3.
6. **Fase tolta dal rapportino dopo aver compilato il suo campo:** il valore non resta appeso a una fase non lavorata, e l'obbligatorio di quella fase non blocca l'invio. → Task 7.
7. **Campo interno su un documento per il cliente:** non si stampa mai, nemmeno se il rapportino diventa di fine lavori dopo la prima generazione del PDF. → Task 6.
8. **Due persone che chiudono lo stesso verbale, o verbale modificato tra anteprima e firma:** una sola riesce, l'altra riceve un errore chiaro, e la firma non finisce su un testo che il cliente non ha visto. → Task 9.
9. **Capo tolto dalla commessa, o capo di un'altra azienda, che chiama direttamente la funzione:** rifiutato. → Task 10.

---

## Mappa dei file

| File | Responsabilità |
|---|---|
| `supabase/functions/_shared/moduliCantiere.ts` | Nuovo. Tipi e regole pure; lo importano browser e edge |
| `src/lib/campo/moduliPreset.ts` | Nuovo. Modelli di partenza |
| `supabase/migrations/<versione>_moduli_cantiere.sql` | Nuovo. Tabella, RPC, colonna, RPC ufficio |
| `src/hooks/useModuliCantiere.ts` | Nuovo. Lettura e salvataggio |
| `src/components/settings/ModuliCantiereConfig.tsx` | Nuovo. Pagina impostazioni |
| `src/components/campo/CampiModulo.tsx` | Nuovo. Compilazione dei campi |
| `src/components/campo/CampiModuloLettura.tsx` | Nuovo. Lettura dei valori |
| `src/components/orders/TotaliCampiCommessa.tsx` | Nuovo. Totali dei campi per commessa |
| `src/lib/campo/esportaRapportini.ts` | Nuovo. Excel dei rapportini |
| `src/components/orders/FirmaVerbaleDialog.tsx` | Nuovo. Firma del cliente sul verbale |
| `src/pages/campo/CampoVerbale.tsx` | Nuovo. Verbale dal telefono del capo |

---

### Task 1: Regole pure del modulo

**Files:**
- Create: `supabase/functions/_shared/moduliCantiere.ts`
- Create: `src/lib/campo/moduliPreset.ts`
- Test: `src/test/logic/moduliCantiere.test.ts`

**Interfaces:**
- Produces:
```ts
export type BloccoStandard = "fasi" | "materiali" | "mezzi" | "foto" | "straordinario" | "avanzamento";
export type TipoCampo = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "boolean";
export type Stampa = "mai" | "interno" | "cliente";
export interface CampoModulo { chiave: string; etichetta: string; tipo: TipoCampo; obbligatorio: boolean; opzioni?: string[]; aiuto?: string; unita?: string; chi: "tutti" | "capo"; ditte: "tutti" | "dipendenti" | "subappaltatori"; quando: "giornaliero" | "fine_lavori" | "sempre"; livello: "rapportino" | "fase"; stampa: Stampa; archiviato?: boolean; }
export interface ModuloSchema { formato: 1; blocchi: Record<BloccoStandard, boolean>; campi: CampoModulo[]; voci?: string[]; titolo?: string; dal_cantiere?: boolean; }
export interface ValoreCampo { chiave: string; etichetta: string; tipo: TipoCampo; valore: string | number | boolean | string[]; stampa: Stampa; unita?: string; phase_id?: string; fase_nome?: string; }
export interface FaseScelta { id: string; nome: string; }
export interface ContestoCampi { ruolo: "operaio" | "capo" | "ufficio"; momento: "giornaliero" | "fine_lavori"; subappaltatore: boolean; soloOre: boolean; }
export const SCHEMA_COME_OGGI: ModuloSchema;
export function leggiSchema(raw: unknown): ModuloSchema;
export function validaSchema(s: ModuloSchema): string[];
export function validaModifica(prima: ModuloSchema, dopo: ModuloSchema, uso: Record<string, number>): string[];
export function chiaveDaEtichetta(etichetta: string, esistenti: string[]): string;
export function chiaveValore(chiave: string, phaseId?: string): string;
export function campiPerContesto(s: ModuloSchema, c: ContestoCampi): CampoModulo[];
export function componiValori(campi: CampoModulo[], valori: Record<string, unknown>, precedenti?: ValoreCampo[], fasi?: FaseScelta[]): ValoreCampo[];
export function valoriInBozza(precedenti: ValoreCampo[]): Record<string, unknown>;
export function mancanti(campi: CampoModulo[], valori: Record<string, unknown>, fasi?: FaseScelta[]): string[];
export function valoreInTesto(v: ValoreCampo): string;
export function leggiValori(raw: unknown): ValoreCampo[];
export function valoriDaStampare(valori: ValoreCampo[], documento: "interno" | "cliente"): ValoreCampo[];
```
- `src/lib/campo/moduliPreset.ts` esporta `PRESET_RAPPORTINO` e `PRESET_VERBALE`: `Array<{ id: string; nome: string; schema: ModuloSchema }>`.

- [ ] **Step 1: Scrivere i test che falliscono**, con questi nomi e attese:
  - `leggiSchema(null)` è uguale a `SCHEMA_COME_OGGI`; un blocco mancante o non booleano vale `true`; un campo con tipo sconosciuto viene scartato; le scelte mancanti valgono `chi: "tutti"`, `ditte: "tutti"`, `quando: "sempre"`, `livello: "rapportino"`, `stampa: "interno"`.
  - `validaModifica`: errore se cambia il tipo di una chiave con `uso > 0`; nessun errore se `uso` è 0; errore se una chiave con `uso > 0` sparisce invece di essere `archiviato`; nessun errore togliendo un'opzione.
  - `chiaveDaEtichetta` considera anche le chiavi archiviate, così una chiave non si riusa.
  - `campiPerContesto`: `archiviato` è sempre escluso, anche per `ufficio`; `soloOre: true` restituisce `[]`; `ditte: "dipendenti"` è escluso con `subappaltatore: true`, `ditte: "subappaltatori"` con `subappaltatore: false`; per `ufficio` il filtro `ditte` non si applica.
  - `componiValori` con `livello: "fase"` e due fasi produce due valori con `phase_id` e `fase_nome`; senza fasi produce un valore sul rapportino; non produce valori per fasi non più scelte.
  - `mancanti` con `livello: "fase"` nomina la fase: `"Pezzi posati (Posa infissi)"`.
  - `valoriDaStampare(v, "cliente")` tiene solo `cliente`; con `"interno"` tiene `interno` e `cliente`; `mai` non esce mai.
  - `validaSchema`: errore con più di 30 campi, etichetta vuota o oltre 80 caratteri, `select`/`multiselect` senza opzioni, chiavi doppie, più di 40 voci.
  - `chiaveDaEtichetta("Mezzi usati", ["mezzi_usati"])` è `"mezzi_usati_2"`.
  - `campiPerContesto`: `operaio` non riceve `chi: "capo"`; `ufficio` riceve tutti; `momento: "giornaliero"` esclude `quando: "fine_lavori"`.
  - `componiValori` scarta vuoti, `[]` e stringhe di soli spazi, tiene `false` e `0`, copia etichetta, tipo, stampa e unità dal campo.
  - `componiValori` conserva da `precedenti` un valore la cui chiave non è più tra i campi (Review Focus 2), con la vecchia etichetta.
  - `mancanti` restituisce le etichette degli obbligatori vuoti; per un `boolean` obbligatorio `false` conta come compilato.
  - `valoreInTesto`: `true` → `"Sì"`, `["a","b"]` → `"a, b"`, `"2026-11-02"` di tipo date → `"02/11/2026"`, `1234.5` → `"1.234,5"`.
  - `leggiValori("x")` è `[]`; elementi senza chiave vengono scartati.
  - Ogni preset supera `validaSchema` senza errori.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/logic/moduliCantiere.test.ts`
Expected: FAIL, modulo non trovato.

- [ ] **Step 3: Implementare modulo e preset.** Voci dei preset di verbale:
  - Generico: le 4 voci attuali di `emptyAcceptance`, invariate.
  - Serramenti: «Apertura e chiusura ante», «Tenuta e guarnizioni», «Sigillature e finiture», «Vetri integri», «Ferramenta e maniglie», «Documenti e istruzioni consegnati».
  - Fotovoltaico: «Moduli e fissaggi», «Quadri e protezioni», «Inverter in funzione», «Messa a terra», «Monitoraggio attivo», «Documenti e istruzioni consegnati».
  - Impianti: «Prova di funzionamento», «Prova di tenuta», «Regolazioni e parametri», «Pulizia e ripristino degli ambienti», «Documenti e istruzioni consegnati».

  Campi dei preset di rapportino:
  - Edile: `Sicurezza verificata` (sì/no), `Problemi riscontrati` (testo lungo).
  - Serramenti: `Pezzi posati` (numero, unità `pz`, per fase), `Misure da ricontrollare` (testo lungo), `Sigillatura eseguita` (sì/no).
  - Impianti: `Prova eseguita` (sì/no), `Esito prova` (scelta: Positivo, Negativo, Da ripetere), `Codice impianto` (testo).

  I preset di verbale hanno `dal_cantiere: true`.

- [ ] **Step 4: Verificare che passino**

Run: `npx vitest run src/test/logic/moduliCantiere.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/moduliCantiere.ts src/lib/campo/moduliPreset.ts src/test/logic/moduliCantiere.test.ts
git commit -m "Moduli di cantiere: regole pure e modelli di partenza"
```

### Task 2: Database, RPC e letture

**Files:**
- Create: `supabase/migrations/<versione>_moduli_cantiere.sql`
- Create: `src/hooks/useModuliCantiere.ts`
- Modify: `src/integrations/supabase/types.ts`
- Test: `src/test/logic/moduliCantiereMigrazione.test.ts`, `src/test/logic/useModuloRapportino.test.ts`

**Interfaces:**
- Consumes: `leggiSchema`, `SCHEMA_COME_OGGI`, `ModuloSchema`.
- Produces:
  - Tabella `moduli_cantiere(id uuid pk, company_id uuid fk, tipo text check in ('rapportino','verbale'), nome text not null, schema jsonb not null, attivo boolean default true, aggiornato_il timestamptz, aggiornato_da uuid, deleted_at timestamptz)`, con indice unico `(company_id) where tipo='rapportino' and deleted_at is null`.
  - Colonna `campo_rapportini.campi_extra jsonb not null default '[]'`.
  - RPC `modulo_rapportino_per_ordine(p_order_id uuid) returns jsonb`: security definer, stessi controlli di accesso di `campo_regole_per_ordine`; restituisce lo `schema` o `null`.
  - RPC `moduli_cantiere_salva(p_company_id uuid, p_id uuid, p_tipo text, p_nome text, p_schema jsonb, p_attivo boolean) returns uuid`: rifiuta con `22023` e testo italiano il cambio di tipo di una chiave già usata.
  - RPC `moduli_cantiere_uso(p_company_id uuid, p_id uuid) returns jsonb`: `{ chiave: quanti documenti la contengono }`, da `campi_extra` per il rapportino e da `content->'valori'` per il verbale.
  - RPC `ufficio_crea_rapportini` estesa: legge `r->'campi_extra'`.
  - Hook: `useModuloRapportino(orderId: string | undefined): { schema: ModuloSchema; isLoading: boolean }`, `useModuliAzienda(companyId, tipo)`, `useSalvaModulo(companyId)`.

- [ ] **Step 1: Scrivere i test che falliscono**
  - Sulla migrazione: esiste `enable row level security`; la policy di lettura usa `has_permission_for_company` con `can_view_settings_orders`; non esistono policy di scrittura dirette; `moduli_cantiere_salva` controlla `can_edit_settings_orders`, `utente_sola_lettura` e `assert_company_access`; `revoke ... from public, anon`; il vincolo su `campi_extra` impone array e al massimo 32 KB.
  - `ufficio_crea_rapportini` conserva tutti i campi della versione `20281031235000` (presenze, foto, materiali, mezzi, meteo) e controlla ancora `can_edit_orders`.
  - `moduli_cantiere_salva` contiene il controllo sul cambio di tipo e l'errore `22023`; `moduli_cantiere_uso` controlla `can_view_settings_orders`.
  - Hook (Review Focus 3): con errore `PGRST202` o `42883` restituisce `SCHEMA_COME_OGGI` senza errore; con `null` idem; con altro errore restituisce `SCHEMA_COME_OGGI` ma non lo mette in cache (`staleTime` 0).

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/logic/moduliCantiereMigrazione.test.ts src/test/logic/useModuloRapportino.test.ts`
Expected: FAIL.

- [ ] **Step 3: Scrivere la migrazione.** Partire dal testo di `20281031235000_ufficio_rapportini_completi.sql`, aggiungendo `campi_extra` all'insert; un valore non array diventa `[]`. Partire da `campo_regole_azienda_salva` e `campo_regole_per_ordine` (`20281018200000`, `20281018180000`) per i controlli. Il subappaltatore assegnato deve leggere lo schema dell'azienda della commessa, non della propria.

- [ ] **Step 4: Scrivere gli hook.** Stesso schema di `useRapportinoProtocollo` per la compatibilità con il database. `useSalvaModulo` invalida anche `["modulo-rapportino"]`.

- [ ] **Step 5: Provare le RPC in produzione senza lasciare dati**, con un blocco `DO` che finisce in `RAISE EXCEPTION`, sulla Demo `778a2c76-1253-49f2-a5e8-283363ac3e29` con il titolare `0a5dd3d4-05fe-4caa-b393-2b29f804cb1a`: salvataggio riuscito; rifiuto senza permesso; rifiuto su un'altra azienda. Si esegue dopo l'applicazione della migrazione, nel Task 7.

- [ ] **Step 6: Verificare che i test passino**

Run: `npx vitest run src/test/logic/moduliCantiereMigrazione.test.ts src/test/logic/useModuloRapportino.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/hooks/useModuliCantiere.ts src/integrations/supabase/types.ts src/test/logic/moduliCantiereMigrazione.test.ts src/test/logic/useModuloRapportino.test.ts
git commit -m "Moduli di cantiere: tabella, permessi e lettura dalla commessa"
```

### Task 3: Compilazione nell'app di cantiere

**Files:**
- Create: `src/components/campo/CampiModulo.tsx`
- Modify: `src/pages/campo/CampoRapportino.tsx`
- Test: `src/test/ui/campoRapportinoModulo.test.tsx`

**Interfaces:**
- Consumes: `useModuloRapportino`, `campiPerContesto`, `componiValori`, `valoriInBozza`, `mancanti`.
- Produces: `<CampiModulo campi={CampoModulo[]} valori={Record<string, unknown>} onChange={(chiave, valore) => void} mostraErrori={boolean} />`. Converte `CampoModulo` in `FieldDefinition` e usa `FieldRenderer`; le opzioni diventano `{ value, label }` con lo stesso testo.

- [ ] **Step 1: Scrivere i test che falliscono**
  - Con `SCHEMA_COME_OGGI` il modulo mostra gli stessi blocchi di oggi e l'insert non contiene valori extra (`campi_extra` assente o `[]`).
  - `blocchi.mezzi = false` nasconde «Mezzi e attrezzi» e non chiama `campo_mezzi_fine_giornata`.
  - `blocchi.foto = false` nasconde il caricamento delle foto.
  - Operaio con capo e campo obbligatorio `chi: "tutti"`: il campo è visibile senza aprire «Altro da segnalare»; l'invio è bloccato finché è vuoto, con il messaggio «Compila: <etichetta>». Il campo `chi: "capo"` non compare (Review Focus 4).
  - Campo `quando: "fine_lavori"`: compare solo nel percorso `lavoro_completato`.
  - Flusso `ore_proprie`: l'operaio con un responsabile non vede campi propri e può inviare; il responsabile li vede.
  - Subappaltatore: non vede `ditte: "dipendenti"`, vede `ditte: "subappaltatori"`; `role_type` resta `subcontractor`.
  - Respinto con materiali e foto, blocchi spenti: l'update mantiene `materiali_usati` e `foto_urls` originali (Review Focus 1).
  - Respinto con un valore di campo eliminato: l'update lo conserva in `campi_extra` (Review Focus 2).
  - Bozza con una chiave non più nel modello: si riprende e l'invio riesce (Review Focus 5).

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/ui/campoRapportinoModulo.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Collegare il modulo in `CampoRapportino.tsx`:**
  - i blocchi si condizionano dove sono già definiti: `bloccoFasi` (riga ~1047), `bloccoMateriali` (~1168), `bloccoMezzi` (~1293), avanzamento e straordinario;
  - se un blocco è spento e il rapportino viene riaperto, l'update non scrive quel campo, invece di scriverlo vuoto;
  - `valoriCampi` entra in `bozzaCorrente` (riga ~276) e nel ripristino (~289);
  - `campi_extra` entra in `campi` per insert e update (righe ~728–770); nel ripristino di un respinto si usa `valoriInBozza(leggiValori(r.campi_extra))`;
  - il controllo `mancanti` va insieme alle validazioni esistenti prima dell'invio;
  - la select del rapportino esistente (riga ~339) aggiunge `campi_extra`;
  - il contesto passato a `campiPerContesto` nasce dal `flusso` già calcolato (`flussoPersona`, riga ~239): `ruolo` è `capo` per capocantiere e caposquadra e per chi lavora senza un capo nominato, `operaio` altrimenti; `soloOre` è vero per l'operaio nel flusso `ore_proprie`; `subappaltatore` viene da `useIsCampo`; `momento` è `fine_lavori` nel percorso `tipo="client"`.
  - in questo task si gestiscono solo i campi `livello: "rapportino"`; quelli per fase arrivano nel Task 7 e fino ad allora si compilano sul rapportino.

- [ ] **Step 4: Verificare che passino, insieme ai test esistenti del rapportino**

Run: `npx vitest run src/test/ui/campoRapportinoModulo.test.tsx src/test/ui/campoRapportinoRegole.test.tsx src/test/ui/campoRapportinoMaterials.test.tsx src/test/ui/campoRapportinoFasiCollegate.test.tsx src/test/ui/campoRapportinoVoceCantiere.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/campo/CampiModulo.tsx src/pages/campo/CampoRapportino.tsx src/test/ui/campoRapportinoModulo.test.tsx
git commit -m "Rapportino di cantiere: parti e campi scelti dall'azienda"
```

### Task 4: Inserimento a mano dall'ufficio e lettura

**Files:**
- Create: `src/components/campo/CampiModuloLettura.tsx`
- Modify: `src/components/orders/RapportiniUfficio.tsx`, `src/lib/campo/rapportiniUfficio.ts`, `src/components/orders/OrdineRapportiniCampo.tsx`, `src/components/campo/RapportinoBlocchi.tsx`
- Test: `src/test/logic/rapportiniUfficio.test.ts`, `src/test/ui/rapportiniUfficio.test.tsx`, `src/test/ui/rapportinoCampiModulo.test.tsx`

**Interfaces:**
- Consumes: `CampiModulo`, `useModuloRapportino`, `leggiValori`, `valoreInTesto`, `componiValori`, `mancanti`.
- Produces:
  - `<CampiModuloLettura valori={ValoreCampo[]} />`.
  - Il tipo della bozza dell'ufficio ottiene `campi?: Record<string, unknown>`.
  - La riga inviata a `ufficio_crea_rapportini` ottiene `campi_extra: ValoreCampo[]`.

- [ ] **Step 1: Scrivere i test che falliscono**
  - La bozza dell'ufficio con campi produce `campi_extra` con etichetta e tipo; la validazione esistente segnala l'obbligatorio vuoto con la data della giornata.
  - `giornoVuoto` (il giorno aggiunto dopo il precedente) non copia i campi propri.
  - I blocchi spenti non compaiono nella finestra dell'ufficio.
  - Un rapportino già scritto mostra i dati anche se il blocco ora è spento.
  - Un rapportino da WhatsApp senza valori, con campi obbligatori nel modello, mostra «Da completare: …» e il pulsante Approva resta attivo (decisione 7).
  - L'ufficio con `can_edit_orders` completa e salva con update su `campi_extra`, solo se `approvato = false`.
  - `CampiModuloLettura` non mostra nulla con `[]`.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/logic/rapportiniUfficio.test.ts src/test/ui/rapportiniUfficio.test.tsx src/test/ui/rapportinoCampiModulo.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementare.** La lettura AI di un documento lascia i campi vuoti: l'ufficio li completa nella stessa finestra di controllo. `CampiModuloLettura` si inserisce in `RapportinoBlocchi` nella vista completa; nella vista compatta non compare.

- [ ] **Step 4: Verificare che passino**

Run: `npx vitest run src/test/logic/rapportiniUfficio.test.ts src/test/logic/rapportiniDaDocumento.test.ts src/test/ui/rapportiniUfficio.test.tsx src/test/ui/rapportinoCampiModulo.test.tsx src/test/ui/rapportinoBlocchi.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/campo/CampiModuloLettura.tsx src/components/orders/RapportiniUfficio.tsx src/lib/campo/rapportiniUfficio.ts src/components/orders/OrdineRapportiniCampo.tsx src/components/campo/RapportinoBlocchi.tsx src/test
git commit -m "Rapportini dall'ufficio: stessi campi dell'app e completamento"
```

### Task 5: Pagina delle impostazioni

**Files:**
- Create: `src/components/settings/ModuliCantiereConfig.tsx`
- Modify: `src/components/settings/RegoleCampoConfig.tsx`, `src/components/settings/RegoleCampoAnteprima.tsx`, `src/lib/impostazioni/indiceImpostazioni.ts`, `src/lib/impostazioni/titoliImpostazioni.ts`
- Test: `src/test/ui/moduliCantiereConfig.test.tsx`

**Interfaces:**
- Consumes: `useModuliAzienda`, `useSalvaModulo`, `moduli_cantiere_uso`, `validaSchema`, `validaModifica`, `chiaveDaEtichetta`, `PRESET_RAPPORTINO`, `PRESET_VERBALE`.
- Produces: `<ModuliCantiereConfig tipo="rapportino" | "verbale" />`, inserito come nuove sezioni di Rapportini e presenze: «Parti del rapportino», «Campi propri», «Verbali di collaudo». Non serve una voce nuova nel menu.

- [ ] **Step 1: Scrivere i test che falliscono**
  - Senza permesso di modifica tutto è in sola lettura e non parte alcun salvataggio.
  - Spegnere `materiali`, `mezzi`, `fasi`, `avanzamento` mostra il testo esatto della decisione 3.
  - Ore e descrizione compaiono come sempre attive, senza interruttore.
  - Aggiungere un campo genera la chiave; rinominarlo non cambia la chiave.
  - Un campo con dati ha il tipo bloccato, con il testo «Il tipo non si cambia: {n} documenti contengono già questo campo.».
  - Eliminare un campo con dati lo archivia dopo conferma e resta in un elenco «Archiviati» da cui si può riattivare; senza dati si elimina davvero.
  - L'editor mostra le scelte `chi`, `ditte`, `quando`, `livello`, `stampa` con questi testi: «Chi lo compila» (Tutti, Solo il capo), «Quali ditte» (Tutte, Dipendenti, Subappaltatori), «Quando» (Sempre, Ogni giorno, A fine lavori), «Dove» (Sul rapportino, Per ogni fase), «Nel PDF» (Mai, Solo interno, Anche per il cliente).
  - Il campo unità compare solo per i numeri; «Compilabile dal capo in cantiere» compare solo per i verbali e imposta `dal_cantiere`.
  - `select` senza opzioni blocca il salvataggio con l'errore di `validaSchema`.
  - Scegliere un preset riempie la bozza senza salvare; se c'è già un modello chiede conferma prima di sostituire.
  - Senza modelli di verbale attivi, «Nuovo verbale» usa le 4 voci di oggi.
  - L'anteprima mostra il modulo con la vista operaio e con la vista capo, senza scrivere dati.
  - Da telefono (`useIsMobile` true) la sezione non offre modifiche.
  - Uscire con modifiche non salvate chiede conferma, con `useSettingsDraftGuard` come il resto della pagina.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/ui/moduliCantiereConfig.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementare.** Riordino dei campi con pulsanti su/giù, senza librerie nuove. Aggiungere a `SEZIONI` di `RegoleCampoConfig` le tre sezioni, e le parole chiave «campi personalizzati», «mezzi», «collaudo», «verbale» all'indice. Aggiornare la descrizione in `titoliImpostazioni.ts` in «Come lavorano i tuoi cantieri: chi compila, cosa si compila e i verbali di collaudo».

- [ ] **Step 4: Verificare che passino**

Run: `npx vitest run src/test/ui/moduliCantiereConfig.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings src/lib/impostazioni src/test/ui/moduliCantiereConfig.test.tsx
git commit -m "Impostazioni: parti del rapportino, campi propri e modelli di verbale"
```

### Task 6: PDF e verbali di collaudo

**Files:**
- Modify: `supabase/functions/genera-pdf-rapportino/render.ts`
- Modify: `supabase/functions/collaudo-commessa/model.ts`, `supabase/functions/collaudo-commessa/render.ts`
- Modify: `src/components/orders/OrderAcceptanceReports.tsx`
- Test: `src/test/logic/rapportinoPdfBlocchi.test.ts`, `src/test/logic/orderAcceptance.test.ts`, `src/test/ui/orderAcceptance.test.tsx`

**Interfaces:**
- Consumes: `leggiValori`, `valoreInTesto`, `valoriDaStampare`, `ValoreCampo`, `CampiModulo`, `useModuliAzienda`.
- Produces:
  - `AcceptanceContent` ottiene `campi?: CampoModulo[]`, `valori?: ValoreCampo[]` e `obbligatori?: string[]`, tutti facoltativi. `campi` è la copia del modello presa alla creazione.
  - `export function acceptanceDaModello(date: string, modello: ModuloSchema | null): AcceptanceContent`: con `null` è identica a `emptyAcceptance(date)`.

- [ ] **Step 1: Scrivere i test che falliscono**
  - Il PDF del rapportino stampa una sezione «Altre informazioni» con etichetta e valore: un giornaliero usa `valoriDaStampare(v, "interno")`, un rapportino con `lavoro_completato` o firma cliente usa `valoriDaStampare(v, "cliente")` (Review Focus 7); senza valori la sezione manca; un testo lungo va a capo e cambia pagina senza tagli.
  - Il PDF del verbale stampa solo i valori `cliente`; gli altri restano in `content.valori`.
  - Un rapportino che diventa di fine lavori azzera `pdf_url`, così il PDF interno già generato non resta in circolazione.
  - `acceptanceDaModello(d, null)` è uguale a `emptyAcceptance(d)`.
  - Con un modello: titolo, voci e campi vengono dal modello; ogni voce parte `pending`.
  - `validateAcceptance` accetta un verbale vecchio senza `campi` e rifiuta `campi` non in formato.
  - La chiusura del verbale con obbligatori vuoti è rifiutata, con le etichette nell'errore.
  - Un verbale chiuso resta immutabile, con lo stesso hash, anche se il modello cambia.
  - Con più modelli attivi «Nuovo verbale» chiede quale usare; con uno solo o nessuno non chiede nulla.
  - Le voci di un verbale aperto si possono togliere o aggiungere senza toccare il modello.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/logic/rapportinoPdfBlocchi.test.ts src/test/logic/orderAcceptance.test.ts src/test/ui/orderAcceptance.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementare.** Nel verbale la sezione nuova sta tra «02 / Controlli effettuati» e «03 / Esito e riserve» e si chiama «Dati del collaudo»; senza campi la numerazione resta quella di oggi. Il controllo sugli obbligatori si fa alla chiusura, con `obbligatori` (le chiavi) salvato in `content` alla creazione, perché il modello può cambiare dopo.

- [ ] **Step 4: Verificare che passino e controllare i moduli Deno**

Run: `npx vitest run src/test/logic/rapportinoPdfBlocchi.test.ts src/test/logic/orderAcceptance.test.ts src/test/ui/orderAcceptance.test.tsx`
Expected: PASS.

Run: `deno check supabase/functions/genera-pdf-rapportino/index.ts supabase/functions/collaudo-commessa/index.ts && git checkout -- deno.lock`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/genera-pdf-rapportino supabase/functions/collaudo-commessa src/components/orders/OrderAcceptanceReports.tsx src/test
git commit -m "PDF e verbali: i campi e i modelli dell'azienda"
```

### Task 7: Campi per fase

**Files:**
- Modify: `src/components/campo/CampiModulo.tsx`, `src/pages/campo/CampoRapportino.tsx`, `src/components/orders/RapportiniUfficio.tsx`, `src/lib/campo/rapportiniUfficio.ts`, `src/components/campo/RapportinoBlocchi.tsx`, `supabase/functions/genera-pdf-rapportino/render.ts`
- Test: `src/test/ui/campoRapportinoCampiFase.test.tsx`, `src/test/ui/rapportinoCampiModulo.test.tsx`, `src/test/logic/rapportinoPdfBlocchi.test.ts`

**Interfaces:**
- Consumes: `chiaveValore`, `componiValori(..., fasi)`, `mancanti(..., fasi)`, `FaseScelta`.
- Produces: `<CampiModulo>` riceve `phaseId?: string`; con `phaseId` usa `chiaveValore(campo.chiave, phaseId)` per leggere e scrivere. `FaseBlocco` ottiene `campi: ValoreCampo[]`.

- [ ] **Step 1: Scrivere i test che falliscono**
  - Due fasi scelte e un campo per fase: il campo compare sotto ciascuna, con valori separati nell'insert, e `fasi_lavorate` resta senza i valori.
  - Fase tolta dopo la compilazione: il valore non viene inviato e l'obbligatorio non blocca (Review Focus 6).
  - Fase con sottofasi: un solo valore per la fase, non per sottofase.
  - Blocco fasi spento o commessa senza fasi: il campo compare una volta sul rapportino.
  - Ufficio: stesso comportamento per ogni giornata della finestra.
  - Lettura e PDF: il valore sta nella scheda della sua fase; se la fase è stata rinominata resta il `fase_nome` salvato.
  - La vista compatta non mostra i valori.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/ui/campoRapportinoCampiFase.test.tsx src/test/ui/rapportinoCampiModulo.test.tsx src/test/logic/rapportinoPdfBlocchi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare.** Non toccare `costruisciFasiLavorate` né il trigger di avanzamento. `bloccoFasi` riceve anche `campi_extra` e assegna i valori alle schede; un valore con `phase_id` senza scheda corrispondente finisce in «Altre informazioni» con il nome della fase, così non si perde.

- [ ] **Step 4: Verificare che passino, insieme ai test esistenti sulle fasi**

Run: `npx vitest run src/test/ui/campoRapportinoCampiFase.test.tsx src/test/ui/rapportinoCampiModulo.test.tsx src/test/logic/rapportinoPdfBlocchi.test.ts src/test/logic/rapportinoFasiCollegamenti.test.ts src/test/ui/campoRapportinoFasiCollegate.test.tsx src/test/ui/rapportinoBlocchi.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/campo src/pages/campo/CampoRapportino.tsx src/components/orders/RapportiniUfficio.tsx src/lib/campo/rapportiniUfficio.ts supabase/functions/genera-pdf-rapportino src/test
git commit -m "Campi propri anche per ogni fase lavorata"
```

### Task 8: Totali per commessa ed Excel

**Files:**
- Create: `supabase/migrations/<versione>_rapportini_campi_totali.sql`
- Create: `src/components/orders/TotaliCampiCommessa.tsx`, `src/lib/campo/esportaRapportini.ts`
- Modify: `src/components/orders/OrdineRapportiniCampo.tsx`
- Test: `src/test/logic/esportaRapportini.test.ts`, `src/test/logic/rapportiniCampiTotaliMigrazione.test.ts`, `src/test/ui/totaliCampiCommessa.test.tsx`

**Interfaces:**
- Consumes: `leggiValori`, `valoreInTesto`, `ValoreCampo`.
- Produces:
  - RPC `rapportini_campi_totali(p_order_id uuid) returns table(chiave text, etichetta text, tipo text, unita text, phase_id uuid, fase_nome text, approvati numeric, da_approvare numeric)`, `security invoker`, così vale la RLS di `campo_rapportini`. Esclude `bozza` e `rifiutato`.
  - `righeEsportazione(rapportini: RigaRapportino[]): { colonne: string[]; righe: string[][] }` e `esportaRapportini(rapportini, nomeFile): Promise<void>` con `exceljs`.

- [ ] **Step 1: Scrivere i test che falliscono**
  - RPC: è `security invoker`; somma solo i tipi `number` e conta i `boolean` veri; un valore non numerico non fa fallire la query; l'etichetta è la più recente; `etichetta` raggruppa per `chiave`, non per testo.
  - `righeEsportazione`: colonne standard (data, autore, stato, ore, descrizione) più una per chiave, anche archiviata; una colonna per fase ha il nome `Etichetta (Fase)`; un rapportino senza valore lascia la cella vuota; valori con `=` iniziale escono come testo, non come formula.
  - `TotaliCampiCommessa`: senza dati non mostra nulla; mostra `12 pz`, `3 sì` e separa da approvare.
  - Il pulsante Esporta è nascosto da telefono.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/logic/esportaRapportini.test.ts src/test/logic/rapportiniCampiTotaliMigrazione.test.ts src/test/ui/totaliCampiCommessa.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementare.** Totali sopra l'elenco dei rapportini della commessa, in una riga densa. L'Excel esporta i rapportini caricati per la commessa, senza limite di pagina.

- [ ] **Step 4: Verificare che passino**

Run: `npx vitest run src/test/logic/esportaRapportini.test.ts src/test/logic/rapportiniCampiTotaliMigrazione.test.ts src/test/ui/totaliCampiCommessa.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations src/components/orders src/lib/campo/esportaRapportini.ts src/test
git commit -m "Campi dei rapportini: totali per commessa ed Excel"
```

### Task 9: Firma del cliente sul verbale

**Files:**
- Create: `supabase/migrations/<versione>_verbale_firma_cliente.sql`
- Create: `src/components/orders/FirmaVerbaleDialog.tsx`
- Modify: `supabase/functions/collaudo-commessa/index.ts`, `supabase/functions/collaudo-commessa/render.ts`, `src/components/orders/OrderAcceptanceReports.tsx`
- Test: `src/test/logic/orderAcceptance.test.ts`, `src/test/ui/orderAcceptance.test.tsx`

**Interfaces:**
- Consumes: `FirmaPad` da `src/components/campo/FirmaPad.tsx`, lo stesso del rapportino di fine lavori. `SignaturePad` dei sopralluoghi non va bene: è legato al sopralluogo e carica il file da solo.
- Produces:
  - Colonne `order_acceptance_reports`: `firma_cliente_path text`, `firma_cliente_nome text`, `firma_cliente_at timestamptz`, `firma_raccolta_da uuid`.
  - Azione edge `sign`: corpo `{ order_id, id, version, document_hash, reviewed, firma: { immagine: string; nome: string } }`. L'immagine è un PNG in base64, massimo 500 KB. Salva la firma, rigenera il PDF, ricalcola l'hash e congela in un solo passaggio.
  - `renderAcceptance` riceve `firma?: { immagine: Uint8Array; nome: string; quando: string }`.
  - `<FirmaVerbaleDialog onConferma={(firma) => Promise<void>} />`.

- [ ] **Step 1: Scrivere i test che falliscono**
  - `sign` rifiuta: verbale già chiuso, `version` diversa, `document_hash` diverso dall'anteprima, `reviewed` falso, nome vuoto, immagine non PNG o oltre il limite (Review Focus 8).
  - Il congelamento usa la condizione `status = 'draft'` e `version`: se non aggiorna righe, rimuove i file appena caricati e risponde con errore.
  - Il PDF firmato non contiene «EDIZIONE NON FIRMATA» e riporta il testo «Firmato su schermo da {nome} il {data}.»; il PDF senza firma resta com'è oggi.
  - Il verbale chiuso senza firma resta possibile e dice «Congelato · non firmato»; quello firmato dice «Firmato da {nome}».
  - Nessun testo contiene «firma elettronica» riferito a questa firma, e l'avviso in `OrderAcceptanceReports` viene aggiornato di conseguenza.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/logic/orderAcceptance.test.ts src/test/ui/orderAcceptance.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementare.** La firma si salva nel bucket privato `order-acceptance-reports`, nel percorso del verbale. Il flusso resta anteprima → controllo → firma: il cliente vede il testo prima di firmare. Le edge function hanno un limite di 2 s di CPU: misurare `sign` con una firma reale sulla Demo; se supera il limite, ridurre la firma a 600 px di larghezza nel browser prima dell'invio.

- [ ] **Step 4: Verificare che passino e controllare il modulo Deno**

Run: `npx vitest run src/test/logic/orderAcceptance.test.ts src/test/ui/orderAcceptance.test.tsx`
Expected: PASS.

Run: `deno check supabase/functions/collaudo-commessa/index.ts && git checkout -- deno.lock`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/functions/collaudo-commessa src/components/orders/FirmaVerbaleDialog.tsx src/components/orders/OrderAcceptanceReports.tsx src/test
git commit -m "Verbale di collaudo: firma del cliente su schermo"
```

### Task 10: Verbale dal cantiere

**Files:**
- Create: `supabase/migrations/<versione>_verbale_dal_cantiere.sql`
- Create: `src/pages/campo/CampoVerbale.tsx`
- Modify: `supabase/functions/collaudo-commessa/index.ts`, `src/routes/campoRoutes.tsx`, `src/pages/campo/CampoLavoroDetail.tsx`
- Test: `src/test/logic/orderAcceptance.test.ts`, `src/test/ui/campoVerbale.test.tsx`

**Interfaces:**
- Consumes: azione `sign`, `FirmaVerbaleDialog`, `CampiModulo`, `acceptanceDaModello`, `leggiSchema`.
- Produces:
  - Funzione SQL `verbale_capo_autorizzato(p_order_id uuid, p_user_id uuid) returns boolean`: vera solo se esiste `order_campo_assignments` con `is_capocantiere`, l'utente non è subappaltatore, e l'azienda ha almeno un modello `verbale` attivo con `dal_cantiere`.
  - RPC `verbali_modelli_per_ordine(p_order_id uuid) returns jsonb`: i modelli utilizzabili dal capo.
  - Azione edge `list`: i verbali della commessa senza dati economici, per chi non legge la tabella.
  - Rotta `/campo/lavoro/:orderId/verbale`.

- [ ] **Step 1: Scrivere i test che falliscono**
  - Edge: il capo autorizzato può `list`, `save`, `preview`, `sign`, `open`; non può `finalize` senza firma; chi non è né ufficio né capo viene rifiutato; un capo tolto dalla commessa o di un'altra azienda viene rifiutato anche conoscendo gli id (Review Focus 9). Chi ha `can_edit_orders` continua a poter fare tutto come oggi.
  - La funzione legge l'azienda dalla commessa, mai dal corpo della richiesta.
  - Pagina: il pulsante «Collaudo» in `CampoLavoroDetail` compare solo con `verbali_modelli_per_ordine` non vuoto; con errore `PGRST202` non compare e non dà errori.
  - A 375 px ogni voce mostra quattro scelte (Verificato, Con riserva, Non applicabile, Da verificare), con riserve e note in fondo.
  - Il capo può uscire e riprendere la bozza.
  - Alla firma l'ufficio riceve un avviso sulla commessa; in presenza di riserve o esito negativo l'avviso lo dice.
  - Le attività dalle riserve (`AcceptanceTaskActions`) restano dell'ufficio.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run src/test/logic/orderAcceptance.test.ts src/test/ui/campoVerbale.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementare.** L'edge usa il client amministrativo: l'autorizzazione del capo va controllata prima di ogni azione. Per l'avviso usare `create_notification`, come `campo_rapportino_avvisa_ufficio`.

- [ ] **Step 4: Verificare che passino**

Run: `npx vitest run src/test/logic/orderAcceptance.test.ts src/test/ui/campoVerbale.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/functions/collaudo-commessa src/pages/campo/CampoVerbale.tsx src/routes/campoRoutes.tsx src/pages/campo/CampoLavoroDetail.tsx src/test
git commit -m "Verbale di collaudo dal telefono del capocantiere"
```

### Task 11: Prova completa e pubblicazione

**Files:** nessun file nuovo salvo correzioni.

- [ ] **Step 1: Controlli completi**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/test/logic src/test/ui/campoRapportinoModulo.test.tsx src/test/ui/campoRapportinoCampiFase.test.tsx src/test/ui/moduliCantiereConfig.test.tsx src/test/ui/totaliCampiCommessa.test.tsx src/test/ui/campoVerbale.test.tsx src/test/ui/orderAcceptance.test.tsx && NODE_OPTIONS=--max-old-space-size=6144 npx vite build`
Expected: nessun errore di tipi, build riuscita; gli unici test rossi sono quelli già rossi su main pulito.

- [ ] **Step 2: Prova a schermo sulla Demo**, con login fatto dall'utente, a 1440 e 375 px:
  1. spegnere i mezzi e aggiungere il campo obbligatorio «Pezzi posati»;
  2. rapportino da operaio e da capo;
  3. inserimento a mano dall'ufficio;
  4. approvazione e PDF;
  5. un'altra azienda continua a vedere il modulo di prima;
  6. verbale da modello Serramenti, chiuso e stampato;
  7. stesso verbale compilato e firmato dal telefono del capo;
  8. rapportino di un subappaltatore;
  9. campo per fase su due fasi, totale ed Excel;
  10. campo interno assente dal PDF di fine lavori.

  Riportare ogni modifica alla Demo a com'era.

- [ ] **Step 3: Revisione indipendente del ramo**, con attenzione a permessi tra aziende e a dati che spariscono al rimando.

- [ ] **Step 4: Pubblicazione solo su richiesta dell'utente.** Unire main, controllare i doppioni di migrazione, verificare che «Supabase Preview» non sia bloccato dalla migrazione senza file, poi push nello stesso passaggio. Dopo il CI, eseguire la prova RPC del Task 2 Step 5.

- [ ] **Step 5: Preparare la release delle app iOS e Android.** Senza release i telefoni con l'app installata non vedono i campi nuovi né il verbale. Build e aggiornamento versioni si preparano qui; l'archiviazione e il caricamento negli store li fa l'utente.
