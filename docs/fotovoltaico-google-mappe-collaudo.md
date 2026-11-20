# Collaudo Google Maps e lettura bolletta

Prosegue la PR 195: la vista satellitare deve funzionare con il progetto Google
`edilizia-in-cloud`, account indicato dall’utente. Il PDF deve precompilare consumi
e spesa senza inserimenti manuali. Il progetto Lead Finder non è stato modificato.

## 📊 BASELINE vs FINALE

| Metrica | Prima | Dopo |
|---|---|---|
| TypeScript applicazione | 0 errori nel rilascio PR 195 | Controllo in corso |
| Test fotovoltaico | 1.002 passati, 12 esclusi preesistenti | 1.022 passati, 12 esclusi preesistenti |
| Test nuovi mirati | — | 20 passati |
| Deno Maps/test connessione | — | Controllo tipi passato con cache e lock |
| Build applicazione | Verde sul rilascio PR 195 | In corso |
| Dipendenze/migrazioni nuove | — | 0 |
| File rimossi | — | 0 |
| Lighthouse | Non misurato | Non ripetuto per questa correzione |

Il controllo Deno ha aggiornato automaticamente i soli metadati del workspace nel
lockfile: la modifica estranea è stata scartata. Nessun hash di dipendenza è stato
aggiornato per aggirare verifiche di integrità. La rilettura locale del vecchio
fixture PDF resta fermata dal checksum del bundle PDF.js cambiato sul CDN, già
documentato nella PR 195; non equivale a un test del servizio online.

## 🗑️ RIMOSSO

| Tipo | Path esatto | Motivo |
|---|---|---|
| Codice duplicato | `supabase/functions/maps-proxy/index.ts` | Conversione immagine centralizzata nel modulo verificabile |
| Ramo Google obsoleto | `supabase/functions/test-integration/index.ts` | Leggeva la riga vuota dei segreti e ripiegava su una credenziale diversa dal proxy |

## 🔒 SECURITY FIX

| Problema | Severità | Fix |
|---|---|---|
| Errori fetch contenenti URL con chiave | P3 | Risposte e log nuovi contengono soltanto codici classificati e messaggi costanti |
| Test Google legge archivio precedente | P2 | Risoluzione Vault/env identica al proxy, dopo verifica super admin |

Nessuna modifica a ruoli, policy, chiavi pubbliche o autorizzazioni. La credenziale
esistente del progetto Google corretto è stata collegata mediante la pagina admin
al Vault: confronto delle sole impronte SHA-256 riuscito. Valori non scritti in
repository o nei rapporti. Le altre integrazioni conservano il comportamento precedente.

## 🐛 BUG CORRETTI

| Problema | File | Root cause | Fix applicato |
|---|---|---|---|
| Test e proxy usano credenziali diverse | `supabase/functions/test-integration/index.ts` | Lettura diretta di `platform_settings` per un valore migrato nel Vault | Resolver condiviso, prova geocoding e immagine satellitare |
| Risposta immagine valida rifiutata dal wizard | `supabase/functions/_shared/mapsGoogle.ts` | Parametri MIME trasferiti nel data URL | MIME normalizzato prima della conversione |
| Mappa indisponibile senza una causa utile | `supabase/functions/maps-proxy/index.ts` | Corpo e stato Google scartati | Codici distinti per chiave, API, fatturazione, restrizioni, quota e timeout |
| Attesa non limitata sul provider | `supabase/functions/_shared/mapsGoogle.ts` | Fetch senza scadenza propria | Abort a 10 secondi, cleanup e messaggio per riprovare |

La normalizzazione MIME è verificata con risposta simulata; non si dichiara che
sia stata accertata come causa del rifiuto osservato in produzione.

## ♿ ACCESSIBILITÀ

Il messaggio viene mostrato nel percorso di errore esistente, senza HTML del
provider. Conservati il pulsante Riprova e il percorso con misure rilevate.

## ✨ UX MIGLIORATA

| Area | Problema | Fix |
|---|---|---|
| Mappa | Errore indistinto | Messaggio con causa e azione utile |
| Admin | Test geocoding poteva passare senza vista satellitare | Verificati entrambi con la stessa credenziale |

## ⚡ PERFORMANCE

| Ottimizzazione | Impatto stimato |
|---|---|
| Timeout provider | Richiesta Google termina prima del limite di 15 secondi dell’interfaccia |
| Risposta immagine limitata a 8 MB | Evita conversioni eccessive |
| Test Google prima della vecchia query impostazioni | Non legge l’inventario delle altre integrazioni |

## ✅ CHECKLIST TEST FINALE

- [x] 20 nuovi test logica/UI: PASS.
- [x] Suite fotovoltaico e isolamento storage: 1.022 PASS, 12 esclusi preesistenti.
- [x] Deno dei due endpoint: PASS.
- [ ] TypeScript e build: in corso.
- [ ] Vista satellitare reale in produzione: da riprovare con il rilascio.
- [ ] Upload PDF, lettura automatica e riapertura online: richiede il permesso dell’estensione.
- [ ] Mobile/Safari: non ripetuti sul nuovo errore; verificati nella PR 195.
- [ ] Lighthouse: non misurato.

## 🔴 PROBLEMI NON RISOLTI

| Problema | Motivo blocco | Soluzione proposta |
|---|---|---|
| Vista Google | Credenziale corretta collegata; immagine non ancora positiva | Rilasciare i controlli verificati e osservare il codice della causa |
| Collaudo PDF online | Estensione Chrome richiede accesso agli URL dei file | Permesso chiesto all’utente; nessun aggiramento con cookie o token del browser |

La copia sintetica di collaudo è `FV-2026-0016` nella Demo Azienda 2. I precedenti
valori manuali di analisi, consumo e costo sono stati salvati in un backup locale
e azzerati solo in questa copia, così non possono mascherare la lettura del PDF.
Nessun invio, firma o emissione di offerta è compreso nel collaudo.

**VERDETTO FINALE: collaudo online da completare.**
