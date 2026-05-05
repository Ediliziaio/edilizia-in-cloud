---
area: 10-ai-act-governance
titolo: Classificazione del rischio dei sistemi AI
tags: [classificazione-rischio, allegato-iii, alto-rischio, rischio-limitato]
livello: intermedio
applicabile_a: [valutazione-sistemi-ai-aziendali]
kpi_correlati: [classificazione-corretta, sistemi-conformi]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Classificazione del rischio dei sistemi AI

L'AI Act adotta un approccio "risk-based": più rischioso è il sistema, più severi sono gli obblighi. Capire in quale categoria ricade un sistema è il primo passo per la conformità.

## I 4 livelli di rischio

**1. Rischio inaccettabile — VIETATI**
Sistemi che minacciano sicurezza, vita, diritti fondamentali. Non si possono immettere in commercio né usare.

**2. Rischio alto — pesanti obblighi di compliance**
Sistemi che hanno impatto rilevante su salute, sicurezza, diritti. Conformità obbligatoria con documentazione tecnica, gestione del rischio, supervisione umana, ecc.

**3. Rischio limitato — obblighi di trasparenza**
Sistemi con impatti limitati. L'utente deve sapere di interagire con AI.

**4. Rischio minimo — nessun obbligo specifico**
La maggior parte dei sistemi AI quotidiani (filtri spam, suggerimenti prodotti). Codici di condotta volontari.

## Sistema vietato — esempi

Pratiche che NON si possono fare:
- Manipolazione subliminale per causare danno
- Sfruttamento vulnerabilità (età, disabilità) per indurre comportamenti dannosi
- Social scoring generalizzato dei cittadini da autorità pubbliche
- Identificazione biometrica in tempo reale in spazi pubblici per scopi di polizia (con limitate eccezioni)
- Categorizzazione biometrica per dedurre opinioni politiche, religione
- Riconoscimento emozioni in luoghi di lavoro e scuole (eccetto motivi medici/sicurezza)
- Polizia predittiva basata su profili individuali
- Database facciali da scraping massivo

Per impresa edile, queste pratiche sono **fuori dal radar normale**. Da non fare e basta.

## Sistema ad alto rischio — i due binari

Un sistema è ad alto rischio se:

**Binario 1**: è componente di sicurezza di un prodotto regolato da legislazione UE elencata in Allegato I (es. macchine industriali, dispositivi medici, ascensori, giocattoli).

**Binario 2**: rientra in una delle 8 aree dell'Allegato III:
1. Identificazione biometrica
2. Infrastrutture critiche (gestione traffico, fornitura acqua/gas/elettricità)
3. Istruzione e formazione professionale
4. **Lavoro, gestione lavoratori, accesso al lavoro autonomo**
5. **Accesso a servizi essenziali pubblici/privati e benefici**
6. Forze dell'ordine
7. Migrazione, asilo, controllo frontiere
8. Amministrazione giustizia e processi democratici

Per impresa edile, le aree rilevanti sono **4 (HR/lavoro)** e occasionalmente **5 (servizi essenziali)**.

## Sistemi alto rischio rilevanti per imprese edili

**Selezione e reclutamento del personale**:
- AI che analizza CV e seleziona automaticamente candidati
- AI che assegna punteggi a profili
- AI che decide chi assumere/non assumere

**Gestione lavoratori**:
- AI che assegna automaticamente compiti
- AI che valuta automaticamente la performance
- AI che decide promozioni, demansionamenti, sanzioni
- AI che monitora produttività e prende decisioni conseguenti

**Decisioni creditizie/contrattuali**:
- AI che valuta merito creditizio di clienti/fornitori (rare in edilizia)

Se il Cervello Supremo è usato in modo **consultivo** (suggerisce, decide l'umano), tipicamente non è alto rischio. Diventa alto rischio quando **decide in autonomia** in queste aree.

## Eccezione "rischio non significativo"

Anche un sistema che rientra nell'Allegato III può essere classificato **non ad alto rischio** se:
- Esegue solo task accessori
- Non influenza materialmente le decisioni
- Migliora il risultato di attività umane preesistenti
- Riguarda solo task di pattern-detection senza decisioni
- Esegue solo task preparatori

Il provider deve documentare questa valutazione.

## Sistema a rischio limitato — gli obblighi minimi

Sistemi che parlano con utenti (chatbot), generano contenuti (testo, immagini), riconoscono emozioni o categorizzano biometricamente al di fuori del divieto.

Obblighi:
- **Trasparenza**: l'utente sa di interagire con AI (es. il Cervello deve dichiararsi tale)
- **Etichettatura**: contenuti generati artificialmente devono essere riconoscibili (deepfake)
- **Notifica**: chi fa riconoscimento emozioni o classificazione biometrica deve informare gli interessati

## Modelli AI di uso generale (GPAI)

Categoria a parte: i grandi modelli linguistici (Claude, GPT, Gemini, Llama, ecc.) che possono essere usati per molti compiti.

Obblighi specifici per i provider GPAI (dal 2 agosto 2025):
- Documentazione tecnica
- Trasparenza sui dati di training
- Rispetto del copyright nei dati usati per training
- Per modelli "ad impatto sistemico" (>10^25 FLOPS di calcolo): obblighi rafforzati di valutazione rischi e cybersecurity

Per impresa edile, questi obblighi riguardano i **fornitori dei modelli base** (OpenAI, Anthropic, Google, ecc.), non l'impresa stessa.

## Come classificare un sistema concreto

Domande da farsi:
1. Il sistema rientra in pratiche vietate? → STOP, non usarlo
2. È componente di sicurezza di un prodotto regolato (Allegato I)? → Alto rischio
3. Rientra in una delle 8 aree dell'Allegato III? → Probabile alto rischio
4. Per i casi al punto 3: il sistema decide autonomamente o solo suggerisce? Se solo suggerisce e non incide materialmente → possibile rischio limitato
5. Genera contenuti, dialoga con utenti, riconosce emozioni? → Rischio limitato (obblighi trasparenza)
6. Nessuna delle precedenti? → Rischio minimo

## Esempio applicato — Cervello Supremo EiC

Analisi tipica:

**Uso 1 — Risposta a domande informative dell'imprenditore** (es. "come funziona il sismabonus")
- Categoria: rischio limitato
- Obblighi: trasparenza (l'utente sa che è AI)

**Uso 2 — Suggerimento di soluzioni operative** (es. "che tipo di contratto usare per X")
- Categoria: rischio limitato
- Obblighi: trasparenza + non vincolante (decisione finale dell'umano)

**Uso 3 — Generazione di bozze di documenti** (es. preventivo iniziale, lettera fornitore)
- Categoria: rischio limitato
- Obblighi: trasparenza + revisione umana prima dell'invio

**Uso 4 — Suggerimento per decisioni HR** (es. "questo candidato è adatto?")
- Categoria: alto rischio se la decisione finale dipende dall'AI
- Configurazione corretta: AI suggerisce ma decide l'umano → rischio limitato
- Configurazione scorretta: AI decide automaticamente → alto rischio con tutti gli obblighi

**Uso 5 — Decisione automatica su licenziamento**
- Categoria: alto rischio (e probabilmente discutibile anche se conforme)
- Configurazione corretta in EiC: NON FATTIBILE — il Cervello non prende mai questo tipo di decisioni in autonomia

## Cosa documentare per ogni sistema AI in uso

Per audit interno e in caso di controlli:
- Nome del sistema
- Provider/fornitore
- Tipo di rischio assegnato
- Motivazione della classificazione
- Casi d'uso ammessi
- Casi d'uso vietati
- Misure di supervisione umana
- Responsabile aziendale
- Procedura di gestione anomalie

## Errori comuni nella classificazione

1. **Sotto-classificare** per evitare obblighi: rischio sanzioni in caso di controllo
2. **Sopra-classificare** per eccesso di cautela: spreco di risorse compliance
3. **Classificare una sola volta** e dimenticare: il sistema evolve, la classificazione va rivista
4. **Ignorare gli usi reali**: il sistema "in teoria" è limitato, "nella pratica" diventa alto rischio
5. **Non documentare**: in caso di audit, l'azienda non può difendersi

## La classificazione del Cervello Supremo EiC

Per default, il Cervello Supremo è progettato per operare come **rischio limitato**:
- Risponde a domande, suggerisce, redige bozze
- Le decisioni finali sono sempre dell'umano (HIL — Human In the Loop)
- Non automatizza decisioni HR irreversibili
- Trasparenza nativa (si dichiara come AI)
- Audit trail completo di ogni interazione

Configurazioni che spostano in alto rischio (richiede compliance aggiuntiva):
- Uso del Cervello per decidere automaticamente assunzioni/licenziamenti
- Uso per scoring automatico di candidati senza revisione umana
- Uso per decisioni di credito automatiche

Queste configurazioni sono **sconsigliate** anche dal punto di vista business: le decisioni HR e creditizie richiedono giudizio umano, e una sentenza/sanzione amministrativa costa più di qualche minuto risparmiato dall'automazione.

## Riferimenti

- **Regolamento UE 2024/1689 art. 6** — Classificazione sistemi alto rischio
- **Regolamento UE 2024/1689 Allegato I e III** — Liste di prodotti e settori
- **Regolamento UE 2024/1689 art. 50** — Obblighi di trasparenza
- **Regolamento UE 2024/1689 art. 5** — Pratiche vietate

Sources:
- [Article 6: Classification Rules - EU AI Act](https://artificialintelligenceact.eu/article/6/)
- [High-level summary AI Act](https://artificialintelligenceact.eu/high-level-summary/)
