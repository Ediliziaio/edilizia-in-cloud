# Renova Solution — go-live sul nostro sistema di fatturazione

Scritto il 27/09/2026. Renova Solution SRL è il **primo cliente vero** che passa
dal provider attuale (Aruba) al nostro sistema di fatturazione interno con SDI via
**openapi.it**. Vincolo assoluto: la numerazione deve **proseguire senza salti**.
Ultima fattura emessa su Aruba: **FPR 72/26** → la prima che emettiamo noi deve
essere **FPR 73/26**.

---

## 0. Stato al 01/10/2026 (verificato sul database)

Le sezioni 2–4 qui sotto sono la fotografia del 27/09: **le fasi 0, 1 e 3 sono
già fatte**. Verificato in produzione:

| Punto | Stato |
|---|---|
| Formato numero `{prefisso} {n}/{yy}`, prefisso `FPR` | ✅ impostato |
| Serie unica fatture + note di credito (`nc_serie_condivisa`) | ✅ attiva |
| Contatore `ultimo_numero_fattura` = 72, anno 2026 | ✅ la prossima è **FPR 73/26** |
| Prova in transazione annullata | ✅ `FPR 73/26` (fattura), `FPR 74/26` (nota di credito), `FPR 75/26`; contatore rimasto a 72 |
| Regime fiscale | ✅ RF18, come nelle fatture Aruba |
| Canale: openapi (`sdi_provider = openapi`), codice destinatario `PIC7CPS` | ✅ |
| Cedente registrato su openapi (`sdi_cedente_config`: `registrato`, ricezione con callback) | ✅ dal 01/10 |
| Token openapi della piattaforma nel Vault, ambiente `prod` | ✅ |
| `sdi_configurato` | irrilevante: nessun codice lo legge |
| Guardia «openapi senza token» in `invia-sdi` | ✅ restituisce errore, non cade nel ramo manuale |

**Cosa resta, ed è di Renova, non nostro:**
1. Registrare `PIC7CPS` all'Agenzia delle Entrate (Fatture e Corrispettivi →
   Registrazione dell'indirizzo telematico) per ricevere le passive qui.
2. Decidere la **data di taglio** Aruba → noi: da quel giorno si emette solo da qui
   (altrimenti rischio di numero doppio).
3. Aderire alla **conservazione** gratuita dell'Agenzia delle Entrate.
4. La bozza `Bozza E8F22C61` del 01/10 ha ancora il segnaposto: il numero vero
   (FPR 73/26) si assegna dalla scheda della fattura.

**Schermata del documento (01/10/2026):** barra azioni (Modifica, Duplica, Apri PDF,
Salva PDF, Stampa, Invia per e-mail) e riquadro «Stato fattura elettronica» con
Cosa fare, Visualizza fattura elettronica, Verifica formale, Esporta XML. Modifica
è attiva solo per bozze e fatture scartate dallo SDI (il database protegge le emesse).
Fatture ricevute: «Vedi la fattura» (vista leggibile + stampa/PDF, e PDF del
fornitore se è dentro l'XML); l'XML si scarica anche quando non c'è la copia in archivio.

**Ricevute di settembre (zip Aruba del 01/10, 38 XML):** tutte leggibili e intestate a
Renova; 37 nuove e 1 già presente. Si caricano da Fatture ricevute → Importa XML
(accetta lo zip): così si conserva anche il file originale nell'archivio.

Dalla scheda Impostazioni → Fatturazione → Fatt. Elettronica i tre passi
(invio, ricezione, conservazione) sono ora guidati (`FatturaElettronicaPassi`).

---

## 1. I dati veri (export Aruba del 25/09/2026)

**Inviate:** 50 XML FatturaPA (FPR12), da FPR 25/26 a FPR 72/26.
**Ricevute:** 10 XML (fornitori: bar, Wuerth, garage, HOMEL…, 21–25/09).

Cosa dicono le inviate, e conta molto:

- **Serie unica `FPR NN/26`** — un solo progressivo condiviso tra **fatture (TD01)**
  e **note di credito (TD04)**. Esempi: FPR 30/26 e 31/26 sono note di credito
  *in mezzo* alle fatture; così 35, 36, 43, 48, 52, 63, 67. Non due serie separate:
  **una sola**.
- Formato numero: `FPR` + spazio + numero **senza zeri** + `/` + **anno a 2 cifre**
  (`FPR 72/26`), non `FPR-2026-0072`.
- Anomalia da sapere: **`FPR 42/26` compare 3 volte** (tutte 08/07, TD01). Nell'export
  mancano i numeri 1–24 (è una fetta recente, non l'anno intero).

**Identità fiscale di Renova (dall'XML):** RENOVA SOLUTION SRL, P.IVA
`01941970939`, regime **RF18**, formato FPR12, sede Pordenone (PN).
(Nel nome-file degli XML il `01879020517` è il **trasmittente** Aruba, non Renova.)

---

## 2. Stato di Renova nel nostro sistema (oggi)

`company_id = f2a16dd8-36c3-4d92-8d78-267d6374dcb5` · `anagrafica_azienda`:

| Campo | Valore oggi | Serve |
|---|---|---|
| `partita_iva` / `codice_fiscale` | 01941970939 | ✅ giusto |
| `regime_fiscale` | **RF01** | ⚠️ le fatture Aruba dicono **RF18** — da chiarire |
| `codice_rea` / `rea_ufficio` | 368513 / PN | ✅ c'è (Openapi lo richiede) |
| `codice_sdi` (ricezione) | KRRH6B9 | ✅ codice destinatario di Renova |
| `pec` | renovasolution@lamiapec.it | ✅ |
| `sdi_provider` | openapi | ✅ |
| `sdi_configurato` | **false** | ⚠️ da attivare |
| `sdi_api_key` | **vuota** | ⚠️ da inserire (chiave Openapi di Renova) |
| `ultimo_numero_fattura` | **0** | 🔴 deve valere **72** |
| `ultimo_numero_nc` | 0 | vedi §3 (serie unica) |
| `prefisso_fattura` | (default FT) | 🔴 deve essere **FPR** |
| `documenti_fiscali` di Renova | **0 righe** | ✅ foglio pulito, nessun dato di test |

---

## 3. Findings — cosa manca DAVVERO (in ordine di gravità)

### 🔴 A. La numerazione non sa fare il formato di Renova
`genera_numero_documento_native()` produce **`prefisso-ANNO-NNNN`** (cablato:
`v_prefisso || '-' || p_anno || '-' || LPAD(contatore,4,'0')`). Anche mettendo
`prefisso_fattura='FPR'` uscirebbe **`FPR-2026-0073`**, non `FPR 73/26`.
Mancano: separatore/spazio, anno a 2 cifre, niente zeri di riempimento.

### 🔴 B. Fatture e note di credito hanno contatori SEPARATI
La funzione usa `ultimo_numero_fattura` per le fatture e `ultimo_numero_nc` per le
note di credito. Renova ha **una serie sola**: una nota di credito deve prendere il
**numero FPR successivo**, non un contatore NC a parte. Oggi non è possibile.

### 🔴 C. Continuità: il contatore è a 0
Va portato a **72** (con `anno_corrente_fattura = 2026`), così la prima emissione
è **FPR 73/26**. Da fare **dopo** aver sistemato A e B, e **prima** della prima
emissione reale.

### 🟠 D. Openapi non è ancora attivo
`sdi_configurato=false`, nessuna API key. Va inserita la chiave Openapi di Renova e
attivato il canale. L'emissione via openapi.it **è già nel codice** (`invia-sdi`
instrada su openapi e lascia che firmi lui). Serve una **guardia**: come per Aruba
(`provider='aruba' && !api_key` → blocco), verificare che ci sia lo stesso blocco
per `openapi` senza chiave, per non cadere nel ramo «manuale» marcando comunque
`inviata_sdi`.

### 🟠 E. Regime RF01 (nostro) vs RF18 (Aruba)
Le fatture emesse devono dichiarare lo **stesso regime** di prima. Da confermare con
Renova/commercialista quale è corretto e allineare `regime_fiscale`.

### 🟢 F. Cosa c'è GIÀ (non è un problema, è un vantaggio)
- **Emissione openapi.it**: `invia-sdi` (con ambiente **di test** `test.invoice.openapi.com`).
- **Ricezione passive**: tabella `fatture_ricevute`, `openapi-fatture-ricevute`,
  `ricevi-sdi`, `sdi-webhook`, `contabilizza_fattura_ricevuta()`, OCR
  (`ai-fattura-ricevuta-ocr`), registro IVA (`fatture_ricevute_periodo_iva`).
- **Import XML attivo**: `importa-fattura-attiva-xml` → si può caricare lo storico
  inviate.
- `incrementa_progressivo_sdi()` (ProgressivoInvio atomico), `rilascia_numero_documento()`.

---

## 4. Piano a fasi

### Fase 0 — Anagrafica allineata (mezza giornata)
- Confermare e sistemare `regime_fiscale` (RF01 vs RF18 — **decisione Renova**).
- Verificare REA, PEC, sede, codice destinatario di ricezione (KRRH6B9).
- **Verifica:** una fattura di test in ambiente Openapi test supera la validazione XSD.

### Fase 1 — Numerazione (il cuore) (1–2 giorni)
1. Aggiungere ad `anagrafica_azienda`: un **template di formato** per la fattura
   (es. `formato_numero_fattura`, con segnaposto `{prefisso} {n}/{yy}` /
   `{prefisso}-{yyyy}-{n:04d}`) e un flag **serie unica** NC↔fattura
   (`nc_serie_condivisa boolean`).
2. Modificare `genera_numero_documento_native()`:
   - se c'è il template, comporre il numero con quello (default = comportamento
     attuale `prefisso-YYYY-NNNN`, così **nessun altro cliente cambia**);
   - se `nc_serie_condivisa`, la `nota_credito` incrementa `ultimo_numero_fattura`
     (serie unica) invece di `ultimo_numero_nc`.
3. Impostare Renova: `prefisso_fattura='FPR'`, formato `{prefisso} {n}/{yy}`,
   `nc_serie_condivisa=true`.
4. **Verifica (senza emettere a SDI):** in una transazione che si annulla, chiamare
   la funzione per una fattura e per una nota di credito e controllare che escano
   `FPR 73/26` e `FPR 74/26`. Solo dopo, in Fase 3, si porta il contatore a 72.

> Regola del progetto: la funzione tocca **tutte** le aziende → il ramo nuovo è
> dietro il template/flag, il default resta identico. Test di non-regressione sugli
> altri formati (FT-2026-0001) obbligatorio.

### Fase 2 — Attivazione Openapi in TEST (mezza giornata)
- Inserire la API key Openapi di Renova; tenere `sdi_configurato` in modo che
  l'emissione parta **verso l'ambiente di test** (`test.invoice.openapi.com`).
- Aggiungere/verificare la guardia `provider='openapi' && !api_key`.
- **Verifica:** emettere in test una fattura fittizia, ricevere l'esito SDI simulato
  (RC/NS) via `sdi-webhook`, controllare lo stato in `documenti_fiscali`.

### Fase 3 — Continuità + storico (1 giorno)
- Portare `ultimo_numero_fattura=72`, `anno_corrente_fattura=2026`,
  `sdi_progressivo_anno=2026`. (Da fare a ridosso del go-live, non prima.)
- **Storico inviate (opzionale, da decidere):** importare le 50 XML con
  `importa-fattura-attiva-xml` per avere il registro IVA vendite completo. Attenzione:
  `FPR 42/26` è triplo e mancano 1–24. In alternativa, **non importare** e ripartire
  pulito da 73 (lo storico resta su Aruba). **Decisione Renova/commercialista.**
- **Ricevute:** caricare le 10 passive (via import XML in `fatture_ricevute`) e/o
  lasciare che arrivino da Openapi da qui in avanti sul codice destinatario KRRH6B9.

### Fase 4 — Collaudo end-to-end in TEST
- Emissione `FPR 73/26` (TD01) → firma Openapi → trasmissione test → esito.
- Nota di credito `FPR 74/26` (TD04) sulla stessa serie.
- Ricezione di una passiva → contabilizzazione → registro IVA.
- Controlli: numero, progressivo invio, regime, REA, importi, IVA, scadenze.

### Fase 5 — Go-live + presidio
- Passaggio all'ambiente Openapi **reale**, `sdi_configurato=true`.
- Prima emissione reale = `FPR 73/26`. Verificare l'esito SDI (consegnata/accettata).
- Presidio dei primi giorni: esiti SDI, ricezione passive, scadenzario.
- Comunicare al commercialista la data di taglio Aruba→noi.

---

## 5. Decisioni da confermare con Renova (bloccanti)

1. **Regime fiscale**: RF01 o RF18? (le fatture Aruba dicono RF18, il nostro DB RF01).
2. **Storico**: importiamo le 50 inviate (registro IVA completo, ma dati sporchi:
   FPR 42 triplo, manca 1–24) o ripartiamo pulito da 73 lasciando lo storico su Aruba?
3. **Data di taglio**: da quale giorno Renova emette SOLO dal nostro sistema (per non
   rischiare un numero doppio tra Aruba e noi).
4. **Note di credito già emesse**: confermato che la serie NC è la stessa delle
   fatture (dai dati sì) — vale anche a inizio 2027 (reset annuale unico).

## 6. Rischi

- **Numero doppio** se Renova emette ancora da Aruba dopo il nostro go-live → serve
  una data di taglio netta (decisione #3).
- **Primo numero sbagliato** se si attiva l'emissione prima di aver portato il
  contatore a 72 → l'ordine delle fasi (1 → 2 → 3) è vincolante.
- **Formato che rompe altri clienti**: la modifica alla funzione di numerazione è
  globale → default invariato + test di non-regressione.
- **Reset annuale**: a gennaio 2027 il contatore fattura si azzera a 1; con serie
  unica anche le NC devono ripartire da lì. Verificare il ramo `nota_credito` col
  reset (oggi la NC non ha `anno_corrente_nc`).
