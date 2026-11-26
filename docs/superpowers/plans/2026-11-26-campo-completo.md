# Area operai completa: operaio, caposquadra, subappaltatore

Piano del 26/11/2026, richiesto dal founder: «rendere l'app completa e funzionale per operaio,
caposquadra e subappaltatori». Prima di scriverlo è stato controllato nel codice e nel database, punto
per punto, cosa esiste già (censimento del 26/11, due ricerche). Il piano costruisce sopra quello che c'è:
niente tabelle doppie, niente pagine parallele.

Regole che valgono per ogni fase:
- **Si cuce sull'azienda**: ogni novità ha un interruttore per azienda e parte «come oggi» (spenta o
  invisibile) dove cambierebbe il modo di lavorare.
- **Meno è meglio sul telefono**: un passo in più va giustificato. Testi corti, icone, niente termini tecnici.
- **Lingue**: ogni frase nuova passa da `t()` e entra nei 10 dizionari (`src/lib/campo/lingua/dizionari`)
  nello stesso commit; poi `node scripts/campo/genera-rtl-campo.mjs` e `bun scripts/campo/fogli-revisione-lingue.ts`.
- **Database**: migrazioni idempotenti, `apply_migration` + riallineamento della versione, file salvato e
  pushato subito. Funzioni nuove con `REVOKE … FROM PUBLIC, anon` e `GRANT` esplicito.
- **Prove**: ogni automazione provata prima con un test vero sulla Demo 2; ogni fase chiude con test
  automatici, collaudo dal telefono (`docs/collaudo-mobile/matrice-campo.md`) e verifica del deploy.
- **Mac 8 GB**: controlli uno alla volta, col lucchetto `/tmp/eic-controllo.lock`.

---

## Fase 0 — Da sistemare subito (sicurezza e cose rotte)

| # | Cosa | Oggi | Lavoro |
|---|---|---|---|
| 0.1 | **Rotte del subappaltatore** | `campoRoutes.tsx` non distingue i ruoli: un sub che scrive `/campo/spese` o `/campo/presenze` entra; restano solo le regole sulle righe | Guardia di ruolo sulle rotte (elenco «solo operaio») con test che percorre tutte le rotte per ruolo |
| 0.2 | **Documenti del sub nell'ufficio** | Il sub carica da `SubDocumenti.tsx` in `documenti_dipendenti`; l'ufficio guarda `documenti_subappaltatore` / `subappaltatori_documenti` in `SubappaltatoreDetail.tsx` | Il caricamento dal telefono scrive dove guarda l'ufficio (una fonte sola) + recupero di quelli già caricati; aggiungere il tipo «Patente a crediti» |
| 0.3 | **App iPhone installata vecchia** | Capacitor impacchetta `dist`; nessun aggiornamento automatico; c'è solo il banner «versione vecchia» (`public/versione-minima.json`, soglia alzata a mano) | Nuova build su TestFlight/App Store con la versione di oggi; alzare la soglia minima; decidere (founder) se adottare un aggiornamento automatico dei contenuti (es. Capgo) — vedi «Decisioni» |
| 0.4 | **Notifiche vecchie accumulate** | Da oggi il riepilogo «N rapportini da approvare» è uno solo (migrazione `20290610100000`); restano 1.873 vecchi non letti di 46 persone | Pulizia lasciando a ognuno l'ultimo — **solo con il sì del founder** (dati di aziende vere) |
| 0.5 | **Push sui telefoni** | Collegate web e native; dal repository non si vede se i segreti `APNS_*` / `FCM_SERVICE_ACCOUNT_JSON` sono impostati; al 26/09 iscrizioni 0 | Verificare i segreti e fare una prova vera su un iPhone e un Android della Demo 2 |

---

## Fase 1 — Operaio: le basi che mancano

**1.1 Prima apertura guidata.** Oggi: nessuna (`LinguaCampo` ha già il flag `scelta`, mai usato).
Lavoro: alla prima apertura, se la lingua non è stata scelta, schermata con le lingue scritte nella loro
lingua; poi 3 schermate a immagini (timbra, rapportino, segnala) saltabili; poi richiesta permessi
notifiche e posizione spiegata. Si mostra una volta per persona (flag sul profilo, non sul telefono).

**1.2 «Domani».** Oggi: `CampoOggi.tsx` mostra una riga «Domani» con codice e fasi; `campo_mia_giornata`
porta già indirizzo, squadra e capo, ma non vengono mostrati; `campo_promemoria` ha solo gli slot uscita,
rapportino, digest.
Lavoro: scheda «Domani» con indirizzo (apri in mappe), squadra, capo da chiamare, materiale da ritirare
(collegare `MaterialiPerCantiere`); nuovo slot `domani` in `campo_promemoria` alle 18:00, una notifica
sola (stesso schema «sostituisce la precedente» del riepilogo), spento di default per azienda.

**1.3 «Le mie ore del mese».** Oggi: `CampoPresenze.tsx` somma timbrature e rapportini anche solo inviati;
non legge il registro canonico dell'ufficio (`ufficio_leggi_ore`).
Lavoro: RPC `campo_mie_ore(mese)` che legge lo stesso registro dell'ufficio rispettando
`campo_regole_azienda.ore_dalle`; per ogni giorno ore e stato (inviato / approvato / respinto); totale del
mese approvato. Stessi numeri che vede l'ufficio, per costruzione.

**1.4 Documenti del cantiere.** Oggi: visibili solo con QR attivo (`DocumentiQrCampo`), niente scheda.
Lavoro: scheda «Documenti» in `CampoLavoroDetail` per chi è assegnato al cantiere, con i documenti
`operativo` approvati (stessa funzione `documenti-cantiere`), senza dipendere dal QR. Foto «prima»:
filtro per le foto del primo giorno o etichetta «prima».

**1.5 Emergenza.** Oggi: `CampoSegnalaSicurezza` ha `tel:112`, ma non l'indirizzo del cantiere.
Lavoro: riquadro «Emergenza» con 112, indirizzo completo del cantiere letto ad alta voce o grande da
dettare, coordinate GPS, numero del responsabile della sicurezza dell'azienda (impostazione nuova).
Raggiungibile dalla Home con un tocco.

**1.6 Mie scadenze con avviso.** Oggi: l'operaio le vede in Home; il cron `hr-check-scadenze` avvisa solo
gli admin.
Lavoro: il cron avvisa anche l'interessato a 30 e 7 giorni (notifica + push), nella sua lingua.

**1.7 Senza rete, il resto.** Oggi in coda: timbratura, rapportino, prelievi, foto, checklist, DDT, note
vocali. Fuori: spese, segnalazione sicurezza, ticket materiale, segnalazioni e km dei mezzi, verbale.
Lavoro: portare questi cinque su `sync-queue` (stesso schema degli altri) + prova in modalità aereo.

---

## Fase 2 — Caposquadra

**2.1 Lavori extra firmati dal cliente** (il pezzo che fa guadagnare). Oggi: firma del rapporto di fine
lavori e PDF «lavori in economia» solo dall'ufficio; `varianti_cliente` solo ufficio;
`LavoroExtraDaPreventivo` in commessa.
Lavoro: dal cantiere «Lavoro extra»: foto, descrizione, ore e materiale (prezzi dal listino solo se
l'azienda vuole mostrarli), firma del cliente sul telefono, PDF al cliente. In ufficio entra come lavoro
extra della commessa con stato «da fatturare» e passa alla fattura. Interruttore per azienda: chi può
crearlo (capo / tutti) e se mostra i prezzi.

**2.2 Domani della squadra.** Oggi: `CampoSquadra` solo lettura; agenda squadre dietro un flag locale.
Lavoro: il capo vede chi ha domani e dove; «chiedo rinforzi» e «mi serve un mezzo» diventano richieste
all'ufficio (una tabella `campo_richieste_pianificazione`, approvate nella pagina «Da approvare»). Lo
spostamento vero delle persone resta all'ufficio (decisione da confermare).

**2.3 Materiale richiesto: dove è finito.** Oggi: `tickets.merce_stato` si aggiorna all'arrivo
dell'ordine; il richiedente non riceve avvisi e non vede data, ordine e fornitore.
Lavoro: in «Le mie segnalazioni» data prevista, numero d'ordine, fornitore; notifica al richiedente
quando passa a «ordinata» e «arrivata».

**2.4 Chi entra in cantiere.** Oggi: tesserino con QR e verifica pubblica (`verifica_tesserino`), senza
scanner in app, senza controllo dell'assegnazione al cantiere né della ditta.
Lavoro: scanner nell'app del capo; esito verde/rosso: persona in forza, formazione e idoneità, assegnata a
questo cantiere, ditta in regola (DURC e patente a crediti dalla Fase 3); registro ingressi del giorno.

**2.5 Sicurezza del mattino.** Oggi: `CampoChecklistSicurezza` con 12 voci fisse, una per operaio.
Lavoro: «5 minuti di sicurezza» di squadra: argomento, presenti, firma di ciascuno sul telefono del capo;
voci della checklist configurabili per azienda.

**2.6 Fermo per maltempo.** Oggi: niente (solo il meteo automatico nel rapportino).
Lavoro: «Fermo cantiere» con causa, ore perse per persona e meteo del giorno salvato come prova; in
ufficio elenco esportabile per la domanda di cassa integrazione (CIGO). Spento di default.

**2.7 Mezzi.** Quasi completo. Lavoro: rifornimento come registrazione del mezzo (non solo nel rapportino o
come spesa) e segnalazioni dei mezzi in coda senza rete (con 1.7).

**2.8 Fine giornata del capo.** Oggi 3 passi (rapportino squadra, «manca qualcosa?», uscita).
Lavoro: aggiungere uscite della squadra mancanti, km e mezzi, «domani» della squadra (2.2); il passo
«manca qualcosa?» si chiude con «no, tutto a posto».

---

## Fase 3 — Subappaltatore

**3.1 Ingresso della ditta completo** (dopo 0.2). Documenti richiesti a una ditta: visura, DURC, polizza
RC, POS, patente a crediti, documento del titolare; elenco degli operai della ditta con idoneità e corsi
caricato dal sub; scadenze avvisate **anche al sub**, non solo all'ufficio. Una lista «cosa ti manca per
entrare in cantiere» nella Home del sub.

**3.2 I suoi operai.** Oggi `subappaltatori_operai` è solo anagrafica (nessun accesso). Lavoro: il sub
invita i suoi operai (accesso ridotto: tesserino, documenti propri, presenza in cantiere); presenze
collegate a `subappaltatori_operai` e visibili all'ufficio e al capocantiere (con 2.4).

**3.3 I suoi soldi.** Oggi tutto solo in ufficio (`contratti_subappalto`, `sal_subappaltatori`,
`ritenute_garanzia`). Lavoro: pagina «Contratto e pagamenti» del sub, in sola lettura: lavori affidati e
prezzi, maturato per SAL, pagato, ritenuta, prossimo pagamento previsto. Interruttore per azienda (c'è chi
non vuole mostrarlo).

**3.4 Ordini di servizio e contestazioni.** Oggi: non esistono (solo sub → ufficio). Lavoro: tabella nuova
con invio dall'ufficio o dal capocantiere, foto, scadenza, conferma di lettura del sub, chiusura del sub
con foto, accettazione o riapertura di chi l'ha mandata.

---

## Fase 4 — Ufficio e cose comuni

**4.1 «Da approvare oggi», una pagina sola.** Oggi `ufficio_da_approvare` copre rapportini, timbrature
dimenticate e bolle; spese e ferie stanno in Personale › Richieste, i ritiri in Magazzino, i lavori extra
nella commessa. Lavoro: estendere la RPC a spese (`campo_spese`), ferie e permessi, ritiri
(`prelievi_campo`), lavori extra (2.1) e richieste di pianificazione (2.2); approvare da lì con un tocco,
con link alla pagina completa. `CantieriOggi.tsx`, orfana, va tolta o ricollegata.

**4.2 Posizione e legge (art. 4 Statuto dei lavoratori).** Oggi la timbratura chiede il GPS senza
informativa; il consenso esiste solo per il tracciamento dei tecnici (`tecnico_gps_consent`).
Lavoro: informativa mostrata e accettata (presa visione registrata) prima della prima timbratura con
posizione; in Impostazioni azienda l'archivio dell'accordo sindacale o dell'autorizzazione dell'Ispettorato,
con avviso al titolare se manca. Testo dell'informativa da far approvare a un legale.

**4.3 Traduzioni riviste.** Oggi tutte automatiche, colonna «OK?» vuota nei fogli. Lavoro: madrelingua
per rumeno, albanese e arabo per primi; partire da sicurezza e infortuni.

**4.4 Prova sul campo.** Una settimana in un'azienda pilota (5 operai, un caposquadra, un sub), con la
matrice di collaudo e le correzioni in giornata.

---

## Ordine consigliato

1. Fase 0 (sicurezza, documenti sub, app iPhone, push).
2. 2.1 Lavori extra firmati.
3. 4.1 Da approvare oggi.
4. 1.3 Le mie ore del mese.
5. 3.1 + 3.3 Ingresso ditta e soldi del sub.
6. Il resto della Fase 1, poi 2.2–2.8, poi 3.2 e 3.4, poi 4.2–4.4.

## Decisioni del founder prima di partire

- **Aggiornamento automatico dell'app installata** (Capgo o simili): le novità arrivano senza passare dallo
  store. Costo mensile e revisione Apple da valutare.
- **Pulizia delle 1.873 notifiche vecchie** (0.4).
- **Lavori extra**: chi li crea (capo o tutti) e se l'operaio vede i prezzi.
- **Domani della squadra**: il capo chiede e l'ufficio decide, oppure il capo sposta da sé.
- **Soldi del sub visibili**: di default acceso o spento.
- **Fermo maltempo / CIGO**: serve davvero ai clienti di oggi?

---

## Stato al 26/11/2026 (sera)

| Punto | Stato | Dove |
|---|---|---|
| 0.1 Rotte del subappaltatore | **Fatto** | `SoloPersonaleInterno`, test `campoRottePerRuolo` |
| 0.2 Documenti del sub nell'ufficio | **Fatto** | fascicolo `subappaltatori_documenti` dal telefono; RLS per ditta (`20290610100100`, `…100200`) |
| 0.3 App iPhone vecchia | **Da fare (founder)** | serve una build nuova su TestFlight/App Store; 0 telefoni iscritti alle push native |
| 0.4 Notifiche accumulate | **Fatto** | 1.873 → 46; riepilogo sempre uno (`20290610100000`) |
| 0.5 Push | **Verificato** | segreti APNS/FCM/VAPID presenti; manca la build nativa (0.3) |
| 1.1 Prima apertura | **Fatto** | `PrimaAperturaCampo` |
| 1.2 Domani | **Fatto** | riquadro in `CampoOggi`; avviso 19:00 spento di default (`campo_avvisi_azienda`) |
| 1.3 Le mie ore | **Fatto** | `campo_mie_ore`, `OreApprovateMese` |
| 1.4 Documenti del cantiere | **Già c'è** | l'operaio vede la selezione del cartello QR (`DocumentiQrCampo`) |
| 1.5 Emergenza | **Fatto** | `DoveSiamo` in `CampoSegnalaSicurezza` |
| 1.6 Mie scadenze | **Fatto** | `hr-check-scadenze` pubblicata dal CI alle 11:43 |
| 1.7 Senza rete | **Fatto** per spese, segnalazioni, sicurezza (con foto), mezzi e verbale | verbale: la bozza resta sul telefono e si salva al ritorno del segnale (`verbaleSulTelefono`); PDF e firma restano col segnale, di proposito |
| 2.1 Lavori extra | **Fatto** (bozza dal cantiere → ufficio prezza e manda in firma) | `campo_lavoro_extra_crea` |
| 2.2 Domani della squadra | **Fatto** come segnalazione «serve entro domani» | `CampoSquadra` |
| 2.3 Materiale chiesto | **Fatto** | trigger `campo_materiale_avvisa_richiedente` |
| 2.4 Ingressi | **Fatto** | `campo_ingresso_verifica`, `CampoIngressi` |
| 2.5 Sicurezza del mattino | **Fatto** | `campo_briefing_registra`; ufficio in Sicurezza cantiere › Infortuni |
| 2.6 Fermo maltempo | **Fatto** | `campo_fermo_registra`, CSV in Personale › Richieste |
| 2.7 Mezzi | **Già c'è** | litri in `mezzi_giornate` dal rapportino |
| 2.8 Fine giornata | **Fatto** («No, tutto a posto») | |
| 3.1 Ingresso della ditta | **Fatto** (cosa manca) | `statoDocumentiDitta` |
| 3.2 Operai del sub | **Fatto in parte** | elenco dall'app della ditta + ingresso senza tesserino; login personali da fare (ruolo nuovo) |
| 3.3 Soldi del sub | **Fatto** | `campo_sub_contratti`, interruttore in regole |
| 3.4 Ordini di servizio | **Fatto** | `ordini_servizio_ditte` |
| 4.1 Da approvare | **Fatto** | `ufficio_altre_approvazioni` (spese, ferie, ritiri, extra) |
| 4.2 Posizione e legge | **Fatto** (informativa + riquadro ufficio) | testo da far approvare a un legale |
| 4.3 Traduzioni | **Da fare (madrelingua)** | fogli in `docs/lingua/revisione` |
| 4.4 Prova sul campo | **Da fare (founder)** | |

**Bloccante comune:** dal 26/11 mattina il CI non pubblica le edge function: il controllo «Complete offline
database reconstruction» si ferma su `20290611100000_annulla_fattura_mai_uscita.sql` (non di questo piano) e il
job «Deploy edge functions» lo richiede. Il deploy a mano con la CLI si blocca sull'accesso al portachiavi.
