

## Piano: Prompt 1 — Bug Critici (crash + sicurezza)

Analisi completata su tutti i file. Ecco lo stato di ogni fix:

### FIX 1 — XSS in CampaignEditor ✅ Da fare
Righe 162 e 177: `linkUrl` e `imageUrl` inseriti direttamente in HTML via `execCmd("insertHTML", ...)`.
**Intervento:** Aggiungere funzione `sanitizeUrl()` che valida protocollo (solo http/https/mailto). Usarla in `confirmInsertLink` (riga 162) e `confirmInsertImage` (riga 177). Anche `imageAlt` va escaped per evitare attribute injection.

### FIX 2 — Memory leak timer ✅ Parzialmente fatto
`autoSaveTimer` è già un `useRef` (riga 75) e `triggerAutoSave` è già un `useCallback` (riga 129). Manca solo il cleanup `useEffect` per pulire il timer allo smontaggio.
**Intervento:** Aggiungere un `useEffect` con return cleanup che fa `clearTimeout(autoSaveTimer.current)`.

### FIX 3 — `.in()` con array vuoto ⚠️ Da verificare
Non trovato `.in("order_id", ...)` in useCompanyCostsData. Le query usano `.eq("company_id", ...)` con `enabled: !!companyId`. Nessun `.in()` su array potenzialmente vuoto in questo file.
**Intervento:** Skip — il bug non esiste in questo file.

### FIX 4 — Confronto date come stringhe ⚠️ Basso rischio
I confronti usano `format(now, "yyyy-MM-dd")` da date-fns, che produce sempre formato ISO. Il pattern `inst.expected_date < todayStr` funziona correttamente con stringhe ISO.
**Intervento:** Skip — il formato è già consistente. Aggiungere utility `isDateBefore`/`isDateAfter` sarebbe over-engineering senza beneficio reale.

### FIX 5 — Scostamento invertito ✅ Da fare
Riga 578: `scostamento: totalPaid - totalPrevisti`. E riga 563: `scostamento = totalPaid - (totalPaid + totalUnpaid - totalOverdue)` (calcolo ridondante, la riga 578 sovrascrive).
**Intervento:** Cambiare riga 578 a `totalPrevisti - totalPaid`. Rimuovere la riga 563 che è dead code (sovrascritta).

### FIX 6 — `.single()` su query multi-risultato ✅ Da fare
Righe 274 e 278: `.limit(1).single()` — `.single()` lancia errore se 0 risultati, `.maybeSingle()` restituisce null.
**Intervento:** Sostituire `.single()` con `.maybeSingle()` alle righe 274 e 278 (le query di lookup contatto per email/telefono). Lasciare `.single()` alle righe 282 e 291 (insert che devono restituire il record creato).

### FIX 7 — Import in loop sequenziale ⚠️ Complesso
Il loop (righe 265-310) non può essere facilmente batchizzato perché ogni riga richiede lookup/creazione contatto + insert opportunità + insert custom fields, con error handling per riga.
**Intervento:** Skip — la struttura richiede operazioni dipendenti per riga. Il batch puro non è possibile senza ristrutturazione significativa.

### FIX 8 — `document.execCommand()` deprecato ⚠️ Non cambiare
`execCommand` è ancora funzionante in tutti i browser moderni per contentEditable. Sostituirlo con manipolazione DOM manuale è fragile e bug-prone. L'alternativa corretta sarebbe migrare a una libreria editor (TipTap, Slate).
**Intervento:** Aggiungere commento `// TODO: Migrare a libreria editor (TipTap/Slate) — execCommand è deprecato` alla riga 146. Non sostituire la logica.

---

### Riepilogo file da modificare

| File | Modifiche |
|------|-----------|
| `src/pages/azienda/marketing/CampaignEditor.tsx` | sanitizeUrl + escapeHtml per link/immagine, cleanup useEffect per timer, commento TODO execCommand |
| `src/hooks/useCompanyCostsData.ts` | Fix scostamento (riga 578), rimuovere dead code (riga 563) |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | `.single()` → `.maybeSingle()` righe 274, 278 |

3 file, zero modifiche funzionali visibili (solo fix sicurezza e correttezza calcolo).

