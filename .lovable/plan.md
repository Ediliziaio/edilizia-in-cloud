
# Reset password per l'account Super Admin

## Situazione
- L'account `f.andriciuc@overthemol.com` ha ruolo **customer**, per questo viene reindirizzato a `/cliente`
- L'account Super Admin esistente e' `flo.andriciuc@gmail.com` (user_id: `119fa4f5-59bc-4778-a14c-b3d0c23dc774`)

## Cosa fare
Resettare la password dell'account `flo.andriciuc@gmail.com` a `Password2025!` usando la edge function `reset-customer-password` gia' modificata per supportare password personalizzate.

## Dopo il reset
Potrai accedere come Super Admin con:
- **Email**: `flo.andriciuc@gmail.com`
- **Password**: `Password2025!`

## Dettaglio tecnico
Chiamata alla edge function `reset-customer-password` con parametri:
- `customer_id`: `119fa4f5-59bc-4778-a14c-b3d0c23dc774`
- `new_password`: `Password2025!`
