

# Fix: Auto-create anagrafica_azienda when missing

## Problem
The `genera_numero_documento_native` DB function does `SELECT * FROM anagrafica_azienda WHERE company_id = p_company_id` and raises an exception if no row is found. Companies that haven't configured their billing profile yet will always fail when creating any document.

## Solution
Modify the `useCreateDocumento` hook to check if `anagrafica_azienda` exists for the company before calling the RPC. If not, auto-insert a minimal default row (with default prefixes and counters at 0).

This is a single-file fix in `src/hooks/useDocumentiFiscali.ts` inside the `useCreateDocumento` mutation function. Before the RPC call, add:

```typescript
// Ensure anagrafica_azienda exists
const { data: anaExists } = await supabase
  .from("anagrafica_azienda")
  .select("id")
  .eq("company_id", companyId)
  .maybeSingle();

if (!anaExists) {
  await supabase.from("anagrafica_azienda").insert({
    company_id: companyId,
    ragione_sociale: "Da configurare",
    regime_fiscale: "RF01",
  });
}
```

No DB migration needed — the table and columns already exist with sensible defaults.

| File | Change |
|------|--------|
| `src/hooks/useDocumentiFiscali.ts` | Add anagrafica_azienda auto-creation before RPC call |

