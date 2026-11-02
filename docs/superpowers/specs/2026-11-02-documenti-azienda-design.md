# Documenti e scadenze dell'azienda

**Data:** 02/11/2026
**Nato da:** l'anagrafica di Impresa Vulcano. Su 99 scadenze che tengono in un file
Excel, 27 non hanno un posto dove stare in EdiliziaInCloud: ISO 9001/14001/45001,
SOA triennale e quinquennale, DURC, visura camerale, analisi semestrali dei rifiuti,
quattro polizze della ditta e delle sedi, il libro matricola, l'imposta di registro,
RENTRI, AGEST, la piattaforma SINTEL, quattro contatori e gli estintori.

## Perché

Oggi EiC sa far scadere due cose: i soldi (scadenzario incassi e pagamenti) e i
mezzi (assicurazione, bollo, revisione). I documenti dell'impresa in quanto impresa
— quelli che se scadono ti fermano una gara, un cantiere o un subappalto — stanno
fuori. Ogni impresa che lavora con appalti pubblici li ha, e li tiene su un Excel
come Vulcano, o su un muro.

Non è un modulo nuovo da vendere: è il pezzo che manca perché «mettiamo tutto
dentro EiC» sia vero. Chi entra in Impostazioni deve trovare un posto dove carica
i documenti della sua azienda e dorme tranquillo.

## Obiettivi

- Un posto solo, facile da trovare, dove l'azienda carica i propri documenti.
- La scadenza avvisa prima, a chi decide l'azienda, senza che nessuno se ne ricordi.
- Il rinnovo non si reinserisce a mano: si dice «rinnovato il …» e la prossima
  scadenza si calcola da sola, con lo storico dei file vecchi.
- Funziona anche per chi non ha nessuna certificazione: parte vuoto, non impone niente.

## Non obiettivi

- Non è un archivio documentale generale (le cartelle di commessa esistono già).
- Non è il DVR né la sicurezza di cantiere (`sicurezza_documenti` resta dov'è).
- Non sono i documenti dei dipendenti (modulo Personale) né dei subappaltatori
  (`subappaltatori_documenti`): questa pagina è l'azienda, non le persone.
- Niente firma elettronica, niente invio a enti.

## Anti-obiettivi (così fallisce anche se funziona)

- Un elenco di adempimenti obbligatori che fa sentire in difetto chi non li ha.
- Parole da consulente: «compliance», «audit», «scadenziario documentale».
- Una pagina in più che nessuno apre perché gli avvisi non arrivano dove si guarda.

## Dove sta

Impostazioni → **La mia azienda** → **Documenti e scadenze**
(`/azienda/impostazioni/documenti-azienda`), subito sotto «Profilo aziendale» e
«Sedi». È lì che uno va a cercare «le carte della mia ditta».

Entrata secondaria: un blocco **Scadenze dell'azienda** in Attività/Cruscotto
quando c'è qualcosa che scade entro 30 giorni o è già scaduto. Da telefono si vede
solo quel blocco e il dettaglio in sola lettura: caricare i file è roba da computer.

## Com'è fatta la pagina

In alto tre numeri grossi, cliccabili come filtri: **scaduti**, **in scadenza**
(entro 60 giorni), **a posto**. Accanto, ricerca e il bottone «Aggiungi documento».

Sotto, l'elenco raggruppato per categoria. Ogni riga:

| | |
|---|---|
| Pallino | verde a posto · giallo in scadenza · rosso scaduto |
| Nome | «DURC», «SOA triennale», «Polizza RC — sede La Cafferia» |
| Ente / numero | INAIL, Helvetia 50937496 |
| Scade il | 15/10/2026 — e, accanto, «fra 12 giorni» |
| File | apri / sostituisci |
| Avvisa | 15 giorni prima, a Federica |

Riga aperta: data del documento, sede collegata, ogni quanto si rinnova, note,
storico delle versioni precedenti con i file.

**Aggiungi documento** è una scheda corta: nome, categoria, scadenza, file. Tutto
il resto ha un valore già buono e si cambia dopo.

### Categorie

Sette, fisse ma con «Altro» sempre disponibile:
Certificazioni · Appalti pubblici · Assicurazioni · Ambiente e rifiuti ·
Sedi e utenze · Sicurezza · Altro.

Il nome del documento è libero: le categorie servono solo a raggruppare e a
decidere il preavviso di partenza.

### Elenco di partenza

La prima volta la pagina non è vuota: propone le carte che ha quasi ogni impresa
edile — DURC, visura camerale, ISO 9001, ISO 14001, ISO 45001, SOA, polizza RC,
polizza catastrofale, iscrizione RENTRI, verifica estintori — come caselle da
spuntare. Si spunta quello che si ha, il resto sparisce e non torna più.
Chi non vuole niente chiude e aggiunge a mano. (Regola: il software si cuce
sull'azienda, non il contrario.)

### Rinnovo

Ogni documento può avere «si rinnova ogni N mesi». Sulla riga compare **Rinnovato**:
si mette la data nuova (o si carica il file nuovo e la data si propone da sola),
la scadenza successiva si calcola, la versione vecchia scivola nello storico.

Copre il DURC ogni 120 giorni, le analisi rifiuti semestrali, i controlli della gru
trimestrale/annuale/ventennale, il bollo e le polizze annuali.

### Avvisi

Email + notifica in app, a X giorni dalla scadenza, ai destinatari che sceglie
l'azienda (di default l'amministratore). Preavvisi di partenza per categoria:
DURC 15 giorni, assicurazioni e utenze 30, certificazioni e SOA 60.
Secondo avviso il giorno della scadenza, poi uno a settimana finché è scaduto.

Un documento può anche non avere scadenza (statuto, organigramma, modello 231):
si carica e basta, non avvisa niente.

## Come si fa

### Dati

Tabella nuova `azienda_documenti`:

```
id, company_id, categoria, titolo, ente, numero,
sede_id (→ company_sedi, facoltativo),
data_documento, data_scadenza (può essere nulla), rinnovo_mesi,
alert_giorni_prima, alert_destinatari (uuid[] o email[]),
file_path, file_name, note,
sostituisce_id (→ se stessa: lo storico è una catena),
archiviato_il, created_by, created_at, updated_at
```

Lo stato (valido / in scadenza / scaduto) non si scrive: si calcola, come già fa
la vista `mezzi_scadenze`.

Vista `azienda_scadenze_tutte`: unisce i documenti dell'azienda e le scadenze dei
mezzi in un elenco solo, per il blocco in Attività e per un domani un'unica pagina
«Scadenze» di tutta l'impresa.

Storage: bucket `azienda-documenti`, cartella per azienda, RLS sulla company come
gli altri bucket.

Permessi: visibile a chi ha `canViewSettingsProfile`; modifica agli amministratori.
Serve un permesso suo (`canEditDocumentiAzienda`) solo se qualcuno chiede che
l'ufficio possa caricare senza vedere il resto delle impostazioni — per ora no.

### Avvisi

Si aggancia al cron che già esiste: `check-scadenze-alerts` gira ogni giorno e ha
già l'invio email con il marchio dell'azienda. Si aggiunge il giro sui documenti
dell'azienda, con le preferenze in `scadenza_alert_prefs`.

### Fasi

1. Tabella, bucket, pagina con elenco, aggiunta, modifica, file. (Il grosso.)
2. Rinnovo con storico + elenco di partenza da spuntare.
3. Avvisi nel cron e blocco in Attività.
4. Più avanti: la data di scadenza letta dal PDF con l'AI che già legge i DDT.

Le fasi 1 e 2 bastano a far smettere l'Excel. La 3 è quella che fa dire «mi ha
salvato il DURC».

## Cosa resta al costruttore

- Le parole esatte delle sette categorie e dei testi dell'elenco di partenza.
- Se lo storico è una catena di righe (`sostituisce_id`) o una tabella a parte:
  la catena mi sembra più semplice, decida chi scrive.
- Dove mettere il blocco in Attività, se in cima o in fondo.

## Impresa Vulcano: cosa ci finisce dentro

Le 27 righe del loro scadenzario, così:

- **Certificazioni** — ISO 9001 (03/08/2029), ISO 14001 (03/09/2026),
  ISO 45001 (03/09/2026), visura camerale (30/09/2026), SINTEL (17/01/2027)
- **Appalti pubblici** — SOA triennale e quinquennale (05/04/2028),
  DURC (15/10/2026)
- **Assicurazioni** — tutela legale DITTA (28/11/2026), RC DITTA (15/03/2027),
  catastrofale DITTA (31/03/2027), catastrofale La Cafferia (29/09/2026),
  incendio-furto La Cafferia (31/12/2026), RC Ufficio (31/07/2027),
  libro matricola NOBIS (30/06/2027)
- **Ambiente e rifiuti** — analisi semestrali (05/09/2026), RENTRI (30/04/2027),
  AGEST (30/04/2027)
- **Sedi e utenze** — contatori Mazzolari, Foscolo, Castano, Boccaccio;
  imposta di registro La Cafferia (14/07/2027)
- **Sicurezza** — controllo dei 4 estintori (scaduto dal 01/09/2025)

«La Cafferia» e «Ufficio» diventano due sedi in Impostazioni → Sedi, e i documenti
si agganciano lì.

---

# Seconda parte — scritta il 02/11/2026, dopo il primo collaudo

Le fasi 1 e 2 sono fatte e provate sui dati veri di Impresa Vulcano. Il collaudo ha
mostrato una cosa sola, ma grossa: **ventitré scadenze dentro e zero file allegati**.
La pagina ricorda, ma l'archivio resta vuoto. Da lì nasce l'ordine di questa seconda
parte: prima si riempie, poi si collega, poi si esporta.

## 5. Caricare i file in blocco

**Il problema.** Allegare un PDF ora costa: apri la riga, scegli il file. Venti
documenti sono venti giri. Chi ha l'archivio su una cartella del server non lo
travasa mai.

**Come.** Si trascina una cartella di PDF sulla pagina. Per ogni file si cerca il
documento che gli somiglia di più per nome (confronto sul titolo e sul numero, senza
accenti né punteggiatura) e si mostra l'abbinamento proposto: `durc_ottobre.pdf →
DURC`. Quelli che non trovano casa restano in fondo con un menu a tendina per
sceglierli a mano, oppure «crea un documento nuovo con questo nome». Si conferma una
volta sola e partono tutti, con una barra che dice a che punto è.

**Non fa.** Non indovina senza mostrare: nessun file si attacca da solo a un documento
senza che qualcuno abbia visto l'abbinamento. Un file attaccato alla carta sbagliata è
peggio di un file non attaccato.

## 6. La scadenza letta dal PDF

**Il problema.** Anche con i file dentro, le date le batte a mano qualcuno.

**Come.** Lo stesso meccanismo del lettore di bolle (`ai-ddt-analyzer`): il PDF va al
modello, che risponde con tipo di documento, ente, numero e scadenza. La data **si
propone**, non si scrive: il campo si riempie evidenziato e chi carica conferma.
Insieme al punto 5: trascini venti PDF, confermi venti date, non hai digitato niente.

**Non fa.** Non tocca una data già scritta da una persona, e se non è sicura lascia il
campo vuoto invece di inventare. Una scadenza sbagliata su un DURC è peggio di una
scadenza mancante: una la vedi rossa, l'altra ti fa credere di essere a posto.

## 7. Le scadenze in Attività

`azienda_scadenze_tutte` unisce già carte della ditta e scadenze dei mezzi e non la
guarda nessuno. In Attività una riga sola: «3 carte scadute, 1 scade entro il mese»,
che apre la pagina. La pagina la apri se ti ricordi che esiste; Attività la vedi ogni
mattina.

## 8. Le carte che non scadono ma invecchiano

La visura camerale non scade: è una fotografia del registro imprese al giorno in cui la
estrai. Però in gara una visura di otto mesi te la rifiutano. Stessa cosa per
organigramma e DVR, che non hanno una data di morte ma vanno rivisti.

Serve un **promemoria separato dalla scadenza**: «ricordamelo ogni N mesi dalla data del
documento». Nel modello è una colonna sua (`promemoria_mesi`), non un riuso di
`data_scadenza`: un documento senza scadenza deve continuare a dire «senza scadenza»,
perché è la verità, e l'avviso deve avere parole sue — «la visura ha sei mesi, se ti
serve per una gara rifalla» — non «scaduta».

## 9. Un DURC solo

Oggi in EiC il DURC sta in tre posti:

1. `subappaltatori_sicurezza.durc_scadenza` — il DURC **del subappaltatore**, col
   semaforo `durc_ok` che decide se quella ditta può lavorare in cantiere. **Resta dov'è:
   è un dato suo, non nostro.**
2. `anagrafica_azienda.durc_expiry_date` — **il nostro**, in Impostazioni → Fatturazione.
   Lo legge `check-due-dates`. Su otto aziende è compilato da una sola; Vulcano no.
3. `azienda_documenti` — dove il DURC di Vulcano c'è davvero, con scadenza 15/10/2026.

La pagina diventa la fonte unica per il DURC dell'impresa: il campo in Fatturazione
legge da lì, `check-due-dates` smette di guardare una colonna quasi sempre vuota, e i
valori già scritti si travasano. Il DURC del subappaltatore non si tocca.

## 10. Il foglio per la gara, e i test

Lo scadenzario in PDF e in Excel con un bottone: è la cosa che l'ufficio gare chiede, ed
è il motivo per cui l'Excel sopravvive al gestionale.

E due test che mancano, su bug già pagati una volta: la scadenza calcolata dai mesi di
rinnovo (che cadeva un giorno prima, passando per UTC) e la cancellazione che porta via
tutta la catena delle versioni.

---

## Fase 5 — fatta il 02/11/2026

Provata nel browser: sui ventitré documenti veri di Impresa Vulcano l'abbinamento
riconosce `DURC ottobre 2026.pdf`, `iso14001.pdf`, `visura-camerale-30-09-2026.pdf` e
`RC ditta.pdf`; `ISO.pdf` davanti a tre ISO resta da scegliere, come deve. Il
caricamento vero è stato provato su Demo Azienda 2 e poi ripulito.

Tre cose decise mentre si costruiva, che il piano non diceva:

- **Il punteggio guarda la quota di titolo coperta, non le parole in assoluto.** Alla
  prima prova «DURC» (una parola) non arrivava alla soglia che «Responsabilità civile —
  ditta» (tre parole) superava: i titoli corti perdevano sempre.
- **Le abbreviazioni del mestiere stanno in tabella** (`rc`, `dvr`, `pos`, `cciaa`…).
  Senza, `RC_ditta.pdf` e «Responsabilità civile — ditta» non si somigliano per niente,
  e quello è l'abbinamento più comune dell'archivio.
- **Due file sulla stessa carta bloccano la conferma.** Il secondo cancellerebbe il
  primo senza dirlo.

Resta fuori la fase 6: le date si continuano a battere a mano.
