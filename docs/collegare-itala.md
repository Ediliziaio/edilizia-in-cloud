# Collegare Itala (recupero fatture da AdE)

Guida per un'azienda che deve portare in Edilizia in Cloud le proprie fatture
(emesse e ricevute) tramite il servizio **Itala**, collegato alla piattaforma.

Il collegamento è in **due tempi**: prima si **collega** (dentro Edilizia in
Cloud, 30 secondi, senza chiavi né password), poi — solo se serve lo **storico**
— si abilita Itala nel proprio cassetto fiscale sul sito dell'Agenzia delle
Entrate e si firma la richiesta.

> **Prerequisito:** la **partita IVA** dev'essere inserita nell'anagrafica
> aziendale (Impostazioni → Azienda). È quella che il servizio usa per leggere le
> fatture: non serve nessun'altra credenziale.

---

## Parte 1 — Collega (dentro Edilizia in Cloud) · ~30 secondi

1. **Impostazioni → Fatturazione.**
2. In cima, alla voce «Come fatturi?», scegli **«Con un altro programma»**.
3. Apri la scheda **«Collegamento»**.
4. Nel riquadro in evidenza **«Recupero fatture con Edilizia in Cloud»**
   (etichetta *Consigliato*):
   - controlla che la **partita IVA** mostrata sia quella giusta;
   - premi **«Collega il recupero fatture»** e **conferma**.

Fatto. Da questo momento le fatture **emesse e ricevute nuove** che passano dallo
SDI arrivano da sole in **Fatturazione → Fatture** e **Fatturazione → Fatture
ricevute**. Non serve inserirle a mano.

Per lo **storico** (fatture già emesse/ricevute in passato) prosegui con la
Parte 2.

---

## Parte 2 — Abilita Itala sul sito dell'Agenzia delle Entrate · una volta sola

Serve **solo per recuperare lo storico**. Autorizzi Itala a scaricare le fatture
dal tuo cassetto fiscale. Lo fa il **titolare** (con SPID/CIE/CNS) o
l'**intermediario delegato**.

1. Entra in **«Fatture e Corrispettivi»** sul sito dell'Agenzia delle Entrate.
2. Vai in **Consultazione → «Censimento canali per forniture massive»**.
3. Abilita **«Itala Tecnologia Informatica S.r.l.»** per lo **«Scarico Fatture»**.

---

## Parte 3 — Recupera lo storico · quando ti serve

1. In Edilizia in Cloud apri la scheda **«Recupera da AdE»** (oppure premi
   **«Recupera lo storico da AdE»** nel riquadro, subito dopo aver collegato).
2. Imposta il **periodo** (massimo **3 mesi** per richiesta), **Emesse/Ricevute**
   e il **criterio della data**.
3. Spunta **«Ho abilitato questo provider…»** (è la Parte 2).
4. **«Prepara richiesta»** (1 credito): scarica l'**XML**, **firmalo
   digitalmente** in formato **CAdES (.p7m)** — firma del titolare o
   dell'intermediario delegato — e **ricaricalo**.
5. Quando lo stato diventa **PRONTO**, premi **«Recupera · N crediti»** e poi
   **«Importa fatture disponibili»**. Le fatture entrano in Fatturazione.

### Costi (crediti)

- Preparazione della richiesta: **1 credito**.
- Recupero: **1 credito per documento** (il conteggio è mostrato e va confermato
  prima dell'addebito).

### Note

- Lo storico si richiede a **finestre di massimo 3 mesi**: per più mesi, più
  richieste.
- La firma deve essere del **soggetto ammesso** (titolare o intermediario
  delegato), non una firma tecnica.
- I tempi di elaborazione dipendono dall'Agenzia delle Entrate: se l'esito è
  incerto, **aggiorna l'elenco** prima di ripetere.

---

## In breve

| Cosa | Dove | Serve per |
|------|------|-----------|
| Collega il recupero fatture | Fatturazione → Collegamento | Fatture nuove, in automatico |
| Abilita «Itala…» per Scarico Fatture | AdE → Fatture e Corrispettivi → Censimento canali | Poter scaricare lo storico |
| Prepara → firma → importa | Fatturazione → Recupera da AdE | Portare dentro lo storico |
