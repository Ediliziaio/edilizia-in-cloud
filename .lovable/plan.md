

# Fix: Eliminazione clienti incompleta

## Problema
In `src/pages/azienda/CustomersList.tsx` (riga 225-228), l'eliminazione clienti fa solo:
```typescript
await supabase.from("profiles").delete().eq("id", customerId);
```
Questo elimina solo il profilo, lasciando orfani l'account auth e il record `user_roles`. Per questo l'email `f.andriciuc@overthemol.com` risulta ancora "già registrata".

## Soluzione

### 1. Fix immediato: pulire il record orfano esistente
Eliminare manualmente `user_roles` e l'account auth per `686a04ef-74b0-4fa1-9eb4-1fa397fbbf8b` tramite la edge function `delete-company-user`.

### 2. Fix strutturale: `src/pages/azienda/CustomersList.tsx`
Sostituire la `deleteCustomerMutation` (righe 225-228) per usare la edge function `delete-company-user` invece della query diretta:

```typescript
const deleteCustomerMutation = useMutation({
  mutationFn: async (customerId: string) => {
    const { data, error } = await supabase.functions.invoke("delete-company-user", {
      body: { userId: customerId },
    });
    if (error) {
      let errorMessage = "Errore durante l'eliminazione";
      try {
        const errorBody = await error.context?.json?.();
        if (errorBody?.error) errorMessage = errorBody.error;
      } catch {
        if (error.message && !error.message.includes("non-2xx")) {
          errorMessage = error.message;
        }
      }
      throw new Error(errorMessage);
    }
    if (data?.error) throw new Error(data.error);
  },
  // ...rest unchanged
});
```

La edge function `delete-company-user` già gestisce la pulizia completa: `staff_permissions` → `user_roles` → `profiles` → `auth.users`.

