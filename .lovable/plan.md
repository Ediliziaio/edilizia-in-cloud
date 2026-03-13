

## Analisi Bug e Criticita -- INT-02, INT-04, INT-05

### BUG CRITICI

**1. `deleted_at` non esiste su `documenti_fiscali` -- query falliscono silenziosamente**
- File: `src/hooks/billing/useDashboardBillingKPI.ts` (righe 35, 144)
- `.is("deleted_at", null)` filtra su una colonna inesistente. La query potrebbe fallire o restituire risultati errati.
- Fix: Rimuovere `.is("deleted_at", null)` e sostituire con `.neq("stato", "annullata")` (gia usato nella view `fattura_pagamento_stato`).

**2. CTA "Crea fattura per questo ordine" non passa l'ordine_id**
- File: `src/pages/azienda/OrderDetail.tsx` (riga 769)
- Il link naviga a `/azienda/documenti/nuovo?tipo=fattura` senza `&ordine=${id}`.
- L'editor fattura non legge nemmeno il parametro `ordine` dai searchParams (nessuna pre-compilazione implementata).
- Fix: Cambiare in `navigate(`/azienda/documenti/nuovo?tipo=fattura&ordine=${id}`)` e aggiungere logica di pre-compilazione nell'EditorDocumento.

**3. Trigger INT-04 `trg_prima_nota_on_fattura_emessa` genera doppioni**
- Il trigger genera un'entry di Prima Nota per `direction=entrata` quando una fattura diventa `emessa`. Ma l'emissione di una fattura NON e un incasso -- e un riconoscimento di credito. 
- Contemporaneamente, il trigger `trg_prima_nota_on_incasso` genera un'altra entry `direction=entrata` quando arriva il pagamento effettivo.
- Risultato: per una fattura emessa e poi incassata, ci sono **2 entrate** nella Prima Nota, gonfiando il saldo. In contabilita semplificata, solo l'incasso dovrebbe generare un'entrata. L'emissione fattura (credito) non e un movimento di cassa.
- Fix: Rimuovere il trigger `trg_prima_nota_on_fattura_emessa` oppure cambiare la sua direction in un tipo "informativo" che non impatti il saldo.

### BUG MEDI

**4. `useTopClientiByFatturato` non e gated su `isNative`**
- File: `src/hooks/billing/useDashboardBillingKPI.ts` (riga 131)
- L'hook esegue sempre la query se c'e un `companyId`, anche se il billing mode e `external`. La query non fallisce ma restituisce dati vuoti inutilmente.
- Il `ClienteSituazioneWidget` controlla `isNative` nel rendering, ma l'hook gira ugualmente.
- Fix: Aggiungere parametro `enabled` come in `useDashboardBillingKPI`.

**5. RLS `fattura_ordine` usa `get_my_company_id()` -- incompatibile con super_admin impersonation**
- File: migration `20260313065800_358a7548` (righe 20-23)
- Le altre tabelle native hanno un bypass esplicito per `super_admin`. La policy di `fattura_ordine` usa solo `get_my_company_id()` che per un super_admin con `company_id=null` potrebbe restituire null, bloccando tutte le operazioni.
- Fix: Aggiungere bypass super_admin nella policy come nelle altre tabelle di fatturazione.

**6. View `fattura_pagamento_stato` non ha RLS/security_invoker coerente**
- La seconda migration sovrascrive la view con `security_invoker = true`, ma la view fa JOIN su `documenti_fiscali` e `movimenti_cassa_native` che hanno RLS proprie. Il risultato dipende dal ruolo dell'utente chiamante, il che e corretto, ma va verificato che il super_admin con impersonation funzioni.

### BUG MINORI

**7. `EditorDocumento` non legge `?ordine=ID` dai searchParams**
- Non c'e logica di pre-compilazione da ordine. Il parametro `ordine` viene ignorato.
- Fix: Aggiungere fetch ordine e pre-compilazione `anagrafica_id` + `ordine_id` + oggetto.

**8. Trigger incasso Prima Nota non gestisce DELETE**
- Il trigger `trg_prima_nota_on_incasso` e solo su INSERT. Se un movimento viene cancellato, l'entry di Prima Nota resta, creando inconsistenza.
- Fix: Gestire anche DELETE (inserendo entry di storno) o eliminando l'entry correlata.

**9. `formatCurrencyCompact` non gestisce valori negativi correttamente**
- `formatCurrencyCompact(-500)` restituisce `€-500` senza spazio. Minore ma visivamente brutto per scaduti.

---

### Riepilogo priorita

| # | Severita | Descrizione |
|---|---|---|
| 1 | CRITICO | `deleted_at` inesistente -- query KPI falliscono |
| 2 | CRITICO | CTA ordine non passa `ordine_id` |
| 3 | CRITICO | Trigger Prima Nota genera doppie entrate (fattura+incasso) |
| 4 | MEDIO | `useTopClientiByFatturato` non gated su `isNative` |
| 5 | MEDIO | RLS `fattura_ordine` senza bypass super_admin |
| 6 | MEDIO | View pagamento stato + security_invoker da verificare |
| 7 | MINORE | Pre-compilazione fattura da ordine mancante |
| 8 | MINORE | Trigger incasso non gestisce DELETE |
| 9 | MINORE | Format currency compatto con negativi |

### Piano di fix

1. **`useDashboardBillingKPI.ts`**: Rimuovere `.is("deleted_at", null)`, sostituire con `.neq("stato", "annullata")`
2. **`OrderDetail.tsx`**: Passare `ordine_id` nella URL CTA fattura
3. **Nuova migration**: DROP trigger `trg_prima_nota_on_fattura_emessa` o cambiare logica per non creare entrata di cassa
4. **`useDashboardBillingKPI.ts`**: Aggiungere `enabled` param a `useTopClientiByFatturato`
5. **Nuova migration**: Aggiungere bypass super_admin nelle policy di `fattura_ordine`
6. **`EditorDocumento.tsx`**: Leggere `?ordine=ID` e pre-compilare
7. **Trigger incasso**: Gestire DELETE con storno

