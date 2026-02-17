
# Fix Logo nella Sidebar: rimuovere cerchio e nome azienda

## Problema
1. Il logo aziendale viene mostrato dentro un componente `Avatar` che applica `rounded-full`, tagliandolo in un cerchio -- non adatto per loghi rettangolari
2. Accanto al logo viene mostrato il nome dell'azienda (es. "Domus Group S.r.l.") che l'utente vuole rimuovere

## Soluzione
Sostituire il componente `Avatar` con un semplice tag `img` con bordi arrotondati (non circolari) e rimuovere lo `span` con il nome dell'azienda. Applicare la modifica in tutti i layout dove appare.

## Dettaglio tecnico

### File da modificare

**1. `src/components/layouts/CompanyLayout.tsx` (righe 129-143)**

Sostituire:
- `Avatar` + `AvatarImage` con un semplice `<img>` con classe `h-8 max-h-8 object-contain` (senza rounded-full)
- Rimuovere lo `<span>` con il nome dell'azienda

Prima:
```
<Avatar className="h-8 w-8">
  <AvatarImage src={...} />
  ...
</Avatar>
<span>nome azienda</span>
```

Dopo:
```
<img src={logo_url} alt={name} className="h-8 max-h-8 object-contain" />
```

**2. `src/components/layouts/CustomerLayout.tsx` (righe 36-49)**

Stessa modifica: sostituire `Avatar` con `img` e rimuovere lo `span` con il nome.

### Risultato
- Il logo viene mostrato nella sua forma originale (rettangolare, quadrato, ecc.) senza essere ritagliato in un cerchio
- Il nome dell'azienda non appare piu accanto al logo nella sidebar/header
