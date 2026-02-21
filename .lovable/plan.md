

# Ridurre lo spazio tra le macrocategorie sidebar

## Problema
Le due sezioni "Gestione Interna" e "Marketing e Vendita" sono troppo distanziate. Lo spazio e causato dal padding `p-2` del componente `SidebarGroup` applicato a entrambe le sezioni.

## Soluzione
Aggiungere la classe `pt-0` al `SidebarGroup` della sezione "Marketing e Vendita" per eliminare il padding superiore, dimezzando lo spazio tra le due sezioni.

## Dettaglio tecnico

### File: `src/components/layouts/CompanyLayout.tsx`

Alla riga 287, il secondo `SidebarGroup` (Marketing e Vendita) ricevera una classe aggiuntiva per rimuovere il padding superiore:

```tsx
// Prima
<SidebarGroup>

// Dopo
<SidebarGroup className="pt-0">
```

Questo riduce lo spazio tra le due sezioni della meta, mantenendo il padding laterale e inferiore invariato.

Un solo file modificato, una sola riga cambiata.
