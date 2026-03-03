

# Piano: Audit Velocità e Pulizia Codice Morto — Sezione per Sezione

## Obiettivo
Analizzare sistematicamente ogni area del progetto per identificare codice morto, import inutilizzati, componenti orfani, query ridondanti e colli di bottiglia di performance. Procedere una sezione alla volta per non perdere nulla.

## Sequenza di analisi (14 sezioni)

| # | Sezione | Cosa cercare |
|---|---------|-------------|
| 1 | **Auth & Context** (`contexts/`, auth components) | Provider annidati inutili, re-render cascata, state duplicato |
| 2 | **Layout & Routing** (`App.tsx`, layout components, routes) | Route orfane, lazy loading mancante, componenti layout duplicati |
| 3 | **Cruscotto Aziendale** (`cruscotto/`, `useCruscottoData`) | Query ridondanti, componenti non usati, calcoli ripetuti |
| 4 | **Marketing Dashboard** (`marketing/dashboard/`) | Widget morti, import ciclici, memoizzazione mancante |
| 5 | **Marketing Automations & Email Builder** (`automations/`, `email-builder/`) | Tipi non usati, handler vuoti, componenti draft abbandonati |
| 6 | **Contatti & Lead** (`contacts/`, `leads/`) | Filtri duplicati, utility functions morte, fetch ridondanti |
| 7 | **Ordini & Preventivi** (`orders/`, `quotes/`) | Logica condivisa non estratta, componenti copiati |
| 8 | **Clienti & Fornitori** (`CustomersList`, supplier components) | Codice duplicato tra le due sezioni, handler inutilizzati |
| 9 | **Reportistica** (`reporting/`, Facebook Ads, export) | Normalizzatori non usati, colonne morte, tipi legacy |
| 10 | **Integrazioni Meta** (`useMetaIntegration`, edge functions) | Endpoint morti, azioni proxy non chiamate, mapping legacy |
| 11 | **Admin & Superadmin** (`admin/`, superadmin pages) | RPC legacy (`get_company_order_sparklines`), componenti admin orfani |
| 12 | **Hooks & Utilities** (`hooks/`, `lib/`, `utils/`) | Hook non importati, utility duplicate, helper morti |
| 13 | **UI Components** (`components/ui/`) | Componenti shadcn importati ma mai usati nel progetto |
| 14 | **Types & Integrations** (`types/`, `integrations/`) | Tipi esportati mai referenziati, interfacce obsolete |

## Per ogni sezione, verificherò

1. **Import morti** — file importati ma mai usati
2. **Esportazioni orfane** — funzioni/componenti esportati ma mai importati altrove
3. **Variabili e state inutilizzati** — useState/useRef dichiarati ma mai letti
4. **Query duplicate** — stesse tabelle interrogate più volte nello stesso flusso
5. **Componenti non raggiungibili** — pagine senza route, widget senza parent
6. **Bundle size** — dipendenze pesanti importate sync che dovrebbero essere lazy
7. **Memoizzazione mancante** — componenti pesanti senza React.memo, calcoli senza useMemo
8. **Console.log residui** — log di debug lasciati nel codice

## Output per sezione

Per ogni sezione produrrò:
- Lista file con codice morto da rimuovere
- Ottimizzazioni performance da applicare
- Refactoring suggeriti (se necessari)

Poi procederò con le modifiche concrete, una sezione alla volta, chiedendo conferma prima di passare alla successiva.

## Approccio

Inizierò dalla **Sezione 1 (Auth & Context)** e procederò in ordine. Ogni sezione verrà analizzata a fondo prima di passare alla successiva, così da avere un quadro chiaro e interventi chirurgici.

