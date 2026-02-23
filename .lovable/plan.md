

# Rimozione breadcrumb, bulk delete automazioni, delete nel builder

## 1. Rimuovere il breadcrumb "Home > Automazione"
File: `src/pages/azienda/marketing/MarketingAutomations.tsx`

Eliminare l'intero blocco breadcrumb (righe 168-196) che mostra "Home > Automazione > ...". Rimuovere gli import `Home` e `ChevronRight` da lucide-react (se non usati altrove nel file).

## 2. Aggiungere "Elimina selezionati" quando ci sono checkbox attive
File: `src/components/marketing/automations/AutomationFlowsList.tsx`

Interventi:
- Aggiungere una mutation `bulkDeleteMutation` che elimina tutti i flow con ID nel set `selectedIds`
- Aggiungere un `AlertDialog` di conferma per la cancellazione bulk
- Sopra la tabella, quando `selectedIds.size > 0`, mostrare una barra azioni con:
  - Conteggio elementi selezionati (es. "3 selezionati")
  - Bottone "Elimina selezionati" (icona Trash2, variant destructive)
- Al click, aprire il dialog di conferma, poi eseguire la mutation
- Al completamento, svuotare `selectedIds`

## 3. Aggiungere bottone "Elimina" nell'header del builder
File: `src/components/marketing/automations/AutomationBuilder.tsx`

Interventi:
- Aggiungere un `AlertDialog` per conferma eliminazione del flow corrente
- Aggiungere stato `showDeleteDialog`
- Aggiungere una mutation per eliminare il flow (`supabase.from("automation_flows").delete().eq("id", flowId)`)
- Nell'header (riga 1, accanto al bottone Archivia), aggiungere un bottone con icona `Trash2`:
  - Label: "Elimina"
  - Variant: ghost, colore destructive
  - Disabilitato se `!canPersist`
  - Al click apre il dialog di conferma
- Alla conferma: eliminare il flow, mostrare toast di successo, navigare alla lista
- Aggiungere import `Trash2` e componenti `AlertDialog`

## Pulizia inclusa
- Rimuovere import inutilizzati (`Home`, `ChevronRight`) dal file MarketingAutomations
- Rimuovere la query `folderPath` se il breadcrumb era l'unico consumatore (verificato: il breadcrumb era l'unico uso, quindi la query e lo stato correlato al breadcrumb vengono rimossi per pulizia)

## Dettaglio tecnico

### Bulk delete mutation (AutomationFlowsList)
```typescript
const bulkDeleteMutation = useMutation({
  mutationFn: async (ids: string[]) => {
    const { error } = await supabase
      .from("automation_flows")
      .delete()
      .in("id", ids);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
    toast({ title: "Automazioni eliminate" });
    setSelectedIds(new Set());
  },
});
```

### Delete nel builder (AutomationBuilder)
```typescript
const deleteFlowMutation = useMutation({
  mutationFn: async () => {
    const { error } = await supabase
      .from("automation_flows")
      .delete()
      .eq("id", flowId);
    if (error) throw error;
  },
  onSuccess: () => {
    toast({ title: "Automazione eliminata" });
    navigate("/azienda/marketing/automazioni");
  },
});
```

## File modificati
1. `src/pages/azienda/marketing/MarketingAutomations.tsx` -- rimozione breadcrumb + import inutili
2. `src/components/marketing/automations/AutomationFlowsList.tsx` -- barra bulk delete + dialog conferma
3. `src/components/marketing/automations/AutomationBuilder.tsx` -- bottone elimina + dialog conferma nell'header
