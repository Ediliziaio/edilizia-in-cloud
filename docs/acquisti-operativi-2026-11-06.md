# Acquisti: anteprime, storico e confronto — 6 novembre 2026

## 📊 BASELINE vs FINALE

| Metrica | Prima | Dopo |
|---|---|---|
| Errori TypeScript | 0 | 0 (controllo completo) |
| Errori lint nei file toccati | 0 | 0 |
| Warning lint | preesistenti nel hook RDO | 20, tutti `any` preesistenti |
| Build produzione | PASS | PASS |
| Chunk OdA (non compresso) | 75,59 kB | 76,24 kB |
| Chunk RDO (non compresso) | 41,02 kB | 48,69 kB |
| File rimossi | — | 0 |
| Audit npm, Lighthouse, Safari/Firefox | non eseguiti per questa modifica | non misurati |

## 🗑️ RIMOSSO

Nessun file o comportamento esistente rimosso.

## 🔒 SECURITY FIX

Lo storico è scritto solo da trigger: nessun INSERT/UPDATE/DELETE per il client. RLS verifica azienda e accesso al documento madre, escludendo clienti esterni, utenti bloccati e personale di campo. Le funzioni dei trigger non sono eseguibili via API. Nessun privilegio Storage ampliato: gli originali email rispettano le autorizzazioni della casella mittente. La tabella rientra nel backup aziendale automatico (nessuna tabella scoperta).

## 🐛 BUG CORRETTI

- Il trasporto esplicito viene trasferito come riga nell’OdA, senza duplicazione nei totali a corpo.
- Totale documento e voci + trasporto devono coincidere prima dell’aggiudicazione. Un’offerta scaduta va riconfermata.
- I prezzi delle righe sono arrotondati ai centesimi nel confronto, come nel database.
- Autosalvataggio e invio email non scrivono contemporaneamente la stessa bozza.
- Il testo semplice dell’email viene derivato dal contenuto HTML quando necessario: lo storico conserva il contenuto finale anche senza digitazione nell’editor.

## ♿ ACCESSIBILITÀ

Dialog con titolo e descrizione; campi commerciali etichettati; loading ed errori annunciati; controlli di disponibilità con nome della voce e del fornitore. L’anteprima usa il visualizzatore canvas condiviso, con zoom e download anche mobile.

## ✨ UX MIGLIORATA

- OdA e RDO: anteprima PDF senza scaricare, utilizzando lo stesso generatore del documento finale.
- OdA e RDO: storico di salvataggi con prima/dopo e invii con destinatari, stato, testo finale, versione del documento e PDF originale.
- OdA e RDO: riepilogo delle attività ancora aperte, distinto per stato del documento.
- RDO: trasporto, disponibilità per voce, vincoli, consegna, pagamento e validità affiancati nel confronto. Totale più basso evidenziato solo per offerte complete, valide e confrontabili; stessa logica nella pipeline.
- RDO → OdA: pagamento, note commerciali e trasporto mantengono continuità.

Lo storico comincia dall’attivazione: gli invii precedenti non vengono ricostruiti per supposizione.

## ⚡ PERFORMANCE

PDF e visualizzatore caricati solo all’apertura. Storico limitato inizialmente a 20 eventi, espandibile, con indici per documento/data e aggiornamento ogni 30 secondi. Nessuna scansione delle email dell’azienda per ricostruire gli invii.

## ✅ CHECKLIST TEST FINALE

- TypeScript completo: PASS.
- Build produzione: PASS.
- Lint file modificati: PASS, zero errori; 20 warning preesistenti.
- Test applicativi mirati: 149 PASS in 19 file, inclusi pipeline, editor OdA, email dirette e legacy, allegati, dati fornitore e RDO.
- Test SQL transazionale con rollback: PASS per trasporto, riconciliazione, revisioni, distinzione bozza/invio, immutabilità dopo invio e isolamento tra aziende. Nessun invio o dato di prova persistito.
- Browser online desktop/mobile: da completare dopo deploy.
- CI e deploy: da completare dopo push.
- Safari, Firefox, Lighthouse e simulazione rete offline nel browser: non eseguiti; errori recuperabili coperti nei test applicativi.

## 🔴 PROBLEMI NON RISOLTI

Nessun blocco funzionale emerso nei test completati. Gli allegati storici privati possono essere aperti solo da chi ha accesso alla casella: si mostra un errore recuperabile senza ampliare i permessi. Non viene simulato l’invio di email reali ai fornitori durante il collaudo.

## Ripristino

Frontend: revert del commit della funzionalità. Migrazione additiva già applicata via MCP e registro allineato a `20281216133000`; non cancellare lo storico né i campi per un rollback del frontend. Le revisioni restano leggibili al successivo ripristino della funzionalità.
