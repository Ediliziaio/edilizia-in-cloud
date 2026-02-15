

# Aggiungere Filtro per Origine (Manuale vs Da Ordine)

## Verifica "Motore Tapparelle mario"

Il filtro `.is("stock_item_id", null)` e' gia' applicato correttamente nella query `orderItemCosts` (riga 245). Gli articoli prelevati da Giacenze non compaiono nella sezione Costi. Confermato.

---

## Nuova Funzionalita': Filtro Origine

Aggiungere un nuovo Select "Origine" nella barra filtri, con tre opzioni:
- **Tutte le origini** (default)
- **Manuale** - solo costi inseriti manualmente nella tabella `company_costs`
- **Da Ordine** - solo costi derivati dagli ordini (articoli fornitore, squadre esterne, manodopera)

### Dettaglio tecnico

**File: `src/components/forecast/CompanyCostsManager.tsx`**

1. Aggiungere un nuovo tipo e stato:
   - Tipo: `type OriginFilter = "all" | "manual" | "order"`
   - Stato: `const [originFilter, setOriginFilter] = useState<OriginFilter>("all")`

2. Modificare i `useMemo` di `filteredCosts` e `filteredOrderItemCosts` per rispettare il filtro origine:
   - Se `originFilter === "order"`: `filteredCosts` restituisce array vuoto (nessun costo manuale)
   - Se `originFilter === "manual"`: `filteredOrderItemCosts` restituisce array vuoto (nessun costo da ordine)
   - Se `originFilter === "all"`: comportamento attuale invariato

3. Aggiungere il Select nella barra filtri (dopo il Select "Categoria", riga 1515):
   ```
   <Select value={originFilter} onValueChange={setOriginFilter}>
     <SelectTrigger className="w-[150px]">
       <SelectValue placeholder="Origine" />
     </SelectTrigger>
     <SelectContent>
       <SelectItem value="all">Tutte le origini</SelectItem>
       <SelectItem value="manual">Manuale</SelectItem>
       <SelectItem value="order">Da Ordine</SelectItem>
     </SelectContent>
   </Select>
   ```

4. Aggiungere `originFilter` al `useEffect` che resetta la selezione (riga 529).

Nessuna modifica al database. Un solo file modificato.
