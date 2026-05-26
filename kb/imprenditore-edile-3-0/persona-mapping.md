# Persona Mapping — Imprenditore Edile 3.0

> Quale manuale alimenta quale persona Silvio?
>
> Vedi anche: `scripts/kb-ingest/persona-mapping.ts` (sorgente di verità).

## Le 21 personas Silvio (super_admin)

| Key | Ruolo | Manuali assegnati |
|-----|-------|-------------------|
| **federico** | CEO / Strategia | Volumi 1-2-3, Management, Gestione Finanziaria, Direttore Vendita |
| **beatrice** | CFO / Finanza | Gestione Finanziaria, Management, FV Management |
| **roberta** | Amm.ne / Fiscale | Gestione Finanziaria |
| **vittorio** | Strategic Frameworks | Volumi, Management, Delega, Collaboratori Vincenti, FV Management/Delega |
| **antonio** | Edilizia Italiana | Tutti i manuali (specialista del dominio) |
| **chiara** | Product / Operativo | Mansionari, Schede Operative, FV Resp/Capo Cantiere |
| **laura** | HR / People Ops | Delega, Mansionari, Reclutamento, Collaboratori, FV Collaboratore |
| **marco** | Sales B2B | Direttore Vendita |
| **sofia** | Marketing / Brand | Direttore Vendita |
| **tommaso** | Outbound | Direttore Vendita |
| **elena** | Customer Success | Volumi (mindset cliente) |
| **giorgio** | Support | Volumi (tono coach) |
| **luca** | Engineering | Cardinal principles only |
| **davide** | Security | Cardinal principles only |
| **eleonora** | Compliance | Cardinal principles only |
| **alessandro** | AI/ML | Cardinal principles only |
| **giulia** | Data | Cardinal principles only |
| **ferrari** | Legal B2B | Cardinal principles only |
| **matteo** | DevOps | Cardinal principles only |
| **gabriele** | Partnerships | Cardinal principles only |
| **valentina** | Onboarding Cliente | Volumi + Schede Operative |

## Cosa significa "Cardinal principles only"

Le personas tecniche (luca, davide, matteo, ecc.) **non leggono i manuali completi** — sarebbe spreco di budget context. Ricevono però i 20 principi cardinali (~800 token) iniettati nel system prompt, perché sono il "DNA culturale" condiviso da tutto il team Silvio.

## Cosa accade alla query semantic search

Quando una persona pone una domanda:

1. `get_cardinal_principles(persona_key, company_id?)` → recupera i 20 principi (sempre)
2. Query embedding via OpenAI
3. `search_silvio_knowledge_v2(embedding, top_k=8, persona_key, company_id?)` → recupera chunk dettaglio filtrati per persona + eventuali override aziendali
4. System prompt assemblato: `<voice>` + `<cardinal>` + `<RAG chunks>` + `<override>`
5. LLM call (Claude Sonnet via OpenRouter, o ChatGPT)
6. `log_kb_citation(...)` → audit interno (no citazione visibile all'utente)

## Override aziendali

Esempio scenario:

> Azienda "Rossi Costruzioni Srl" dice a Florin: "Per noi i mansionari devono essere bilingue italiano + rumeno perché 6 operai su 12 sono rumeni."

Florin (super_admin) inserisce in `company_kb_overrides`:
- `company_id` = id_Rossi
- `source_doc_id` = id del chunk "Manuale Mansionari — Lingua del mansionario"
- `override_text` = "Per Rossi Costruzioni i mansionari sono sempre bilingue italiano + rumeno. Il capocantiere consegna entrambe le versioni al primo giorno."
- `rationale` = "6/12 operai madrelingua rumeni, richiesta del titolare il 25/05/2026"

Da quel momento, quando Silvio risponde a una domanda sui mansionari **per Rossi**, vede la versione override invece del chunk originale. Tutte le altre aziende continuano a vedere la regola standard.
