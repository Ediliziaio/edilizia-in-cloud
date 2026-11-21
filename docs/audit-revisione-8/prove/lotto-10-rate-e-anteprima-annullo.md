# Revisione 8 · Prima Nota, rate e anteprima di revoca

Allineato a `f4c4aaa57` di `origin/main`. Le nuove migrazioni sono state applicate alla base sintetica locale, che comprende 6.186 versioni. Le prove browser usano Chrome con l’utente di collaudo e il database locale.

## EIC080 · Incassi delle rate

Prima la scrittura di Prima Nota poteva passare da 400 a 250 € e cambiare data mentre la rata risultava ancora incassata per 400 € alla vecchia data. Eliminare la scrittura lasciava la rata chiusa.

Ora una rettifica della data aggiorna la rata nella stessa transazione. L’incasso manuale rappresenta la rata intera. Per cambiare l’importo pattuito si elimina l’incasso, si corregge il piano e si registra di nuovo. In presenza di due rettifiche della stessa versione, una riesce e l’altra chiede di aggiornare. L’eliminazione riapre la rata e il retry conserva lo stesso esito. Due inserimenti della stessa rata producono una sola registrazione. [Migrazione](../../../supabase/migrations/20290502081600_rata_incasso_prima_nota_coerenti.sql) · [Regressione](../../../src/test/security/rataIncassoPrimaNota.test.ts)

Da Chrome autenticato, il movimento da 400 € è stato corretto al 9 novembre. La data era uguale in entrambe le tabelle. Dopo l’eliminazione, la rata risultava da incassare con 400 € ancora dovuti. Registrandola di nuovo dalla commessa, la Prima Nota ha registrato una sola entrata da 400 €, con la stessa data della rata.

## EIC074 · Anteprima di revoca

Il popup mostra le misure delle voci e la percentuale della fase prima e dopo. L’anteprima usa la stessa ricostruzione quantitativa della revoca e una stima superata viene respinta alla conferma. Se il dato può includere una rettifica manuale, il popup mostra il valore che verrà mantenuto.

| Scenario verificato | Esito |
| --- | --- |
| Da 50 m², revoca prima 20 e poi 30 m² | 30 m², poi 0. La fase mostra 30% dopo la prima revoca. |
| Da 50 m², revoca prima 30 e poi 20 m² | 20 m², poi 0. |
| Misura corretta a mano a 75 m² dopo l’apertura | L’anteprima vecchia riceve 409. La nuova mostra e conserva 75 m². |
| Fase senza voci e rapporto sull’intera commessa | 55% → 10% sia nell’anteprima sia dopo la conferma. |
| Lettura dalla seconda azienda sintetica | Accesso respinto. |

Entrambi gli ordini con misure sono stati eseguiti anche dal popup in Chrome. [Migrazione](../../../supabase/migrations/20290502081700_anteprima_annullo_rapportino.sql) · [Regressione](../../../src/test/security/rapportinoRevocaQuantita.test.ts)

## Verifiche finali

Passati 127 test in 12 file, TypeScript mirato e `git diff --check`. Il lint rileva quattro errori già presenti nel modulo del riepilogo finanziario, in righe estranee all’intervento.
