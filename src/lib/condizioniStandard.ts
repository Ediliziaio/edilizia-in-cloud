/**
 * Modello standard di "Condizioni contrattuali e termini legali" per imprese
 * edili italiane: un punto di partenza da adattare, con i merge tag già al
 * posto giusto. Non è consulenza legale: chi lo usa deve rileggerlo con il
 * proprio consulente.
 */
export const CONDIZIONI_STANDARD_MD = `# Condizioni contrattuali

## 1. Oggetto
{{azienda.ragione_sociale}} si impegna a eseguire i lavori e le forniture descritti nel preventivo {{preventivo.numero}} del {{preventivo.data}} per {{cliente.nome_completo}}, presso {{cantiere.indirizzo}}. Sono esclusi lavori e forniture non espressamente indicati.

## 2. Prezzi e pagamenti
Il corrispettivo complessivo è di {{preventivo.totale}}, IVA come per legge. Pagamenti: {{preventivo.piano_pagamenti}}. In caso di ritardo nei pagamenti l'impresa può sospendere i lavori fino a regolarizzazione, senza responsabilità per i tempi.

## 3. Tempi di esecuzione
I tempi indicati nel preventivo sono stimati e decorrono dalla firma e dal ricevimento dell'acconto. Non si considerano ritardi quelli dovuti a maltempo, forza maggiore, mancata disponibilità dell'area o ritardi nelle scelte del cliente.

## 4. Varianti
Ogni variante o lavoro aggiuntivo va concordato per iscritto prima dell'esecuzione e viene valutato a parte. Le quantità del preventivo sono indicative: le differenze rilevate in corso d'opera vengono contabilizzate a misura.

## 5. Obblighi del cliente
Il cliente garantisce l'accesso all'area, la disponibilità di acqua ed energia elettrica, e la presenza di eventuali autorizzazioni necessarie, salvo diverso accordo scritto.

## 6. Garanzia
I lavori sono garantiti per 24 mesi dalla consegna per difetti di esecuzione, con esclusione dei difetti dovuti a uso improprio, mancata manutenzione o interventi di terzi. Per i materiali vale la garanzia del produttore.

## 7. Proprietà dei materiali
I materiali forniti restano di proprietà di {{azienda.ragione_sociale}} fino al saldo integrale.

# Termini legali

## Privacy (GDPR Reg. UE 2016/679)
I dati personali di {{cliente.nome_completo}} sono trattati da {{azienda.ragione_sociale}} esclusivamente per l'esecuzione del contratto e gli adempimenti di legge, e conservati per il tempo necessario. Il cliente può esercitare i diritti previsti dagli artt. 15-22 del Regolamento scrivendo a {{azienda.email}}.

## Diritto di recesso
Se il contratto è concluso fuori dai locali commerciali con un consumatore, il cliente può recedere entro 14 giorni dalla firma (art. 52 D.lgs. 206/2005), salvo che i lavori siano già iniziati su sua richiesta.

## Foro competente
Per ogni controversia è competente il Foro della sede di {{azienda.ragione_sociale}}, fatta salva la competenza inderogabile del foro del consumatore.`;
