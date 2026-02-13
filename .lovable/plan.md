
# Piano: Stabilizzazione, Bug Fix e Miglioramenti UX

## Panoramica

Analisi completa del codebase con identificazione di bug, codice morto, warning console e problemi UX. Di seguito il piano dettagliato di interventi.

---

## 1. Bug e Warning da Correggere

### 1.1 Warning Console: "Function components cannot be given refs"

Il warning viene generato perche `CompaniesList` e un function component esportato come `export default function` senza `forwardRef`. React Router lo monta come child di `Outlet` che tenta di passare un ref. La soluzione e ignorabile (non causa errori funzionali), ma per pulire la console bisogna verificare se il componente riceve un ref dal parent.

**Azione**: Il warning sembra provenire dal `Select` di Radix dentro `CompaniesList`. Non e un bug critico ma va investigato il passaggio di ref a `Select`.

### 1.2 Login.tsx - Redirect incompleto per ruoli employee e salesperson

In `Login.tsx` (riga 82-90), il `switch` per il redirect dopo login non include `employee` e `salesperson`:
```
case "super_admin": return <Navigate to="/admin" />;
case "company_admin":
case "company_staff": return <Navigate to="/azienda" />;
case "customer": return <Navigate to="/cliente" />;
// MANCANO: employee, salesperson
```

**Azione**: Aggiungere i case mancanti:
- `employee` -> `/dipendente`
- `salesperson` -> `/venditore`

### 1.3 CompanyDetail.tsx - useEffect con `form` nelle dipendenze

In `CompanyDetail.tsx` riga 242, `form` e nelle dipendenze di `useEffect` ma `form` e un oggetto `useForm` che cambia ad ogni render, causando potenziali re-fetch infiniti.

**Azione**: Rimuovere `form` dalle dipendenze dell'`useEffect` e usare `form.reset()` fuori dal ciclo di dipendenze.

### 1.4 CompanyDetail.tsx - Mixing useEffect + useState con useQuery

Il componente usa `useEffect` manuale con `useState` per caricare company e stats (righe 204-242), invece di usare `useQuery` come fa per gli altri dati (team, plan, logs). Questo crea inconsistenza e impedisce il caching/refetch automatico.

**Azione**: Convertire il fetch iniziale di company e stats in `useQuery` per consistenza e caching.

---

## 2. Codice da Rimuovere / Pulire

### 2.1 Import inutilizzati in AdminLayout.tsx

`CreditCard` e importato ma non usato (era per la voce "Abbonamenti" rimossa). La voce e ancora presente in `navItems` come "Piani" e usa `CreditCard`, quindi in realta e ancora usato. **Nessuna azione necessaria.**

### 2.2 Commenti legacy in App.tsx

Righe 26, 31, 104 contengono commenti su file rimossi (`EditCompany`, `Subscriptions`). Sono rumore.

**Azione**: Rimuovere i commenti obsoleti.

### 2.3 Duplicazione `sectorLabels` e `statusConfig`

Queste costanti sono duplicate tra `CompaniesList.tsx` e `CompanyDetail.tsx`.

**Azione**: Estrarre in un file condiviso `src/lib/companyUtils.ts` per DRY (opzionale, bassa priorita).

---

## 3. Miglioramenti UX

### 3.1 CompaniesList - Loading state migliorato

Attualmente mostra solo testo "Caricamento...". Aggiungere un `Loader2` animato per feedback visivo coerente.

### 3.2 CompanyDetail - Feedback salvataggio migliorato

Il bottone "Salva Modifiche" potrebbe mostrare un breve stato di successo (es. checkmark) dopo il salvataggio, non solo il toast.

### 3.3 CompanyDetail - Mutazioni con loading state

I bottoni "Sospendi", "Riattiva", "Estendi Trial", "Conferma" nel dialog cambio piano non mostrano loading state durante le mutazioni.

**Azione**: Aggiungere `disabled` e spinner durante `isPending` delle mutazioni.

### 3.4 Empty states coerenti

Verificare che tutte le tab abbiano empty state con CTA chiare (gia presenti nella maggior parte dei casi).

---

## 4. File da Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/Login.tsx` | Fix | Aggiungere redirect per employee e salesperson |
| `src/pages/admin/CompanyDetail.tsx` | Fix + UX | Rimuovere `form` da useEffect deps, convertire fetch a useQuery, aggiungere loading state ai bottoni mutazione |
| `src/pages/admin/CompaniesList.tsx` | UX | Migliorare loading state con spinner |
| `src/App.tsx` | Pulizia | Rimuovere commenti legacy |

---

## Dettagli Tecnici

### Fix Login.tsx (critico)

Aggiungere dopo riga 88:
```
case "employee":
  return <Navigate to="/dipendente" replace />;
case "salesperson":
  return <Navigate to="/venditore" replace />;
```
Aggiungere anche un `default` che reindirizzi a `/` per sicurezza.

### Fix CompanyDetail.tsx - useEffect

Cambiare le dipendenze dell'useEffect da `[id, form]` a `[id]` e garantire che `form.reset()` venga chiamato correttamente senza causare loop.

Idealmente, convertire tutto il fetch iniziale in `useQuery`:
```
const { data: company, isLoading } = useQuery({
  queryKey: ["company-detail", id],
  queryFn: async () => { ... },
  enabled: !!id,
});
```

### Bottoni mutazione con loading

Per ogni `useMutation`, usare `mutation.isPending` per disabilitare il bottone e mostrare spinner:
```
<Button
  disabled={updateStatusMutation.isPending}
  onClick={...}
>
  {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
  Sospendi
</Button>
```

### CompaniesList loading

Sostituire il testo "Caricamento..." con il pattern standard usato ovunque:
```
<div className="flex items-center justify-center py-12">
  <Loader2 className="h-8 w-8 animate-spin text-primary" />
</div>
```

---

## Riepilogo Priorita

1. **CRITICO**: Login.tsx - redirect mancanti per employee/salesperson (causa dead-end dopo login)
2. **ALTO**: CompanyDetail.tsx - `form` in useEffect deps (potenziale loop)
3. **MEDIO**: Loading states e feedback UX su mutazioni
4. **BASSO**: Pulizia commenti, DRY costanti duplicate
