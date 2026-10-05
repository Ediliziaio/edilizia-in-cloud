# Piano: un solo preventivatore, con la barra delle fasi del Fotovoltaico e l'anteprima live del preventivo classico

Stato (05/10/2026, sera): **Serramenti e gli otto moduli edili sono fatti in locale** (ramo
`preventivatore-unico`, non pubblicati); restano il Fotovoltaico e il preventivo classico. Prototipo da aprire nel browser:
[`docs/anteprima-preventivatore-unico.html`](anteprima-preventivatore-unico.html) (3 moduli, computer e telefono, dati di esempio).

## 0. Decisioni prese e cosa è già fatto

Florin ha deciso: **si parte da Serramenti**; l'anteprima di default è la **veloce** (il PDF vero a richiesta);
**«Impresa» (costi e margine) solo con il permesso** (`canViewMargins` o `canViewCosts`, come lo step Economia);
**la colonna dell'anteprima stretta**, e che si restringe ancora quando manca spazio.

Fatto per Serramenti (Lotti 0, 1, 2 e 3a):
- le barre fisse **non funzionavano da computer** in nessun preventivatore (la pagina aveva l'altezza libera e
  scorreva il documento intero: provato con una pagina di prova). Ora le rotte del wizard Serramenti sono tra
  quelle ad altezza bloccata di `CompanyLayout`, come il preventivo classico;
- `src/components/preventivatore/`: barra delle fasi (con totale), anteprima veloce, pannello con gli interruttori,
  piede, tendina da telefono; `src/lib/serramenti/anteprima.ts` dispone i numeri di `calcolaTotale` (gli stessi del
  PDF) e `margine.ts` è il margine della vista impresa;
- la colonna a destra c'è da **1280 px** (la barra laterale dell'app ne toglie 240: a 1024 il lavoro resterebbe in
  ~410 px), larga `clamp(300px, 26vw, 400px)`; sotto 1280 px niente colonna: il totale resta nella barra e
  l'anteprima si apre da un pulsante (tablet) o dal totale nel piede (telefono). Nelle tab si legge il nome
  corto, quello per esteso è nella striscia «Passo X di N»;
- 46 test nuovi, più i 26 file correlati verdi.

Fatto per gli **otto moduli edili** (Lotti 4 e 5, tutti insieme: sono copie quasi identiche, quindi un solo guscio
e un solo adattatore al posto di otto cornici):
- `components/preventivatore/GuscioEdile`: testata, barra delle fasi col totale, anteprima a destra, piede fisso e
  tendina da telefono, uguali per tutti. Il wizard di ogni modulo tiene il suo stato e i suoi passi; la rotta del
  modulo è in `components/preventivatore/rotte` (altezza bloccata) e un test controlla che l'elenco coincida con i
  wizard che usano il guscio;
- `lib/preventivatore/anteprimaComputo.ts`: dalle voci del computo all'anteprima. Non calcola niente di suo: usa
  `calcTotaliComputo` e `calcRigaImporto` del modulo, gli stessi dello step Economia e del PDF;
- **decisione di Florin: «sì toglili, solo anteprima a destra»**. Via il riquadro dei totali dal Computo
  (`ComputoEditor`) e le card «Riepilogo per capitolo», «Totali complessivi» e «Margine complessivo» da Economia.
  Restano i Parametri e ciò che non è un totale: Conto Termico e Casa Full Electric (termoidraulico), il riepilogo
  per ambiente e il verdetto «Prezzo di zona» (ristrutturazione, ora sotto il computo), i pacchetti (bagni);
- la detrazione indicativa (col tetto di spesa) e il margine (vista Impresa, «—» se un costo manca) sono ora
  nell'anteprima; **il margine lo vede solo chi ha il permesso**: prima in Economia lo vedeva chiunque;
- il riepilogo (totali, e il margine nella vista Impresa) sta **fisso in fondo alla colonna**: scorrono le righe, il
  totale resta in vista (anche nella tendina da telefono). Sul tablet la barra cede l'etichetta del totale e il
  pulsante dell'anteprima diventa solo l'occhio;
- «nascondi l'anteprima» vale per tutti i preventivatori (una sola preferenza nel browser).

Da fare: **3b** la riga che si modifica sul posto in Serramenti (le scelte «apertura», «colore» sono variabili del
listino, non campi liberi: serve un disegno a parte, e un'altra sessione lavora su quei file), poi il Fotovoltaico e
il preventivo classico sul guscio.

## 1. Cosa hai chiesto

Tutti i preventivatori devono essere come quello che ti piace: **fasi in alto**, **più spazio**, e **a destra il
preventivo che si compone mentre scrivi**, come esce. Semplice, intuitivo, rapido.

Verificato sul codice: le due cose che ti piacciono oggi stanno in **due posti diversi**.

| Cosa | Dove sta oggi |
|---|---|
| Barra delle fasi fissa in alto, colonna larga, footer con «Avanti» | **Fotovoltaico** |
| Anteprima live a destra, sempre accesa | **Preventivo classico** (`QuoteBuilder`) |

Il Fotovoltaico a destra **non ha niente** (la sua larghezza viene proprio dall'assenza di colonne). Il classico ha
l'anteprima ma le fasi stanno in una scheda che scorre via. Il piano le mette insieme in un unico guscio.

## 2. Com'è oggi (verificato)

| Famiglia | Fasi | Spazio | Anteprima a destra | Totale visibile | Footer |
|---|---|---|---|---|---|
| **Fotovoltaico** (8 fasi) | barra in alto fissa, spunte, «Fase X di 8 · % · ~min» | colonna unica fino a 1400 px | nessuna (solo KPI dentro le fasi; PDF solo alla fase 8) | KPI per fase | fisso, «Salvataggio automatico» |
| **Preventivo classico** (3 passi) | scheda in alto, non fissa | form + colonna 340–420 px | **sì**, bozza visiva sempre accesa; non mostra incentivi né finanziamento | in testata e nel pannello | fisso, ma con spostamento fisso a 280 px |
| **Serramenti** (6 passi) | **lista verticale a sinistra**, non fissa | form 540–780 px tra due colonne | «Scheda» senza prezzi, oppure PDF live (spento di default) | **solo al passo 5 di 6** | non fisso da computer |
| **8 moduli edili** (bagni, tetti, clima, elettrico, termoidraulico, pavimenti, piscine, ristrutturazione; 6 fasi) | **barra laterale a sinistra** | contenuto 9–10 colonne su 12 | solo un riquadro di 300 px **dentro** il Computo | in Computo ed Economia | fisso solo da telefono |

Le «3 tabelle» che vedi: nei moduli edili sono la tabella di Economia più le **3 card** a destra (Parametri, Totali,
Margine); in Serramenti sono le **3 colonne** (passi · form · scheda). Il nuovo guscio le toglie tutte e due.

Tre fatti che pesano sul piano:
1. I moduli edili sono **copie quasi identiche** (≈84% di righe uguali: circa 20.300 righe di wizard, 8.000 di
   hook e 10.000 di editor del computo duplicate). Cambiare la cornice «a mano» significa farlo 8 volte.
2. Esistono già **due dialetti** dei componenti (`wizardUI.tsx` del Fotovoltaico e `builderUI.tsx` del classico) più
   quello di Serramenti. I pezzi del Fotovoltaico sono già generici (nessun dominio dentro).
3. Il PDF vero dei moduli edili e di Serramenti si fa **nel browser** (`@react-pdf`): si può mostrare dal vivo. Il
   classico lo fa solo sul server dopo il salvataggio; il Fotovoltaico ha un renderer HTML comune a client e server.

## 3. Il design

Vedi il prototipo. In breve, per ogni modulo, da computer:

```
┌─ ← SR-2026-0412  Bozza   Rossi Mario · Sostituzione infissi        ● Salvato 11:24  [Duplica] [⋯] ┐  ~52 px
├─ ✓ Contatto  ✓ Immobile  ③ Composizione  ④ Foto  ⑤ Economia  ⑥ PDF        │ TOTALE IVA incl. 5.121 € ┤  ~52 px (fissa)
│  Passo 3 di 6 · ▬▬▬▬▬ 50% · ~4 min                                                                   │  ~28 px
├────────────────────────────────────────────┬──────────────────────────────────────────────────────┤
│  Passo 3 — Cosa offri                      │  [Anteprima | PDF vero]  [Cliente | Impresa]         │
│  ┌ Composizione offerta ─────────────┐     │  ┌ Bianchi Infissi — Preventivo SR-2026-0412 ─────┐  │
│  │ ▢ Finestra PVC   [2 ante▾][Bianco▾]│    │  │ Cliente: Mario Rossi, Via Garibaldi 12          │  │
│  │                  −  3  +   2.460 € │    │  │ ▢ Finestra PVC     3 × 820    2.460 €           │  │
│  │ ▢ Portafinestra …                  │    │  │ …  Imponibile · Sconto · IVA · TOTALE            │  │
│  └────────────────────────────────────┘    │  └──────────────────────────────────────────────────┘ │
│  form: 100% dello spazio rimasto           │  fisso, 430 px, scorre da solo; totale sempre in fondo │
├────────────────────────────────────────────┴──────────────────────────────────────────────────────┤
│ ● Salvataggio automatico                                    [← Indietro] [Salva bozza] [Avanti →] │  ~56 px (fisso)
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Pezzi** (tutti già esistenti, si estraggono e si rendono uguali per tutti):
- **Testata a una riga** (oggi nel Fotovoltaico sono ~125 px su due righe): codice, stato, titolo, salvataggio, Duplica.
- **Barra delle fasi fissa**: numero → spunta verde, sottolineatura arancione, puntino rosso se manca qualcosa,
  striscia «Passo X di N · % · ~min». **Il totale sta a destra della barra**: lo vedi sempre, anche sul tablet.
  Indietro è sempre libero; avanti solo verso fasi completate o la successiva, **e passa dalla stessa verifica del
  bottone** (oggi nel Fotovoltaico la tab «successiva» salta il controllo: da non copiare).
- **Anteprima a destra** (≥1100 px): il preventivo come lo vede il cliente, **si ricalcola a ogni tasto**; la riga
  che stai toccando si evidenzia anche a destra. Due livelli: **Anteprima** (veloce, istantanea) e **PDF vero**
  (il documento definitivo, si rifà ogni 1,5 s, solo se lo apri). Interruttore **Cliente | Impresa**: l'impresa vede
  costi e margine (oggi sparsi tra la fase 7 del Fotovoltaico, gli aside del Computo e le card di Economia).
- **Tablet (640–1099 px)**: l'anteprima diventa un pannello che si apre dal bottone «Anteprima · totale»; il totale
  resta nella barra. **Telefono**: fasi a pillole, **totale nella barra in basso**, anteprima che sale dal basso con
  un tocco (come nel prototipo, vista «Telefono»).
- **Footer fisso**: stato del salvataggio **vero**, Indietro / Salva bozza / Avanti arancione, e il motivo quando
  «Avanti» è spento.

**Regole di semplicità** (le uso per decidere cosa tenere):
1. La scelta che decide come lavori sta **in cima** al passo, senza valore preselezionato (listino, modalità prezzo).
2. Il totale si vede **sempre**, dal passo 1 (oggi in Serramenti compare al 5°).
3. Cambiare una cosa costa **al massimo 2 clic** e si vede subito a destra (oggi in Serramenti sono ≥5).
4. Niente doppioni: l'aside del Computo e le card di Economia confluiscono nel pannello.
5. Ciò che manca si vede **subito** (puntino sulla fase, riga «da prezzare» in ambra), non in un avviso alla fine.
6. Testate strette: il primo campo del form entro ~230 px dall'alto a 1440×900 (**da misurare** nel browser,
   non a occhio; oggi il Fotovoltaico è intorno a 250 px).
7. Un solo comportamento di salvataggio, e il footer dice la verità: «Salvato 11:24» oppure «Solo su questo
   dispositivo» (oggi il Fotovoltaico scrive «Salvataggio automatico» anche quando è solo nel browser).
8. Stesse regole su telefono: cambia solo la disposizione.

## 4. Come lo faccio (piano di sviluppo)

**Principi**: nessuna migrazione del database; **i numeri non cambiano** (si cambia la cornice e si aggiunge
l'anteprima); un modulo alla volta, con un interruttore (per azienda) per accendere il nuovo guscio e tornare
indietro in un attimo; ogni lotto si vede e si prova prima del successivo.

| Lotto | Cosa | Taglia | Alla fine vedi |
|---|---|---|---|
| **0 · Terreno** (fatto) | Verifico nel browser se barra e footer «fissi» si agganciano davvero da computer: le rotte devono stare in `isViewportEditor` (`CompanyLayout.tsx:1801`), come il classico. Inventario di deep link e chiavi di fase (`?step=pdf` usato dal bot WhatsApp dei bagni, `?modello=`, prefill CRM). Test che bloccano i totali (già 8 `calcoli.test.ts`) + test nuovi sulle righe dell'anteprima. | S | Niente di diverso a schermo; la rete di sicurezza c'è. |
| **1 · Guscio comune** (fatto, adottato da Serramenti) | Estraggo i pezzi di `wizardUI.tsx` e `builderUI.tsx` in `src/components/preventivatore/` (barra fasi, testata, footer, card, KPI, callout, chip) e il ciclo di vita ora dentro il Fotovoltaico (cambio fase, blocco, bozza locale, dialog «riprendi/salva ed esci», sola lettura) in un hook. Nuovo `PreventivatoreShell`. Il **Fotovoltaico** lo adotta per primo; i vecchi nomi `Fv*` restano come alias. | M | Fotovoltaico con testata a una riga e totale nella barra; tutto il resto uguale. |
| **2 · Anteprima live** (fatta per Serramenti; mancano Fotovoltaico e classico) | `AnteprimaLive` con un contratto unico (cliente, gruppi di righe, totali, incentivi, avvisi) e un «adattatore» per modulo. Interruttori Anteprima/PDF vero e Cliente/Impresa (**solo per chi ha il permesso di vedere i margini**), pannello tablet, tendina telefono. Lo adottano il **classico** (che ha già un pannello: gli aggiungo gli incentivi che oggi non mostra) e il **Fotovoltaico** (kWp, produzione, prezzo, detrazione; «PDF vero» col renderer HTML che già esiste). | M | Fotovoltaico e classico = il tuo modello completo. |
| **3 · Serramenti** (3a fatto: guscio e pannello; 3b da fare: la riga sul posto) | Guscio e pannello al posto di lista a sinistra + scheda; «PDF vero» = l'anteprima PDF che c'è già. **Riga che si modifica sul posto** (apertura, colore, misure, complementi: oggi si riapre la scheda, ≥5 clic) con disegno e prezzo; il listino resta per aggiungere. Totale dal passo 1. | L | Il guadagno di velocità più grosso. |
| **4 · Un modulo edile pilota** | **Termoidraulico**: un guscio guidato da una scheda del modulo (slug, tabella, fasi, etichetta della fase 2, IVA, incentivi) al posto della cornice copiata; stato del computo portato in alto (oggi lo tiene `StepComputo` da solo); adattatore delle righe; tolgo i doppioni (aside del Computo, card di Economia). Adeguo i 4 test che leggono i sorgenti come testo. | M | I moduli edili come Serramenti e Fotovoltaico. |
| **5 · Gli altri 7 edili** | A gruppi di 2–3: Climatizzazione, Elettrico, Piscine, Pavimenti; poi **Bagni** (deep link del bot), **Tetti** (ha un suo strato di modelli), **Ristrutturazione** (IVA 22, colonna ambiente, «converti in commessa»). Ognuno conserva le sue differenze (elenco sotto). | M ×3 | Tutti i preventivatori uguali. |
| **6 · Finiture** | Salvataggio unificato e onesto, scorciatoie (Invio avanza, ⌘/Ctrl+Invio = Avanti), accessibilità, prove su telefono vero, misure (primo campo, tempo di aggiornamento), pulizia dei vecchi gusci. **Facoltativo:** accorpare i 20.000 righe duplicate dei moduli edili. | S–M | Rapido anche su macchine lente. |

**Cosa tengo di ogni modulo edile** (le divergenze trovate): Termoidraulico → Conto Termico e Casa Full Electric;
Bagni → `?step=pdf`, pacchetti nel Computo, calcolatore rivestimenti, interruttore «accessibile»; Tetti → strato
modelli proprio, falda/lattoneria/amianto; Ristrutturazione → IVA 22, ambiente, prezzo di zona, converti in commessa;
Climatizzazione/Elettrico/Piscine/Pavimenti → solo campi e costanti del mestiere.

**Rischi e come li tengo**
- *Barre che non restano fisse da computer* (area `main` con altezza non bloccata): si prova nel Lotto 0 e si registra
  la rotta come fa il classico.
- *Colori e animazioni del Fotovoltaico* dipendono da classi globali (`animate-fv-fade-in`, `fv-tab-scroll`,
  `tap-compact`, `orange-*`/`eic-amber` per il white-label): si spostano insieme ai componenti.
- *Test che leggono i sorgenti come testo* (`modelliPreventivoModuliEdili`, `preventiviModuliFirmaEPiano`,
  `mediaProgettiPrivati`, `paroleDeiCodici`, `queryFiltrateAzienda`): si adeguano nello stesso commit.
- *Nessun test di rendering dei wizard*: ne aggiungo uno per il guscio e uso la prova visiva locale (pagina senza
  login) per confrontare prima/dopo.
- *Anteprima ≠ PDF*: la veloce è «bozza visiva»; il PDF vero resta l'ultima parola e l'etichetta lo dice.
- *Costi e margine visibili a chi non deve*: l'interruttore Impresa passa dai permessi esistenti.
- *Peso*: `@react-pdf` ricalcola in 1–2 s; per questo il PDF vero è a richiesta e l'anteprima di default è leggera.

## 5. Simulazioni

Ogni caso con «oggi» ricavato dal codice e «domani» come **obiettivo di progetto** (le cifre di domani si misurano a
lotto finito, non sono promesse).

| # | Caso | Oggi | Domani | Come lo misuro |
|---|---|---|---|---|
| 1 | **Serramenti**: 3 finestre + 1 portafinestra + 4 persiane, cliente nuovo | Dal 2° passo bloccato finché non si crea il preventivo; ogni infisso dal listino = finestra a 4 passi (tipologia, linea, prodotto, misure); apertura, colore e complementi dopo, riaprendo la scheda: ≥5 clic su due pannelli; totale al passo 5 di 6 | Barra e totale da subito; riga con apertura/colore sul posto: 2 clic; disegno, prezzo e documento a destra | clic per «cambia apertura e vedi il nuovo totale»: ≥5 → 2; passo del primo totale: 5° → 1° |
| 2 | **Bagno completo**, 12 voci in 3 capitoli | 6 fasi con barra laterale; Computo con 4 sorgenti nel selettore e riquadro totali di 300 px solo lì; Economia con tabella + 3 card | Stesse fasi; preventivo a destra dal primo passo, totali e detrazione sempre in vista; i doppioni spariscono | larghezza utile del form; fasi con totale visibile: 2 su 6 → 6 su 6 |
| 3 | **Fotovoltaico** 6 kWp + accumulo | 8 fasi, nessuna anteprima; KPI per fase; PDF solo alla fase 8; la fase 6 chiama il server | Dalla «Configurazione»: kWp, produzione, prezzo e detrazione a destra; «Impresa» = costi e margine | fasi con preventivo visibile: 0 → 4 su 8 |
| 4 | **Preventivo classico**, 3 passi | Fasi in scheda non fissa; anteprima 340–420 px senza incentivi/finanziamento; footer fisso con spostamento fisso | Barra fissa come gli altri; stesso pannello + incentivi e finanziamento | incentivi in anteprima: no → sì |
| 5 | **Telefono in cantiere** (390 px) | Fotovoltaico e moduli edili: pillole; classico: sotto 640 px **nessuna anteprima**; Serramenti: non verificato | Pillole + totale nella barra in basso + anteprima a tendina in un tocco, ovunque | prova su telefono vero |
| 6 | **Preventivo lungo** (60 righe) | Capitoli comprimibili nel Computo; totale nel riquadro laterale | Il pannello scorre da solo, totali fermi in fondo, la riga toccata si evidenzia a destra | aggiornamento anteprima ≤ 100 ms (memo + debounce) |
| 7 | **Interruzione e ripresa** (browser chiuso, telefono scarico) | Fotovoltaico: bozza solo nel browser (7 giorni), server solo su Avanti/Salva, ma il footer dice «Salvataggio automatico»; moduli edili e Serramenti: server dopo 2 s; classico: locale 500 ms o server 60 s | Un solo comportamento: locale subito + server dopo 2 s; footer «Salvato 11:24» o «Solo su questo dispositivo»; stesso «riprendi bozza» | prova: chiudo a metà e riapro |
| 8 | **Voce senza prezzo** | Fotovoltaico: avviso all'emissione; altri: non verificato | Riga in ambra «da prezzare» nel pannello, puntino rosso sulla fase, elenco nella lista prima di emettere | avvisi trovati prima dell'ultimo passo |
| 9 | **Margine** (vista impresa) | Fase 7 solo nel Fotovoltaico; aside e card nei moduli edili | Interruttore Cliente \| Impresa sempre sopra l'anteprima, solo con permesso | stessa informazione, un solo posto |
| 10 | **Link del bot WhatsApp** (`?step=pdf` dei bagni), prefill CRM, `?modello=` | Funzionano | Le chiavi di fase non cambiano; test nuovo che le blocca | il test fallisce se cambiano |
| 11 | **Azienda con colori propri** (white-label) | Tab e pulsanti prendono `orange-*`/`eic-amber` | Identico: le stesse classi viaggiano coi componenti | confronto visivo |
| 12 | **Sola lettura** (preventivo firmato/emesso) | Fotovoltaico: avviso giallo con «Clona» e «Vai al dettaglio» | Stesso avviso in tutti, anteprima accesa | uguale dappertutto |

## 6. Cosa mi serve da te

Risposte già date: si parte da Serramenti, anteprima veloce di default, «Impresa» solo col permesso,
anteprima stretta; nei moduli edili si tolgono i riquadri dei totali e resta solo l'anteprima a destra.

Da decidere per i prossimi lotti:
1. **Fotovoltaico**: aggiungere la colonna a destra gli toglie un po' dello spazio largo che ti piace (a 1440 px il
   lavoro passa da ~1090 a ~700 px). Va bene, con la colonna nascondibile?

## 7. Fuori da questo piano

Modelli e contenuti del PDF, listini, calcoli e incentivi, firma elettronica, database e permessi. Nessuna
migrazione prevista.
