
Problema identificato (critico): la route `/azienda/marketing/automazioni/nuova` è una route statica, quindi `useParams()` non fornisce `id`. In `FlowBuilderPage` la logica usa `id === "nuova"` per:
- creare il flow
- mostrare il placeholder iniziale (“Inizia Trigger” / “Aggiungi trigger”)

Con `id = undefined`, entrambe le condizioni falliscono. Risultato: canvas vuoto, nessuna creazione flow, click su Trigger/Azioni percepiti come “non funzionanti”.

Do I know what the issue is? Sì.

Piano di fix (mirato e sicuro)

1) Correggere il riconoscimento “nuovo flow” in `FlowBuilderPage.tsx`
- Introdurre `isNewFlowRoute` robusto:
  - `const { id: routeId } = useParams<{ id?: string }>()`
  - `const isNewFlowRoute = !routeId || routeId === "nuova"`
  - `const flowId = isNewFlowRoute ? undefined : routeId`
- Sostituire tutti i controlli `id === "nuova"` con `isNewFlowRoute`.

2) Ripristinare placeholder iniziale sempre su route nuova
- Nella `useEffect` di sync canvas, usare la condizione:
  - `!isLoading && builder.nodes.length === 0 && (isNewFlowRoute || !!flowId)`
- Così il nodo iniziale compare subito anche su route statica `/nuova`.

3) Riattivare la creazione automatica flow
- Nella `useEffect` “Create flow if new”, usare `isNewFlowRoute`.
- Aggiungere guard anti-doppia esecuzione con `creationAttemptedRef` (come nel builder legacy) per evitare doppie insert in dev/StrictMode.

4) Allineare condizioni UI dipendenti dalla route nuova
- Loader condition: `(isNewFlowRoute && createFlowMutation.isPending)`
- Error condition: usare `!isNewFlowRoute` al posto di `id !== "nuova"`.

5) Hardening (opzionale ma consigliato)
- Quando si passa da un flow all’altro, resettare in modo esplicito stato transitorio del canvas (se necessario) per evitare stati sporchi.
- Questo non è la causa principale attuale, ma riduce regressioni.

File da aggiornare
- `src/components/flow-builder/FlowBuilderPage.tsx` (fix principale completo)

Validazione dopo fix
1. Aprire `/azienda/marketing/automazioni/nuova`:
   - deve comparire subito il blocco centrale “Aggiungi trigger / Inizia Trigger”.
2. Clic su blocco trigger:
   - deve aprirsi il pannello Trigger.
3. Clic su item Trigger/Azioni:
   - deve creare/sostituire nodo correttamente.
4. Verificare anche route admin `/admin/marketing/automazioni/nuova`:
   - stesso comportamento corretto (beneficia dello stesso fix).
