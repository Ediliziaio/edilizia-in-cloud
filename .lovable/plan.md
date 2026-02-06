

# Piano: Correzione Allineamento Banner Impersonazione

## Problema Identificato
Il banner giallo di impersonazione è posizionato fuori dalla struttura principale del layout. Attualmente:
- Il banner occupa tutta la larghezza dello schermo
- La sidebar inizia sotto il banner
- Questo crea un disallineamento visivo ("sfasato")

## Struttura Attuale (Problematica)
```
+------------------------------------------+
|  [Banner Giallo - Tutta Larghezza]       |
+------------------------------------------+
| Sidebar |  Header                        |
|         |--------------------------------|
|         |  Contenuto                     |
+------------------------------------------+
```

## Soluzione Proposta
Spostare il banner giallo **sopra l'header** ma **dentro l'area del contenuto**, in modo che sia allineato con il contenuto e non con la sidebar:

```
+------------------------------------------+
| Sidebar |  [Banner Giallo]               |
|         |--------------------------------|
|         |  Header                        |
|         |--------------------------------|
|         |  Contenuto                     |
+------------------------------------------+
```

## Modifiche al Codice

### File: `src/components/layouts/CompanyLayout.tsx`

Spostare `<ImpersonationBanner />` dalla posizione esterna a dentro il div del contenuto principale:

**Da (attuale):**
```tsx
<SidebarProvider>
  <div className="min-h-screen flex flex-col w-full">
    <ImpersonationBanner />  <!-- QUI - fuori dalla struttura flex -->
    <div className="flex flex-1">
      <CompanySidebar />
      <div className="flex-1 flex flex-col">
        <header>...</header>
        <main>...</main>
      </div>
    </div>
  </div>
</SidebarProvider>
```

**A (corretto):**
```tsx
<SidebarProvider>
  <div className="min-h-screen flex w-full">
    <CompanySidebar />
    <div className="flex-1 flex flex-col">
      <ImpersonationBanner />  <!-- SPOSTATO QUI - sopra l'header -->
      <header>...</header>
      <main>...</main>
    </div>
  </div>
</SidebarProvider>
```

## Risultato Atteso
- Il banner giallo sara allineato con il contenuto principale
- La sidebar rimane a sinistra senza essere influenzata dal banner
- Layout coerente e visivamente corretto
- Il banner appare solo sopra l'area di lavoro, non su tutta la pagina

## File da Modificare

| File | Azione |
|------|--------|
| `src/components/layouts/CompanyLayout.tsx` | Spostare ImpersonationBanner dentro il div del contenuto |

