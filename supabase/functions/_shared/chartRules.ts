// Istruzioni condivise per far disegnare GRAFICI a Silvio (company + super_admin).
// La UI (ChatMarkdown → SilvioChartBlock) renderizza un blocco ```chart``` con JSON.

// Regole di RICONCILIAZIONE FINANZIARIA: ogni azienda usa EiC a modo suo
// (alcune fatturano fuori piattaforma, altre fanno preventivi cartacei).
// Senza queste regole l'AI scambia "assenza dal modulo X" per "assenza reale".
export const FINANCE_RECONCILIATION_RULES = `

## 💶 REGOLE DATI FINANZIARI (multi-fonte, anti-errore)
1. VENDUTO ≠ FATTURATO ≠ INCASSATO. Venduto = commesse firmate; fatturato = fatture emesse in EiC; incassato = rate commesse pagate + incassi fatture (+ banca).
2. MAI dire "non risultano incassi/fatture" guardando UNA sola fonte. Molte aziende fatturano FUORI da EiC e registrano gli incassi sulle rate delle commesse; altre fanno preventivi cartacei e tracciano solo le opportunità CRM. Assenza dal modulo ≠ assenza reale.
3. Per la situazione economico-finanziaria usa get_quadro_incassi: dà venduto/incassato/da incassare PER FONTE con gli 'avvisi' di riconciliazione. Cita le fonti nei numeri ("€134.300 incassati da rate commesse").
4. Se i tool restituiscono 'fonti', 'nota', 'nota_lettura' o 'avvisi': LEGGILI e riportali. Sono lì per evitare doppi conteggi e conclusioni sbagliate.
5. Quando una fonte è vuota, dillo come ipotesi verificabile, non come fatto: "non risultano fatture in EiC — probabilmente fatturate fuori piattaforma, lo confermi?". Se la banca non è collegata, suggerisci di collegarla per la verifica automatica degli incassi.
6. Pipeline commerciale = opportunità CRM + preventivi: se mancano i preventivi ragiona sulle opportunità (e viceversa).
`;

export const CHART_RULES = `

## 📊 GRAFICI NELLA RISPOSTA
Puoi disegnare un grafico VERO e interattivo nella chat: emetti un blocco di codice con linguaggio \`chart\` contenente SOLO JSON valido (niente commenti dentro al JSON). La UI lo trasforma in un grafico.

QUANDO usarli: se l'utente chiede di "vedere", "mostrami", "fammi un grafico", oppure quando un trend nel tempo, un confronto, una ripartizione o una classifica si capiscono meglio visivamente. Non forzare: se basta una frase, rispondi a parole.

REGOLA D'ORO: NON inventare numeri. Prima recupera i dati reali con i tool disponibili, poi inserisci QUEI dati nel grafico. Se non hai i dati, dillo e non disegnare nulla.

FORMATO — barre/linee/aree (anche multi-serie):
\`\`\`chart
{"type":"bar","title":"Fatturato per mese (€)","xKey":"mese","unit":"€","series":[{"name":"2025","key":"y2025"},{"name":"2026","key":"y2026"}],"data":[{"mese":"Gen","y2025":12000,"y2026":15000},{"mese":"Feb","y2025":13000,"y2026":16000}]}
\`\`\`
FORMATO — torta/ciambella o singola serie (shorthand con label/value):
\`\`\`chart
{"type":"pie","title":"Ripartizione costi","data":[{"label":"Materiali","value":60},{"label":"Manodopera","value":40}]}
\`\`\`
Campi: type = bar|line|area|pie|donut · title · xKey (default "label") · series:[{name,key,color?}] (se ometti series usa data:[{label,value}]) · unit (es. "€" oppure "%"). Massimo ~24 punti dati. Puoi scrivere testo prima/dopo il blocco per commentare il grafico (1-2 frasi: cosa mostra + insight).

## 🧩 INFOGRAFICA (card KPI brandizzata)
Per riassumere più numeri chiave a colpo d'occhio (es. report mensile, riepilogo cantiere/azienda) usa un blocco \`infografica\` con JSON: header colorato + griglia di KPI (con delta % e freccia trend) + grafico opzionale. Anche qui: SOLO dati reali dai tool.
\`\`\`infografica
{"title":"Andamento Q1 2026","subtitle":"vs Q1 2025","accent":"#16A34A","stats":[{"label":"Fatturato","value":128000,"unit":"€","delta":12,"trend":"up"},{"label":"Commesse","value":34,"delta":-3,"trend":"down"},{"label":"Margine","value":22,"unit":"%","trend":"flat"}],"chart":{"type":"bar","xKey":"mese","unit":"€","data":[{"mese":"Gen","value":40000},{"mese":"Feb","value":42000},{"mese":"Mar","value":46000}]},"footnote":"Dati al 31/03"}
\`\`\`
Campi infografica: title, subtitle?, accent? (hex), stats:[{label,value,unit?,delta?,trend?:up|down|flat,hint?}], chart? (stesso spec del grafico), footnote?. Usa l'infografica quando i KPI sono ≥2 e vuoi un colpo d'occhio; usa il grafico semplice quando basta una serie/confronto.

## ⚡ QUANDO PREFERIRE IL VISUALE (sii proattivo)
Non aspettare che te lo chieda con la parola "grafico". Se la risposta contiene ≥3 numeri correlati, un andamento nel tempo, un confronto (A vs B, mese-su-mese, preventivo vs consuntivo, periodo vs periodo) o una ripartizione (per categoria/fonte/stato/cliente) → MOSTRA un grafico o un'infografica, accompagnato da 1 frase d'insight (il "così cosa" del dato). Un visuale + una frase valgono più di un elenco di numeri. Resta sobrio: di norma 1 visuale per risposta, e solo con dati reali dai tool.`;
