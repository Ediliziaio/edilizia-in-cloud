# Collaudo nell'app e rilascio del preventivatore

## Prova nel computo demo

Eseguita nell'app locale sulla bozza DEMO-CM-GENZANO-001, dopo averne scaricato una copia.

- Aggiunta una voce di collaudo nel primo capitolo: due pareti da 5 × 2,7 m meno il vano porta da 0,9 × 2,1 m. Quantità 25,11 m², prezzo 58 euro, importo 1.456,38 euro. Totale del computo 2.644.392,73 euro.
- Modificata la lunghezza da 5 a 6 m e il prezzo a 62,50 euro: quantità 30,51 m², importo 1.906,88 euro e totale generale 2.644.843,23 euro.
- Estesa la descrizione per provocare il cambio di pagina: la stessa voce 227 è passata da pagina 10 a pagina 11. Il PDF laterale ha seguito la destinazione aggiornata. Il PDF scaricato aveva 68 pagine e 227 destinazioni, una sola voce di collaudo e i valori attesi.
- Rimossa la sola voce di collaudo e ricaricata la bozza dal salvataggio: ripristinate 226 voci e totale di 2.642.936,35 euro.
- Corretto un difetto individuato nel collaudo: la rotta del computo usa ora il contenitore con altezza dello schermo, come gli altri preventivatori, per mantenere il PDF laterale visibile scorrendo le misure. L'anteprima usa la larghezza disponibile del contenitore e dispone dell'ancoraggio anche da 1024 px.

## Integrazione

Rilascio preparato da origin/main in un checkout dedicato. Include builder, caratteri con licenze, copertine e logo, contratto e pagine opzionali, ingresso nativo unificato, compatibilità dei preventivi salvati, tabella PDF a sei colonne, modifica sotto riga e sincronizzazione voce/PDF. I modelli precedenti con logo in percentuale vengono letti convertendo la misura in millimetri, senza applicare la scala due volte.

Le modifiche estranee al preventivatore nel workspace di sviluppo rimangono conservate. Non sono incluse nuove migrazioni né modifiche ai dati delle aziende.

## Controlli prima della pubblicazione

- 64 file di test: 628 passati e 1 test condizionale preesistente saltato.
- Builder grafico: altri 5 test passati.
- Regressioni finali su rotte, loghi, editor e navigazione: 93 test passati.
- Lint delle componenti e della logica del computo superato.
- Build di produzione completa, inclusi renderer condivisi, superata.
