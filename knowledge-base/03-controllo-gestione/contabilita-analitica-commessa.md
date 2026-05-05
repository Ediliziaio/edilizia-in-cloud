---
area: 03-controllo-gestione
titolo: Contabilità analitica per commessa
tags: [contabilita-analitica, co-an, centri-costo, commessa, allocazione]
livello: intermedio
applicabile_a: [controllo-gestione, imprese-strutturate]
kpi_correlati: [margine-commessa, ribaltamento-costi-indiretti]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Contabilità analitica — ogni costo a una commessa

La contabilità generale (Co.Ge.) racconta come va l'azienda nel suo insieme. La contabilità analitica (Co.An.) racconta come va **ogni singola commessa**, ogni squadra, ogni linea di business.

Senza Co.An., il bilancio dice "abbiamo guadagnato 200k". Con la Co.An. dice "il cantiere A ha guadagnato 180k, il B ha perso 50k, il C ne ha fatti 70k". Cambia tutto: sai dove andare e dove non tornare.

## I costi diretti — facili da imputare

Costi che si attribuiscono **direttamente** a una commessa:

- Materiali acquistati per quel cantiere (il DDT lo dice)
- Manodopera diretta in quel cantiere (rilevazione ore)
- Subappaltatori del cantiere
- Noli specifici del cantiere
- Trasporti per quel cantiere
- Sicurezza specifica (ponteggi, DPI dedicati)

L'imputazione diretta richiede **disciplina di registrazione**: ogni fattura passiva deve indicare a quale commessa si riferisce, ogni dipendente deve dichiarare ore per cantiere.

## I costi indiretti — il problema dell'allocazione

Costi che servono a più commesse o all'azienda in generale:

- Direzione, amministrazione, ufficio gare
- Mezzi e attrezzature usati su più cantieri (gru aziendale, autocarro generale)
- Magazzino, ufficio tecnico
- Capocantiere se gestisce più cantieri
- Costi di struttura (sede, utenze, software, assicurazioni globali)

Vanno **allocati** ai cantieri secondo criteri ragionevoli.

## Metodi di allocazione

**1. In funzione delle ore di manodopera diretta**:
quota costi indiretti = (ore manodopera commessa / totale ore aziendale) × costi indiretti totali

**2. In funzione del fatturato della commessa**:
quota costi indiretti = (fatturato commessa / fatturato totale) × costi indiretti

**3. In funzione del costo diretto**:
quota costi indiretti = (costo diretto commessa / totale costi diretti) × costi indiretti

**4. Tariffa oraria**: si calcola un costo orario "interno" della struttura e si applica alle ore di commessa.

Il metodo migliore dipende dall'attività: in edilizia, il metodo "tariffa oraria di cantiere" o "% del costo diretto" sono i più diffusi.

## Esempio di costo orario dell'attrezzatura

Per una gru aziendale usata su più cantieri:
- Ammortamento annuo: 8.000 €
- Manutenzione: 2.500 €
- Assicurazione: 800 €
- Operatore qualificato per 70% del tempo: ~22.000 €
- **Totale annuo: ~33.300 €**
- Ore annue di utilizzo cantieri: 1.200
- **Costo orario: ~28 €/h**

Ogni commessa che usa la gru per X ore si vede attribuire X × 28 € di costo. Trasparente, equo, controllabile.

## Centri di costo

Per imprese > 5M conviene strutturare la Co.An. per **centri di costo** (CC):

- CC 100 — Struttura aziendale (direzione, amministrazione)
- CC 200 — Ufficio tecnico
- CC 300 — Ufficio gare
- CC 400 — Magazzino
- CC 500-599 — Cantieri (un CC per ogni commessa attiva)
- CC 600-699 — Mezzi e attrezzature

I costi di struttura (100-400) si ribaltano sui cantieri secondo regola scelta. I CC mezzi (600) tariffano le ore di utilizzo.

## La Co.An. mensile

Output tipico mensile:

Per ogni commessa attiva:
- Costi diretti del mese (per categoria)
- Quota costi indiretti
- Ricavi maturati (in base a SAL)
- Margine commessa lordo
- Margine commessa contributivo (dopo ribaltamento)
- Confronto con budget

Aggregazione complessiva:
- Totale ricavi mese
- Totale costi diretti
- Totale costi indiretti
- EBITDA mensile

Il dato mensile permette decisioni operative; il bilancio annuale fornisce solo la vista di sintesi.

## Errori comuni

1. **Ore manodopera dichiarate "a sentimento"**: senza rilevazione precisa per cantiere, la Co.An. è inattendibile.
2. **Materiali da magazzino non scaricati per cantiere**: il consuntivo materiali è una stima, non un dato.
3. **Costi indiretti gonfiati o sottostimati**: ricaduta a cascata su tutti i cantieri.
4. **Allocazione su fatturato**: privilegia cantieri grandi a discapito dei piccoli, distorce.
5. **Inserimenti tardivi delle fatture passive**: il dato del mese arriva con 30-60 giorni di ritardo, perdendo utilità decisionale.

## Il ruolo del software gestionale

Sistemi come EiC integrano nativamente:
- Anagrafica commesse con budget
- Imputazione fatture passive a commessa al momento della registrazione
- Imputazione ore via timbratura / app cantiere
- Tariffari mezzi automatici
- Ribaltamento costi indiretti secondo regola
- Report mensili automatizzati
- Dashboard con margine in tempo reale per ogni commessa

Senza il sistema, la Co.An. richiede figure dedicate (controller, contabile analitica) e fogli Excel sempre disallineati.

## Quando partire con la Co.An.

Soglia tipica: oltre **3-5 cantieri attivi contemporaneamente** o **oltre 1,5M di fatturato**. Sotto questa soglia, la Co.An. è "manuale" e fattibile con strumenti semplici. Sopra, è imprescindibile e richiede struttura.

Il primo passo è la **rilevazione delle ore per commessa** (anche con app sul cellulare degli operai). Senza questa, qualunque Co.An. è inutile.
