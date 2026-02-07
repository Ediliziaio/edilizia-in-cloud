
# Piano: Report IVA Mensile, Gestione Fornitori e Test Squadre Esterne

## Panoramica

Implementazione di tre funzionalità:
1. **Report IVA mensile** per la liquidazione periodica
2. **Gestione fornitori** con possibilita di modificare l'IVA esistente
3. **Istruzioni per testare** le squadre esterne con diverse aliquote IVA

---

## 1. Report IVA Mensile

### Descrizione

Una nuova pagina dedicata che mostra il riepilogo IVA mensile aggregando tutti gli ordini, permettendo di visualizzare:
- IVA a debito totale (vendite)
- IVA a credito totale (acquisti articoli + squadre esterne)
- Saldo IVA da versare/recuperare

### Layout Proposto

```
┌─────────────────────────────────────────────────────────────────┐
│ Report IVA                                                      │
│ Riepilogo IVA per la liquidazione periodica                     │
├─────────────────────────────────────────────────────────────────┤
│ [← Febbraio 2026 →]   [📥 Esporta CSV]                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ IVA Debito   │  │ IVA Credito  │  │ Saldo IVA    │          │
│  │ € 12.500,00  │  │ € 4.200,00   │  │ € 8.300,00   │          │
│  │ Da 15 ordini │  │ Detraibile   │  │ Da versare   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ DETTAGLIO IVA A DEBITO (Vendite)                               │
├────────────┬───────────────┬────────────┬──────────┬───────────┤
│ Ordine     │ Cliente       │ Imponibile │ IVA %    │ IVA       │
├────────────┼───────────────┼────────────┼──────────┼───────────┤
│ ORD-001    │ Mario Rossi   │ € 10.000   │ 22%      │ € 2.200   │
│ ORD-002    │ Luigi Bianchi │ €  5.000   │ 10%      │ €   500   │
│ ...        │               │            │          │           │
├────────────┴───────────────┴────────────┴──────────┼───────────┤
│                                          TOTALE    │ € 12.500  │
├─────────────────────────────────────────────────────────────────┤
│ DETTAGLIO IVA A CREDITO (Acquisti Articoli)                    │
├────────────┬───────────────┬────────────┬──────────┬───────────┤
│ Ordine     │ Articolo      │ Lordo      │ IVA %    │ IVA       │
├────────────┼───────────────┼────────────┼──────────┼───────────┤
│ ORD-001    │ Finestra A    │ € 1.220    │ 22%      │ €   220   │
│ ORD-001    │ Vetro B       │ €   800    │ 0%       │ €     0   │
│ ...        │               │            │          │           │
├────────────┴───────────────┴────────────┴──────────┼───────────┤
│                                          TOTALE    │ €  2.500  │
├─────────────────────────────────────────────────────────────────┤
│ DETTAGLIO IVA A CREDITO (Squadre Esterne)                      │
├────────────┬───────────────┬────────────┬──────────┬───────────┤
│ Ordine     │ Squadra       │ Lordo      │ IVA %    │ IVA       │
├────────────┼───────────────┼────────────┼──────────┼───────────┤
│ ORD-001    │ Installaz. A  │ € 3.050    │ 22%      │ €   550   │
│ ORD-002    │ Montatori B   │ € 2.500    │ 0%       │ €     0   │
├────────────┴───────────────┴────────────┴──────────┼───────────┤
│                                          TOTALE    │ €  1.700  │
└─────────────────────────────────────────────────────────────────┘
```

### Navigazione

Aggiungere voce nel menu laterale:
- Posizione: sotto "Previsionale"
- Icona: `Receipt` (lucide-react)
- Label: "Report IVA"
- URL: `/azienda/report-iva`

---

## 2. Gestione Fornitori

### Descrizione

Aggiungere una nuova tab nella pagina Impostazioni per gestire i fornitori, permettendo di:
- Visualizzare tutti i fornitori esistenti
- Modificare nome e aliquota IVA predefinita
- Eliminare fornitori non utilizzati

### Layout Proposto

```
Impostazioni
├── Profilo Azienda
├── Stati Ordine
└── Fornitori (NUOVA)
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 🏭 Fornitori                                                    │
│ Gestisci i tuoi fornitori e le relative aliquote IVA           │
├─────────────────────────────────────────────────────────────────┤
│                                              [+ Nuovo Fornitore]│
├────────────────────────────────┬──────────────┬─────────────────┤
│ Nome Fornitore                 │ Aliquota IVA │ Azioni          │
├────────────────────────────────┼──────────────┼─────────────────┤
│ ABC Serramenti Srl             │ 22%          │ [✏️] [🗑️]       │
│ XYZ Import (Germania)          │ 0%           │ [✏️] [🗑️]       │
│ Vetreria Rossi                 │ 10%          │ [✏️] [🗑️]       │
└────────────────────────────────┴──────────────┴─────────────────┘
```

### Dialog Modifica Fornitore

```
┌────────────────────────────────────┐
│       Modifica Fornitore           │
├────────────────────────────────────┤
│ Nome Fornitore *                   │
│ [ABC Serramenti Srl____________]   │
│                                    │
│ Aliquota IVA Predefinita           │
│ [▼ 22% - Ordinaria            ]    │
│                                    │
│            [Annulla] [Salva]       │
└────────────────────────────────────┘
```

---

## 3. Test Squadre Esterne

Questo non richiede modifiche al codice. Le istruzioni per testare sono:

1. Vai su `/azienda/dipendenti`
2. Clicca su "Nuova Squadra"
3. Crea squadra forfettaria:
   - Nome: "Installatori Verdi (Forfettario)"
   - Regime IVA: 0% - Forfettario/Esente
4. Crea squadra ordinaria:
   - Nome: "Montatori Rossi Srl"
   - Regime IVA: 22% - Regime ordinario
5. Vai su un ordine `/azienda/ordini/:id/modifica`
6. Nella tab "Manodopera", assegna entrambe le squadre con costi diversi
7. Verifica nel Conto Economico che:
   - La squadra forfettaria mostra costo netto = costo lordo (IVA 0)
   - La squadra ordinaria mostra costo netto scorporato + IVA detraibile

---

## File da Creare/Modificare

| File | Operazione | Descrizione |
|------|------------|-------------|
| `src/pages/azienda/VatReport.tsx` | Creare | Nuova pagina report IVA mensile |
| `src/components/settings/SuppliersConfig.tsx` | Creare | Componente gestione fornitori |
| `src/pages/azienda/Settings.tsx` | Modificare | Aggiungere tab Fornitori |
| `src/components/layouts/CompanyLayout.tsx` | Modificare | Aggiungere voce menu Report IVA |
| `src/App.tsx` | Modificare | Aggiungere route /azienda/report-iva |

---

## Sezione Tecnica

### Query Report IVA

```typescript
// Fetch ordini del mese selezionato
const { data: orders } = useQuery({
  queryKey: ["vat-report-orders", companyId, selectedMonth],
  queryFn: async () => {
    const startDate = startOfMonth(selectedMonth);
    const endDate = endOfMonth(selectedMonth);
    
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_code,
        total_amount,
        vat_rate,
        created_at,
        customer:profiles!orders_customer_id_fkey(first_name, last_name)
      `)
      .eq("company_id", companyId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());
    
    if (error) throw error;
    return data;
  },
});

// Fetch order_items con IVA per il mese
const { data: orderItems } = useQuery({
  queryKey: ["vat-report-items", companyId, selectedMonth],
  queryFn: async () => {
    // Fetch items degli ordini del mese con relativi order details
    const { data, error } = await supabase
      .from("order_items")
      .select(`
        id,
        name,
        purchase_price,
        quantity,
        vat_rate,
        order:orders!inner(id, order_code, company_id, created_at)
      `);
    
    if (error) throw error;
    // Filtra per company e mese
    return data.filter(item => 
      item.order.company_id === companyId &&
      isWithinInterval(new Date(item.order.created_at), { start: startDate, end: endDate })
    );
  },
});

// Fetch external teams con IVA per il mese
const { data: externalTeams } = useQuery({
  queryKey: ["vat-report-teams", companyId, selectedMonth],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("order_external_teams")
      .select(`
        id,
        total_cost,
        vat_rate,
        order:orders!inner(id, order_code, company_id, created_at),
        external_team:external_teams(name)
      `);
    
    if (error) throw error;
    // Filtra per company e mese
    return data.filter(team => 
      team.order.company_id === companyId &&
      isWithinInterval(new Date(team.order.created_at), { start: startDate, end: endDate })
    );
  },
});
```

### Calcolo IVA Aggregato

```typescript
interface VatSummary {
  vatDebit: number;        // IVA vendite
  vatCreditItems: number;  // IVA acquisti articoli
  vatCreditTeams: number;  // IVA squadre esterne
  vatBalance: number;      // Saldo
}

const calculateVatSummary = (orders, items, teams): VatSummary => {
  // IVA a debito (vendite)
  const vatDebit = orders.reduce((sum, order) => {
    const vatAmount = order.total_amount * (order.vat_rate / 100);
    return sum + vatAmount;
  }, 0);
  
  // IVA a credito articoli
  const vatCreditItems = items.reduce((sum, item) => {
    const grossCost = (item.purchase_price || 0) * item.quantity;
    const { vatAmount } = calculateNetFromGross(grossCost, item.vat_rate || 22);
    return sum + vatAmount;
  }, 0);
  
  // IVA a credito squadre
  const vatCreditTeams = teams.reduce((sum, team) => {
    const { vatAmount } = calculateNetFromGross(team.total_cost, team.vat_rate || 22);
    return sum + vatAmount;
  }, 0);
  
  return {
    vatDebit,
    vatCreditItems,
    vatCreditTeams,
    vatBalance: vatDebit - vatCreditItems - vatCreditTeams,
  };
};
```

### Componente SuppliersConfig

```typescript
interface Supplier {
  id: string;
  name: string;
  vat_rate: number;
  created_at: string;
}

// Fetch suppliers
const { data: suppliers } = useQuery({
  queryKey: ["suppliers", companyId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    if (error) throw error;
    return data;
  },
});

// Update supplier mutation
const updateMutation = useMutation({
  mutationFn: async ({ id, name, vat_rate }) => {
    const { error } = await supabase
      .from("suppliers")
      .update({ name, vat_rate })
      .eq("id", id);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  },
});

// Delete supplier mutation
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },
});
```

### Aggiornamento Menu

```typescript
// CompanyLayout.tsx - navItems
const navItems = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard },
  { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList },
  { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse },
  { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays },
  { title: "Clienti", url: "/azienda/clienti", icon: Users },
  { title: "Dipendenti", url: "/azienda/dipendenti", icon: HardHat },
  { title: "Assistenza", url: "/azienda/assistenza", icon: HeadphonesIcon },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp },
  { title: "Report IVA", url: "/azienda/report-iva", icon: Receipt }, // NUOVO
  { title: "Impostazioni", url: "/azienda/impostazioni", icon: Settings },
];
```

### Esportazione CSV

```typescript
const exportToCsv = () => {
  const rows = [
    ["Tipo", "Ordine", "Descrizione", "Imponibile/Lordo", "Aliquota IVA", "IVA"],
    ...salesDetails.map(s => ["Vendita", s.orderCode, s.customerName, s.netAmount, s.vatRate, s.vatAmount]),
    ...itemDetails.map(i => ["Acquisto Articolo", i.orderCode, i.itemName, i.grossCost, i.vatRate, i.vatAmount]),
    ...teamDetails.map(t => ["Squadra Esterna", t.orderCode, t.teamName, t.grossCost, t.vatRate, t.vatAmount]),
  ];
  
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  // Download...
};
```
