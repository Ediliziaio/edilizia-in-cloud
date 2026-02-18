
# Fix Build Errors - Schermo Bianco

## Problema

L'app mostra uno schermo bianco perche' il build fallisce a causa di 6 errori TypeScript nelle Edge Functions. In Deno/TypeScript strict, le variabili nei blocchi `catch` sono di tipo `unknown` e non si puo' accedere a `.message` direttamente.

## Soluzione

Aggiungere un cast `(error as Error).message` oppure `(err as Error).message` in ogni punto. Modifica minima, una riga per file.

## File da modificare

| File | Riga | Da | A |
|------|------|----|---|
| `create-checkout-session/index.ts` | 188 | `err.message` | `(err as Error).message` |
| `create-company/index.ts` | 253 | `error.message` | `(error as Error).message` |
| `create-super-admin/index.ts` | 187 | `error.message` | `(error as Error).message` |
| `manage-super-admins/index.ts` | 354 | `error.message` | `(error as Error).message` |
| `reset-customer-password/index.ts` | 152 | `error.message` | `(error as Error).message` |
| `stripe-webhook/index.ts` | 190 | `err.message` | `(err as Error).message` |

Nessun altro file coinvolto. Dopo il fix il build tornera' verde e la preview si ripristinera'.
