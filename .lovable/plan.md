
# Piano: Nuova Pagina di Login con Due Aree Separate

## Problemi Attuali
1. Layout troppo compatto - poca spaziatura
2. Un solo form di login generico - non distingue tra cliente e azienda/admin

## Nuova Proposta

### Layout Generale
Pagina a **schermo intero** con due grandi sezioni cliccabili affiancate (su desktop) o impilate (su mobile):

```
+------------------------------------------+------------------------------------------+
|                                          |                                          |
|           AREA CLIENTI                   |          AREA AZIENDA                    |
|                                          |                                          |
|    [Icona grande User/Home]              |    [Icona grande Building/Briefcase]     |
|                                          |                                          |
|    "Sei un Cliente?"                     |    "Sei un'Azienda?"                     |
|                                          |                                          |
|    Accedi al portale per                 |    Accedi per gestire ordini,            |
|    visualizzare i tuoi ordini            |    clienti e assistenza                  |
|    e richiedere assistenza               |                                          |
|                                          |                                          |
|    [ACCEDI COME CLIENTE]                 |    [ACCEDI COME AZIENDA]                 |
|                                          |                                          |
|    Sfondo: gradiente chiaro/soft         |    Sfondo: gradiente primary/blu         |
|                                          |                                          |
+------------------------------------------+------------------------------------------+
```

### Flusso Utente
1. L'utente arriva sulla pagina e vede le due opzioni ben distinte
2. Cliccando su una delle due aree, si apre un **modal/dialog** o una **transizione** al form di login specifico
3. Il form contiene:
   - Logo EdiliziaInCloud
   - Titolo contestuale ("Accesso Clienti" o "Accesso Azienda")
   - Form email + password
   - Pulsante per tornare alla selezione

### Opzione A: Due Card Grandi con Modal
- Due grandi card affiancate occupano tutto lo schermo
- Cliccando si apre un Dialog con il form di login
- Sfondo rimane visibile, focus sul form

### Opzione B: Transizione a Schermo Intero
- Due grandi aree affiancate
- Cliccando, l'area selezionata si espande e mostra il form
- Animazione fluida

**Proposta consigliata: Opzione A** - piu pulita e mantiene il contesto visivo

---

## Struttura UI Dettagliata

### Pagina Iniziale (Selezione Tipo Utente)

```
+--------------------------------------------------------------------------------+
|                                                                                |
|                         [Logo EdiliziaInCloud - centrato in alto]              |
|                                                                                |
+--------------------------------------------------------------------------------+
|                                    |                                           |
|                                    |                                           |
|        +-----------------------+   |   +---------------------------+           |
|        |                       |   |   |                           |           |
|        |    [Icona User]       |   |   |    [Icona Building]       |           |
|        |                       |   |   |                           |           |
|        |   Accesso Clienti     |   |   |   Accesso Azienda         |           |
|        |                       |   |   |                           |           |
|        |   Visualizza ordini   |   |   |   Gestisci ordini,        |           |
|        |   e richiedi          |   |   |   clienti e assistenza    |           |
|        |   assistenza          |   |   |                           |           |
|        |                       |   |   |                           |           |
|        |   [ACCEDI]            |   |   |   [ACCEDI]                |           |
|        |                       |   |   |                           |           |
|        +-----------------------+   |   +---------------------------+           |
|                                    |                                           |
|                                    |                                           |
+--------------------------------------------------------------------------------+
```

### Modal Login (Esempio Cliente)

```
+----------------------------------+
|          [X]                     |
|                                  |
|    [Logo EdiliziaInCloud]        |
|                                  |
|    Accesso Area Clienti          |
|    Inserisci le tue credenziali  |
|                                  |
|    Email                         |
|    [______________________]      |
|                                  |
|    Password                      |
|    [______________________] [👁]  |
|                                  |
|    [        ACCEDI        ]      |
|                                  |
|    -------------------------     |
|    Problemi? Contatta la tua     |
|    azienda di riferimento        |
|                                  |
+----------------------------------+
```

---

## Design Visivo

### Card Clienti
- Sfondo: Gradiente leggero (grigio/azzurro chiaro)
- Icona: `UserCircle` o `Home` in colore primary
- Hover: Leggera elevazione con ombra

### Card Azienda
- Sfondo: Gradiente primary (blu)
- Icona: `Building2` o `Briefcase` in bianco
- Testo: Bianco
- Hover: Leggera luminosita

### Spaziatura
- Padding generoso (p-8 o p-12)
- Gap tra elementi aumentato
- Card con altezza minima per non sembrare compatte

---

## File da Modificare

| File | Azione |
|------|--------|
| `src/components/auth/LoginForm.tsx` | Riscrivere completamente con nuovo layout |

---

## Dettagli Tecnici

### Stato Componente
```tsx
const [selectedType, setSelectedType] = useState<'cliente' | 'azienda' | null>(null);
const [isDialogOpen, setIsDialogOpen] = useState(false);
```

### Struttura Componente
```tsx
<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
  {/* Header con Logo */}
  <div className="py-8 text-center">
    <img src={ediliziaLogo} className="h-12 mx-auto" />
  </div>
  
  {/* Griglia Selezione */}
  <div className="container max-w-5xl mx-auto px-6 py-12">
    <div className="grid md:grid-cols-2 gap-8">
      
      {/* Card Clienti */}
      <Card className="p-8 cursor-pointer hover:shadow-lg transition-all bg-gradient-to-br from-slate-50 to-blue-50 border-2 hover:border-primary">
        <UserCircle className="h-16 w-16 text-primary mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-center mb-3">Sei un Cliente?</h2>
        <p className="text-muted-foreground text-center mb-8">
          Accedi per visualizzare lo stato dei tuoi ordini e richiedere assistenza
        </p>
        <Button className="w-full" size="lg" onClick={() => openLoginDialog('cliente')}>
          Accedi come Cliente
        </Button>
      </Card>
      
      {/* Card Azienda */}
      <Card className="p-8 cursor-pointer hover:shadow-lg transition-all bg-gradient-to-br from-primary to-primary/80 text-white border-0">
        <Building2 className="h-16 w-16 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-center mb-3">Sei un'Azienda?</h2>
        <p className="text-white/80 text-center mb-8">
          Gestisci ordini, clienti e richieste di assistenza
        </p>
        <Button variant="secondary" className="w-full" size="lg" onClick={() => openLoginDialog('azienda')}>
          Accedi come Azienda
        </Button>
      </Card>
      
    </div>
  </div>
  
  {/* Dialog Login */}
  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
    <DialogContent className="sm:max-w-md">
      {/* Form di login con contesto specifico */}
    </DialogContent>
  </Dialog>
</div>
```

---

## Responsive

- **Desktop**: Due card affiancate, grande impatto visivo
- **Tablet**: Due card affiancate piu strette
- **Mobile**: Card impilate verticalmente, full-width

---

## Risultato Atteso

1. Pagina di login spaziosa e ariosa
2. Chiara distinzione tra area clienti e area azienda
3. Esperienza utente guidata - l'utente capisce subito dove cliccare
4. Form di login in modal per mantenere il contesto
5. Design professionale e moderno
