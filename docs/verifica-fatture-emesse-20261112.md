# Verifica fatture emesse · 12 novembre 2026

## 📊 BASELINE vs FINALE

La tabella precedente univa data e numero e mescolava fase SDI e incasso.
La nuova tabella desktop ha celle compatte, colonne selezionabili per utente e
azienda, intestazione e azioni fisse, scorrimento orizzontale sempre raggiungibile.
Mostra cliente, numero, emissione, imponibile, totale, netto a pagare, SDI,
incasso, incassato, residuo, prima rata aperta, commesse, note e allegati.
IVA, stato documento, modalità e origine sono ulteriori colonne attivabili.

## 🗑️ RIMOSSO

La ricerca dell'elenco non usa più la RPC intermedia limitata a 200 note.
La RPC esistente resta compatibile con le versioni precedenti dell'app.
Nessun documento o dato aziendale è stato eliminato.

## 🔒 SECURITY FIX

La nuova vista `documenti_fiscali_elenco_operativo` è `security_invoker`;
legge con le RLS delle fonti ed esclude l'accesso anonimo. I collegamenti
richiedono anche corrispondenza dell'azienda. Le note interne sono distinte
da quelle del documento e non vengono aggiunte a PDF, XML o comunicazioni.
Test PostgreSQL con ruolo authenticated e azienda diversa, più rifiuto anon.
Nessuna segnalazione di sicurezza sulla nuova vista dopo l'applicazione.

## 🐛 BUG CORRETTI

Ricerca delle note applicata prima di conteggio/paginazione, senza taglio a 200.
Date italiane e ISO valide e importi in formato italiano o con punto decimale
sono cercabili senza perdere la ricerca testuale sul numero originale.
Caratteri speciali restano letterali. Gli errori sono mostrati come errori.
Gli storni nativi seguono `stornatoDellaFattura`/`documento_stornato_totale`;
quelli importati già normalizzati non vengono sottratti una seconda volta.
Un credito cliente viene indicato come credito, non come residuo negativo.

## ♿ ACCESSIBILITÀ

Filtri con nomi accessibili, numero apribile da tastiera, note e collegamenti
in popover, allegati nel componente esistente in sola lettura. Il telefono
conserva le schede compatte e ha accesso agli stessi filtri indipendenti.

## ✨ UX MIGLIORATA

SDI, documento e incasso filtrabili separatamente; cliente, commessa, periodo,
presenza di note e allegati sono combinabili con la ricerca. Ogni filtro attivo
è rimovibile e le modifiche riportano alla prima pagina. Resta disponibile
l'ordinamento predefinito anno/numero, con alternativa per data.
DDT, proforma, note di credito e cestino conservano le proprie colonne e azioni.

## ⚡ PERFORMANCE

Una richiesta per pagina con conteggio esatto; nessuna query HTTP per ciascuna
riga. Note, commesse e conteggi file arrivano aggregati; i file incorporati e i
piani completi non sono scaricati dall'elenco. Gli allegati si leggono soltanto
aprendo il popover. Una fattura con più commesse resta una sola riga.
Su Demo Azienda 2: 1.464 righe attive complessive, 1.464 identità distinte
`(id, origine)`; lettura PostgreSQL di 25 fatture ordinata: circa 190 ms
nella verifica del 12/11, senza includere rete e rendering.

## ✅ CHECKLIST TEST FINALE

- 258 test superati su 15 file; 2 test esistenti saltati.
- Test SQL sulla migrazione reale: riapplicazione, RLS, commesse multiple,
  allegati, storni, rate aperte, ricerca di 225 note con pagina oltre la 200ª.
- Test interfaccia: SDI e incasso indipendenti, note, navigazione e vista DDT.
- Test query: filtri AND insieme alla ricerca OR, azienda e cancellazione
  logica, conteggio completo, paginazione, errori e caricamento leggero.
- Test di ricerca: formati degli importi, calendario valido, caratteri speciali.
- Compilazione TypeScript completa: zero errori, anche alla verifica finale.
- Build di produzione e prerender: 243/243 pagine riuscite.
- Migrazione applicata via MCP e registro allineato a `20290316100000`.
- Nessun invio SDI, incasso o pagamento reale eseguito per collaudare la UI.

## 🔴 PROBLEMI NON RISOLTI

La ricerca riguarda campi strutturati e note, non il testo dentro PDF allegati.
L'esito SDI non disponibile per un'importazione resta «Gestita esternamente»:
va verificato nel gestionale di origine. Eventuali duplicati già presenti come
documenti distinti nelle fonti non vengono fusi automaticamente.
Le verifiche non costituiscono un audit globale di tutta la piattaforma.
