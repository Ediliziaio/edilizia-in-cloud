
# Piano: Miglioramento Pagina di Login

## Stato Attuale
La pagina di login attuale e funzionale ma minimale:
- Card centrata su sfondo grigio chiaro
- Logo EdiliziaInCloud
- Form con email e password
- Pulsante di accesso

## Miglioramenti Proposti

### 1. Layout Split-Screen (Desktop)
Creare un layout a due colonne:
- **Colonna sinistra (60%)**: Area branding con gradiente, illustrazione/pattern e messaggio di benvenuto
- **Colonna destra (40%)**: Form di login pulito

Su mobile, mostrare solo il form con header contenente il logo.

### 2. Area Branding (Colonna Sinistra)
```
+------------------------------------------+
|                                          |
|     [Logo EdiliziaInCloud grande]        |
|                                          |
|     "Gestisci i tuoi cantieri           |
|      in modo semplice e veloce"          |
|                                          |
|     [Pattern geometrico / Illustrazione] |
|                                          |
|     • Ordini sempre sotto controllo      |
|     • Clienti connessi in tempo reale    |
|     • Assistenza integrata               |
|                                          |
+------------------------------------------+
```

- Sfondo con gradiente blu (primary color)
- Pattern geometrico sottile o forme astratte
- Testo bianco con messaggi chiave del prodotto
- Lista di feature/benefit

### 3. Form di Login Migliorato (Colonna Destra)
```
+----------------------------------+
|                                  |
|     Bentornato!                  |
|     Accedi al tuo account        |
|                                  |
|     [Email input con icona]      |
|                                  |
|     [Password input con icona]   |
|     [Toggle mostra/nascondi]     |
|                                  |
|     [Accedi - button primario]   |
|                                  |
|     ----------------------------  |
|     Hai problemi di accesso?     |
|     Contatta il tuo              |
|     amministratore               |
|                                  |
+----------------------------------+
```

Miglioramenti al form:
- Icone nei campi input (Mail, Lock)
- Toggle per mostrare/nascondere password (Eye/EyeOff)
- Testo di aiuto per problemi di accesso
- Animazioni subtle su focus

### 4. Responsive Design
- **Desktop (>1024px)**: Layout split-screen
- **Tablet (768-1024px)**: Branding ridotto, form piu largo
- **Mobile (<768px)**: Solo form con logo in header compatto

### 5. Micro-interazioni
- Transizione smooth sul pulsante hover
- Focus ring colorato sugli input
- Loading spinner durante l'accesso (gia presente)
- Shake animation su errore (opzionale)

---

## Dettagli Tecnici

### Struttura Componente
```tsx
<div className="min-h-screen flex">
  {/* Branding Panel - hidden on mobile */}
  <div className="hidden lg:flex lg:w-3/5 bg-gradient-to-br from-primary to-primary/80 ...">
    <div className="flex flex-col justify-center p-12">
      <img src={ediliziaLogo} className="h-16 mb-8" />
      <h1 className="text-4xl font-bold text-white mb-4">
        Gestisci i tuoi cantieri in modo semplice
      </h1>
      <ul className="space-y-3 text-white/90">
        <li>✓ Ordini sempre sotto controllo</li>
        <li>✓ Clienti connessi in tempo reale</li>
        <li>✓ Assistenza integrata</li>
      </ul>
    </div>
  </div>
  
  {/* Login Form Panel */}
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="w-full max-w-md">
      {/* Mobile logo */}
      <div className="lg:hidden mb-8 text-center">
        <img src={ediliziaLogo} className="h-12 mx-auto" />
      </div>
      
      <h2 className="text-2xl font-bold mb-2">Bentornato!</h2>
      <p className="text-muted-foreground mb-8">
        Accedi al tuo account per continuare
      </p>
      
      <form>
        {/* Input con icone */}
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10" ... />
        </div>
        
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 pr-10" type={showPassword ? "text" : "password"} />
          <button onClick={togglePassword}>
            {showPassword ? <EyeOff /> : <Eye />}
          </button>
        </div>
        
        <Button className="w-full">Accedi</Button>
      </form>
      
      <p className="text-center text-sm text-muted-foreground mt-6">
        Problemi di accesso? Contatta il tuo amministratore
      </p>
    </div>
  </div>
</div>
```

### Colori Gradiente
Utilizzo dei colori primary gia definiti nel design system:
- `from-primary` (blu 217 91% 60%)
- `to-primary/80` (blu con opacita)

---

## File da Modificare

| File | Azione |
|------|--------|
| `src/components/auth/LoginForm.tsx` | Riscrivere con nuovo layout |

---

## Risultato Atteso
- Pagina di login professionale e moderna
- Branding forte del prodotto EdiliziaInCloud
- Esperienza utente migliorata con feedback visivo
- Completamente responsive
- Mantiene il design minimal e pulito richiesto
