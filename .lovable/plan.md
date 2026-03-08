

## Configurazione STRIPE_SECRET_KEY

La chiave `sk_live_51M2sqXLkeFsw7yTq...` è una chiave standard valida. Per configurarla correttamente nei secrets del progetto, utilizzerò l'integrazione Stripe nativa di Lovable.

### Piano

1. **Abilitare l'integrazione Stripe** tramite il tool dedicato, che chiederà di inserire la chiave segreta
2. Questo renderà la chiave disponibile come `STRIPE_SECRET_KEY` nelle backend functions

Una volta configurata, tutte le funzionalità Stripe saranno operative:
- Acquisto pacchetti crediti email
- Auto top-up automatico
- Gestione abbonamenti

