# Piano: una testata sola per tutte le schede di Commesse (25/11/2026)

Pagina `/azienda/ordini`, nove schede nell'ordine: Commesse, Rapportini, Sopralluoghi,
Richieste d'offerta, Acquisti, DDT, Anomalie, Marginalità, Provvigioni.

## Il problema, misurato

Ogni scheda disegna la propria testata: in `OrdersList.tsx` non c'è una parte comune.

- **Spazio prima della tabella.** Commesse arriva alla tabella in circa 240px, le altre schede in 350-450px.
- **Il blu grande.** Da Rapportini in poi il riepilogo è `OperationalSummary`, con icona da 40px, titolo `text-lg` e numeri `text-2xl`. Commesse e Marginalità usano invece le card compatte (`OrdersSummaryCard`, numeri `text-base`).
- **Titolo e sottotitolo.** Cinque schede non hanno la classe `.testata-pagina` e mostrano titolo `text-2xl` più il sottotitolo: Rapportini, Sopralluoghi, Richieste d'offerta, DDT e Provvigioni. Provvigioni usa un h2 invece di un h1.
- **Altezze dei controlli.** Sono h-8 in Commesse, Sopralluoghi, Richieste d'offerta, Acquisti e DDT; h-9 in Rapportini, Provvigioni e Marginalità; h-10 in Anomalie e nella «Nuova richiesta».
- **Bottone «Nuovo».** Ha cinque stili: sfumato, arancio pieno sm, arancio pieno h-10, `QuotePrimaryButton` e blu (in Anomalie e Provvigioni).
- **Esportazione.** Ha cinque forme: nel menu «⋯», in un menu «Esporta ▾», come bottone CSV diretto, dentro la barra dei filtri (Provvigioni), oppure manca del tutto (Sopralluoghi, Richieste d'offerta).
- **Ricerca.** In Rapportini sta a destra, nelle altre schede a sinistra. In Anomalie i filtri vengono prima del riepilogo.
- **Spazi verticali.** Cambiano da scheda a scheda: `space-y-3`, `-4`, `-5` o `-6`.

## La regola unica (il modello è Commesse, la scheda più compatta)

```
Riga 1 — Titolo h1 text-xl · [azioni secondarie outline h-8] · [⋯ Importa/Esporta] · [+ Nuovo, sfumato arancio h-8]
Riga 2 — Riepilogo compatto: fascia navy px-3 py-2, numeri text-base, al massimo 4 pastiglie (OrdersSummaryCard)
Riga 3 — Barra: Ricerca a sinistra h-8 · Select h-8 · Vista · Filtri ▾ · (a destra) «N risultati» · Azzera
Tabella
```

- **Altezza unica h-8** per ogni controllo da computer. Da telefono restano le pillole h-9 di `FiltriMobile`.
- **Esportazione sempre nello stesso posto**: il menu «⋯» in testata, con le voci CSV, Excel e PDF. Mai dentro la barra dei filtri.
- **«Nuovo» sempre arancio sfumato h-8**, mai blu. Il blu resta per i link e per la linguetta attiva.
- **Niente sottotitolo da computer.** Le spiegazioni vanno nel `?` (`OperationalHelp`).
- **Contenitore `space-y-3`** in tutte le schede.

## Lotti (2-3 pezzi per lotto, ciascuno verificato nel browser a 1440, 1280 e 1024)

### Lotto 1 — i pezzi comuni (nessuna scheda cambia ancora aspetto)
1. Creare `components/orders/TestataScheda.tsx`, con le parti titolo, azioni, menu «⋯» con Esporta/Importa e bottone «Nuovo». Deve avere la classe `testata-pagina`.
2. Creare `components/orders/BarraElenco.tsx`, con ricerca h-8 a sinistra, uno spazio per i filtri, vista, «Filtri ▾», conteggio e «Azzera». È il blocco oggi copiato a mano in 4 file.
3. Aggiungere a `OperationalSummary` la variante `compatto`: fascia `px-3 py-2`, niente icona da 40px, titolo `text-sm`, numeri `text-base`, niente suggerimenti sotto le metriche. La variante vale per tutti, così le pagine fuori da Commesse (Magazzino, Ticket) non cambiano.

### Lotto 2 — le schede col blu più grande
4. **Rapportini.**
   - Usare la testata comune: «Esporta» passa nel «⋯» e «Crea documento PDF» diventa una voce dello stesso menu.
   - Periodo e mese passano nella barra, accanto ai filtri.
   - La ricerca va a sinistra e tutto diventa h-8.
   - Riepilogo compatto; «Statistiche del mese» resta un `<details>` chiuso.
5. **Sopralluoghi.** Usare la testata comune, togliere il sottotitolo, rendere sfumato il «Nuovo», usare il riepilogo compatto.
6. **Richieste d'offerta.** Come Sopralluoghi, con il «Nuovo» da h-10 a h-8. Aggiungere «Esporta CSV» nel «⋯».

### Lotto 3
7. **Acquisti.** Lasciare `QuotePageHeader` per la testata comune, mettere «Esporta» nel «⋯» e il «Nuovo OdA» nello stesso stile degli altri. Il contenitore passa da `space-y-6` a `space-y-3`.
8. **DDT.** Usare la testata comune: «Esporta» va nel «⋯»; «Documenti in ingresso» e «Carica più bolle» diventano outline h-8. Riepilogo compatto.
9. **Anomalie.**
   - Il riepilogo torna prima della barra.
   - La toolbar scende da h-10 a h-8.
   - Il «Nuova anomalia» blu va nella testata e diventa arancio sfumato.
   - «Esporta» va nel «⋯».

### Lotto 4
10. **Marginalità.** Le azioni «Esporta vista» e «Aggiorna» vanno nel «⋯». La ricerca diventa h-8. I chip dello stato del margine diventano un Select. «Struttura %» e «Target %» passano nel pannello «Filtri ▾».
11. **Provvigioni.** Usare un h1 nella testata comune.
    - «Configura venditori» diventa un'azione secondaria e «Aggiungi compenso» diventa il «Nuovo» arancio.
    - «Esporta» esce dalla barra ed entra nel «⋯».
    - I quattro Select passano da h-9 a h-8; «Data di riferimento» va nel pannello Filtri.
12. **Collaudo di tutte le schede insieme.** Misurare dove comincia la tabella (`getBoundingClientRect().top`) in ogni scheda: l'obiettivo è circa 240px, come Commesse.

## Rischi da controllare
- **Test.** I test UI che cercano i testi dei bottoni («Esporta», «Nuova anomalia», «Aggiungi compenso») vanno aggiornati, non tolti.
- **Telefono.** `useSlotAzioniSezione` mette già «+» e «⋯» nelle pillole: la testata comune da telefono non deve duplicarli.
- **Traduzioni.** Le frasi nuove servono in rumeno e albanese (`ufficioLingua.test.ts`): meglio riusare le frasi che esistono già.
