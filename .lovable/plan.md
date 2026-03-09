

## Fix critici sicurezza e robustezza — Piano di implementazione

### Stato attuale verificato
- **Punto 3 (password)**: GIA' RISOLTO — `generateSecurePassword` in `_shared/securePassword.ts` usa `crypto.getRandomValues()` con Fisher-Yates shuffle
- **Punto 1 (RLS WITH CHECK)**: Da fare — migration SQL
- **Punti 2, 4, 5, 6, 7**: Da fare — modifiche codice

---

### Modifiche da eseguire

**1. Migration SQL — RLS `staff_permissions` WITH CHECK**

Aggiungere `WITH CHECK` alla policy esistente per bloccare scritture cross-tenant:

```sql
ALTER POLICY "Company admins can manage staff permissions"
  ON public.staff_permissions
  USING (
    has_role(auth.uid(), 'company_admin'::app_role) AND
    company_id = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'company_admin'::app_role) AND
    company_id = get_user_company_id(auth.uid())
  );
```

**2. `SettingsUserDetail.tsx` — Consolidare delete ruoli in singola query**

Sostituire il `for` loop (righe 166-169) con:
```typescript
const { error } = await supabase.from("user_roles").delete()
  .eq("user_id", userId!).in("role", ["company_admin","company_staff","salesperson","call_center"]);
if (error) throw error;
```

**3. `delete-company-user/index.ts` — Due fix**

a) Super Admin bypass: se il caller e' super_admin, saltare il check company_id match (riga 57), altrimenti un super_admin non puo' eliminare utenti.

b) Se `deleteAuthError` e' presente, restituire errore 500 invece di `{ success: true }` (righe 91-95):
```typescript
if (deleteAuthError) {
  return new Response(JSON.stringify({ error: "Errore eliminazione account: " + deleteAuthError.message }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

**4. `usePermissions.ts` — `canViewUsers` leggere dal DB**

Riga 158: cambiare `canViewUsers: false` in `canViewUsers: permissions?.can_view_users ?? false`. Questo richiede che la colonna `can_view_users` esista in `staff_permissions` — verificheremo e aggiungeremo via migration se mancante.

**5. `SettingsUserDetail.tsx` — Gestire `userData.role` undefined**

Nel rendering, se `userData.role` e' undefined, mostrare un avviso nel tab Ruoli invece di passare undefined al componente.

---

### Riepilogo file modificati
| File | Tipo modifica |
|------|--------------|
| Migration SQL | RLS WITH CHECK |
| `supabase/functions/delete-company-user/index.ts` | Super admin bypass + error handling |
| `src/pages/azienda/settings/SettingsUserDetail.tsx` | Singola query delete ruoli + undefined role guard |
| `src/hooks/usePermissions.ts` | canViewUsers dal DB |

