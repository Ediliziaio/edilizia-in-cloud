// AUTO-GENERATO da /tmp/convert_to_builder.mjs — 58 email di sistema (copy riscritti utente).
// Convertite al modello builder: contenuto centrale + {{variabili}}. NON modificare a mano.
// File PURO (nessun import) per essere consumabile sia da Deno che da Vite senza
// problemi di estensione. Il tipo combacia con TemplateMeta di placeholders.ts.
/* eslint-disable */
export const SYSTEM_EMAIL_META: Record<string, {
  label: string; description: string; category: string; iconName: string;
  placeholders: { key: string; label: string; example: string; required: boolean; category: string }[];
  mockProps: Record<string, string>;
}> = {
  "welcome": {
    "label": "Benvenuto azienda",
    "description": "Un super_admin crea una nuova azienda · Nuovo admin azienda",
    "category": "onboarding",
    "iconName": "UserPlus",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.role_label",
        "label": "Ruolo",
        "example": "Amministratore",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "user.role_label": "Amministratore",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "terms_accepted": {
    "label": "Documenti accettati",
    "description": "Subito dopo il benvenuto, stesso admin · Admin azienda",
    "category": "onboarding",
    "iconName": "UserPlus",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "event.date",
        "label": "Data",
        "example": "24/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "event.time",
        "label": "Ora",
        "example": "14:32",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      },
      {
        "key": "link_url_2",
        "label": "Link / bottone #2",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      },
      {
        "key": "link_url_3",
        "label": "Link / bottone #3",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      },
      {
        "key": "link_url_4",
        "label": "Link / bottone #4",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      },
      {
        "key": "link_url_5",
        "label": "Link / bottone #5",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "event.date": "24/06/2026",
      "event.time": "14:32",
      "link_url_1": "https://app.ediliziaincloud.com/…",
      "link_url_2": "https://app.ediliziaincloud.com/…",
      "link_url_3": "https://app.ediliziaincloud.com/…",
      "link_url_4": "https://app.ediliziaincloud.com/…",
      "link_url_5": "https://app.ediliziaincloud.com/…"
    }
  },
  "staff_access": {
    "label": "Accesso staff",
    "description": "L'admin crea un membro dello staff · Nuovo utente staff",
    "category": "onboarding",
    "iconName": "UserPlus",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "inviter.name",
        "label": "Chi ha invitato",
        "example": "Luca Bianchi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.email",
        "label": "Email utente",
        "example": "marco@azienda.it",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "inviter.name": "Luca Bianchi",
      "user.email": "marco@azienda.it",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "employee_account": {
    "label": "Account dipendente",
    "description": "L'admin crea l'account di un dipendente · Dipendente",
    "category": "onboarding",
    "iconName": "UserPlus",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.email",
        "label": "Email utente",
        "example": "marco@azienda.it",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "user.email": "marco@azienda.it",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "salesperson_account": {
    "label": "Account venditore",
    "description": "L'admin crea l'account di un venditore · Venditore",
    "category": "onboarding",
    "iconName": "UserPlus",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.email",
        "label": "Email utente",
        "example": "marco@azienda.it",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "user.email": "marco@azienda.it",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "password_reset": {
    "label": "Reset password (self-service)",
    "description": "L'utente clicca “password dimenticata” · Utente",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "password_reset_admin": {
    "label": "Reset password (da admin)",
    "description": "Un admin reimposta la password di un utente · Utente target",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      },
      {
        "key": "platform.support_email",
        "label": "Email supporto",
        "example": "assistenza@ediliziaincloud.it",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…",
      "platform.support_email": "assistenza@ediliziaincloud.it"
    }
  },
  "password_changed": {
    "label": "Password cambiata",
    "description": "Notifica di sicurezza dopo un cambio password · Utente",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "event.date",
        "label": "Data",
        "example": "24/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "event.time",
        "label": "Ora",
        "example": "14:32",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "platform.support_email",
        "label": "Email supporto",
        "example": "assistenza@ediliziaincloud.it",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "event.date": "24/06/2026",
      "event.time": "14:32",
      "platform.support_email": "assistenza@ediliziaincloud.it"
    }
  },
  "otp_login": {
    "label": "Codice OTP login (2FA)",
    "description": "Secondo fattore dopo l'inserimento password · Utente con 2FA attiva",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "otp.code",
        "label": "Codice OTP",
        "example": "483920",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "otp.code": "483920"
    }
  },
  "email_change_old": {
    "label": "Email modificata · avviso vecchio indirizzo",
    "description": "Richiesta di cambio email — inviata al VECCHIO indirizzo · Indirizzo email precedente",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.new_email",
        "label": "Nuova email",
        "example": "nuova@azienda.it",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "user.new_email": "nuova@azienda.it",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "email_change_new": {
    "label": "Email modificata · conferma nuovo indirizzo",
    "description": "Richiesta di cambio email — inviata al NUOVO indirizzo · Nuovo indirizzo email",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "twofa_enabled": {
    "label": "Verifica in due passaggi attivata",
    "description": "L'utente attiva la 2FA · Utente",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "platform.support_email",
        "label": "Email supporto",
        "example": "assistenza@ediliziaincloud.it",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "platform.support_email": "assistenza@ediliziaincloud.it"
    }
  },
  "twofa_disabled": {
    "label": "Verifica in due passaggi disattivata",
    "description": "L'utente disattiva la 2FA · Utente",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "new_device_login": {
    "label": "Nuovo accesso da dispositivo sconosciuto",
    "description": "Login da dispositivo/posizione mai visti · Utente",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "device.name",
        "label": "Dispositivo",
        "example": "iPhone · Safari",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "device.location",
        "label": "Posizione",
        "example": "Milano, IT",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "event.date",
        "label": "Data",
        "example": "24/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "event.time",
        "label": "Ora",
        "example": "14:32",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "device.name": "iPhone · Safari",
      "device.location": "Milano, IT",
      "event.date": "24/06/2026",
      "event.time": "14:32",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "account_locked": {
    "label": "Account bloccato (troppi tentativi)",
    "description": "Troppi tentativi di accesso falliti · Utente",
    "category": "account",
    "iconName": "KeyRound",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "user_invited": {
    "label": "Invito admin piattaforma",
    "description": "Un super_admin invita un nuovo admin · Nuovo admin (token 7 giorni)",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "inviter.name",
        "label": "Chi ha invitato",
        "example": "Luca Bianchi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.role_label",
        "label": "Ruolo",
        "example": "Amministratore",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "inviter.name": "Luca Bianchi",
      "user.role_label": "Amministratore",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "accountant_invite": {
    "label": "Invito commercialista",
    "description": "L'azienda invita il proprio commercialista · Commercialista",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "accountant.name",
        "label": "Nome commercialista",
        "example": "Studio Verdi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "inviter.name",
        "label": "Chi ha invitato",
        "example": "Luca Bianchi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "access.level",
        "label": "Livello di accesso",
        "example": "Lettura e scrittura",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "accountant.name": "Studio Verdi",
      "inviter.name": "Luca Bianchi",
      "access.level": "Lettura e scrittura",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "invite_reminder": {
    "label": "Reminder invito",
    "description": "L'utente invitato non ha ancora completato l'accesso · Utente invitato",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "inviter.name",
        "label": "Chi ha invitato",
        "example": "Luca Bianchi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "inviter.name": "Luca Bianchi",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "account_verify": {
    "label": "Conferma email",
    "description": "Registrazione che richiede verifica dell'indirizzo · Utente in attesa di verifica",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "invite_accepted_admin": {
    "label": "Invito accettato (notifica admin)",
    "description": "Un invitato accetta e attiva l'account · Admin che ha invitato",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "user.full_name",
        "label": "Nome completo",
        "example": "Marco Rossi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.role_label",
        "label": "Ruolo",
        "example": "Amministratore",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.full_name": "Marco Rossi",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "user.role_label": "Amministratore",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "role_changed": {
    "label": "Ruolo modificato",
    "description": "Un admin cambia ruolo/permessi a un utente · Utente interessato",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.role_label",
        "label": "Ruolo",
        "example": "Amministratore",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "user.role_label": "Amministratore",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "user_removed": {
    "label": "Utente rimosso dal workspace",
    "description": "Un admin revoca l'accesso a un utente · Utente rimosso",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco"
    }
  },
  "invite_expired": {
    "label": "Invito scaduto",
    "description": "Un invito non accettato supera la scadenza · Utente invitato",
    "category": "inviti",
    "iconName": "Mail",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "inviter.name",
        "label": "Chi ha invitato",
        "example": "Luca Bianchi",
        "required": false,
        "category": "destinatario"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "inviter.name": "Luca Bianchi"
    }
  },
  "setup_incomplete": {
    "label": "Setup incompleto",
    "description": "Account creato ma setup a metà · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "lifecycle_trial_ending": {
    "label": "Trial in scadenza",
    "description": "Il periodo di prova sta per finire · Admin azienda in trial",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "trial.days_left",
        "label": "Giorni rimasti",
        "example": "3",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "stats.orders",
        "label": "Numero commesse",
        "example": "12",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "stats.customers",
        "label": "Numero clienti",
        "example": "8",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "trial.days_left": "3",
      "user.first_name": "Marco",
      "stats.orders": "12",
      "stats.customers": "8",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "lifecycle_payment_failed": {
    "label": "Pagamento fallito (dunning)",
    "description": "Addebito ricorrente non riuscito · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "subscription.amount",
        "label": "Importo abbonamento",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "dunning.attempt",
        "label": "Numero tentativo",
        "example": "1",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "subscription.amount": "€89,00",
      "company.name": "Rossi Costruzioni SRL",
      "dunning.attempt": "1",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "purchase_confirmed": {
    "label": "Abbonamento attivato",
    "description": "Primo pagamento andato a buon fine · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "subscription.amount",
        "label": "Importo abbonamento",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "subscription.renewal_date",
        "label": "Data rinnovo",
        "example": "01/07/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "subscription.amount": "€89,00",
      "subscription.renewal_date": "01/07/2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "payment_received": {
    "label": "Ricevuta di pagamento",
    "description": "Ogni addebito andato a buon fine · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "subscription.amount",
        "label": "Importo abbonamento",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "payment.method",
        "label": "Metodo di pagamento",
        "example": "Visa",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "card.last4",
        "label": "Ultime 4 cifre carta",
        "example": "4242",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "event.date",
        "label": "Data",
        "example": "24/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "subscription.amount": "€89,00",
      "payment.method": "Visa",
      "card.last4": "4242",
      "event.date": "24/06/2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "renewal_upcoming": {
    "label": "Rinnovo imminente",
    "description": "Pochi giorni prima del rinnovo automatico · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "subscription.renewal_date",
        "label": "Data rinnovo",
        "example": "01/07/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "subscription.amount",
        "label": "Importo abbonamento",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "subscription.renewal_date": "01/07/2026",
      "subscription.amount": "€89,00",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "card_expiring": {
    "label": "Carta in scadenza",
    "description": "La carta salvata sta per scadere · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "card.last4",
        "label": "Ultime 4 cifre carta",
        "example": "4242",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "card.last4": "4242",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "trial_expired": {
    "label": "Trial scaduto",
    "description": "Il periodo di prova è terminato senza attivazione · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "plan_changed": {
    "label": "Cambio piano confermato",
    "description": "Upgrade o downgrade del piano · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "partner.new_tier",
        "label": "Nuovo tier",
        "example": "Silver",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "subscription.amount",
        "label": "Importo abbonamento",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "subscription.renewal_date",
        "label": "Data rinnovo",
        "example": "01/07/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "partner.new_tier": "Silver",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "subscription.amount": "€89,00",
      "subscription.renewal_date": "01/07/2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "subscription_cancelled": {
    "label": "Abbonamento cancellato",
    "description": "L'utente cancella l'abbonamento · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "subscription.renewal_date",
        "label": "Data rinnovo",
        "example": "01/07/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "subscription.renewal_date": "01/07/2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "account_suspended": {
    "label": "Account sospeso per mancato pagamento",
    "description": "Fine sequenza dunning senza incasso · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "refund_issued": {
    "label": "Rimborso emesso",
    "description": "Viene emesso un rimborso · Admin azienda",
    "category": "billing",
    "iconName": "CreditCard",
    "placeholders": [
      {
        "key": "payment.amount",
        "label": "Importo",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "payment.method",
        "label": "Metodo di pagamento",
        "example": "Visa",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "card.last4",
        "label": "Ultime 4 cifre carta",
        "example": "4242",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "payment.reference",
        "label": "Riferimento pagamento",
        "example": "EIC-AB12CD34",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "payment.amount": "€89,00",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "payment.method": "Visa",
      "card.last4": "4242",
      "payment.reference": "EIC-AB12CD34"
    }
  },
  "partner_welcome": {
    "label": "Partner · Benvenuto",
    "description": "Un nuovo partner viene attivato · Partner",
    "category": "partner",
    "iconName": "Handshake",
    "placeholders": [
      {
        "key": "user.full_name",
        "label": "Nome completo",
        "example": "Marco Rossi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "partner.tier",
        "label": "Tier partner",
        "example": "Bronze",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "partner.commission",
        "label": "Commissione",
        "example": "20% del piano mensile",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "referral.code",
        "label": "Codice referral",
        "example": "MARCO2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.full_name": "Marco Rossi",
      "partner.tier": "Bronze",
      "partner.commission": "20% del piano mensile",
      "referral.code": "MARCO2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "partner_conversion": {
    "label": "Partner · Nuova conversione",
    "description": "Un'azienda si registra col link del partner · Partner",
    "category": "partner",
    "iconName": "Handshake",
    "placeholders": [
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.full_name",
        "label": "Nome completo",
        "example": "Marco Rossi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "company.name": "Rossi Costruzioni SRL",
      "user.full_name": "Marco Rossi",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "partner_commission": {
    "label": "Partner · Commissioni pronte",
    "description": "Chiusura mensile delle commissioni · Partner",
    "category": "partner",
    "iconName": "Handshake",
    "placeholders": [
      {
        "key": "period.month",
        "label": "Mese",
        "example": "Giugno",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.full_name",
        "label": "Nome completo",
        "example": "Marco Rossi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "commission.amount",
        "label": "Importo commissioni",
        "example": "€340,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "partner.active_companies",
        "label": "Aziende attive",
        "example": "3",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "period.month": "Giugno",
      "user.full_name": "Marco Rossi",
      "commission.amount": "€340,00",
      "partner.active_companies": "3",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "partner_payout": {
    "label": "Partner · Payout approvato",
    "description": "Il pagamento al partner viene approvato · Partner",
    "category": "partner",
    "iconName": "Handshake",
    "placeholders": [
      {
        "key": "payout.amount",
        "label": "Importo payout",
        "example": "€340,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.full_name",
        "label": "Nome completo",
        "example": "Marco Rossi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "payment.reference",
        "label": "Riferimento pagamento",
        "example": "EIC-AB12CD34",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "payout.amount": "€340,00",
      "user.full_name": "Marco Rossi",
      "payment.reference": "EIC-AB12CD34"
    }
  },
  "partner_tier": {
    "label": "Partner · Upgrade tier",
    "description": "Il partner raggiunge un nuovo livello · Partner",
    "category": "partner",
    "iconName": "Handshake",
    "placeholders": [
      {
        "key": "partner.new_tier",
        "label": "Nuovo tier",
        "example": "Silver",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.full_name",
        "label": "Nome completo",
        "example": "Marco Rossi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "partner.multiplier",
        "label": "Moltiplicatore",
        "example": "1,5x",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "partner.new_tier": "Silver",
      "user.full_name": "Marco Rossi",
      "partner.multiplier": "1,5x",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "document_shared": {
    "label": "Documento condiviso",
    "description": "Un utente condivide un documento · Destinatario della condivisione",
    "category": "prodotto",
    "iconName": "Bell",
    "placeholders": [
      {
        "key": "sender.name",
        "label": "Nome mittente",
        "example": "Luca Bianchi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "document.name",
        "label": "Nome documento",
        "example": "Preventivo 2026-014",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "sender.name": "Luca Bianchi",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "document.name": "Preventivo 2026-014",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "task_assigned": {
    "label": "Attività assegnata",
    "description": "Viene assegnato un task a un utente · Utente assegnatario",
    "category": "prodotto",
    "iconName": "Bell",
    "placeholders": [
      {
        "key": "task.name",
        "label": "Nome attività",
        "example": "Sopralluogo cantiere",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "sender.name",
        "label": "Nome mittente",
        "example": "Luca Bianchi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "event.date",
        "label": "Data",
        "example": "24/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "task.name": "Sopralluogo cantiere",
      "user.first_name": "Marco",
      "sender.name": "Luca Bianchi",
      "company.name": "Rossi Costruzioni SRL",
      "event.date": "24/06/2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "report_ready": {
    "label": "Report pronto",
    "description": "Un report richiesto è stato generato · Utente che lo ha richiesto",
    "category": "prodotto",
    "iconName": "Bell",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "document.name",
        "label": "Nome documento",
        "example": "Preventivo 2026-014",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "document.name": "Preventivo 2026-014",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "silvio_approval": {
    "label": "Richiesta di approvazione (Silvio · HITL)",
    "description": "Silvio prepara un'azione che richiede conferma umana · Admin / responsabile",
    "category": "prodotto",
    "iconName": "Bell",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "task.name",
        "label": "Nome attività",
        "example": "Sopralluogo cantiere",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "task.name": "Sopralluogo cantiere",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "sdi_accepted": {
    "label": "Fattura accettata dallo SDI",
    "description": "Lo SDI accetta una fattura elettronica · Admin / amministrazione azienda",
    "category": "fiscale",
    "iconName": "FileText",
    "placeholders": [
      {
        "key": "invoice.number",
        "label": "Numero fattura",
        "example": "FT 2026/128",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "payment.amount",
        "label": "Importo",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "invoice.number": "FT 2026/128",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "payment.amount": "€89,00"
    }
  },
  "sdi_rejected": {
    "label": "Fattura SCARTATA dallo SDI",
    "description": "Lo SDI rifiuta una fattura elettronica · Admin / amministrazione azienda",
    "category": "fiscale",
    "iconName": "FileText",
    "placeholders": [
      {
        "key": "invoice.number",
        "label": "Numero fattura",
        "example": "FT 2026/128",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "sdi.reject_reason",
        "label": "Motivo scarto SDI",
        "example": "Codice destinatario errato",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "invoice.number": "FT 2026/128",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "sdi.reject_reason": "Codice destinatario errato",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "payment_reminder": {
    "label": "Promemoria incasso / sollecito",
    "description": "Una fattura del cliente è in scadenza o scaduta · Cliente dell'azienda (debitore)",
    "category": "fiscale",
    "iconName": "FileText",
    "placeholders": [
      {
        "key": "invoice.number",
        "label": "Numero fattura",
        "example": "FT 2026/128",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "customer.name",
        "label": "Nome cliente",
        "example": "Mario Bianchi",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "payment.amount",
        "label": "Importo",
        "example": "€89,00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "document.expiry_date",
        "label": "Data scadenza",
        "example": "30/06/2026",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "invoice.number": "FT 2026/128",
      "customer.name": "Mario Bianchi",
      "company.name": "Rossi Costruzioni SRL",
      "payment.amount": "€89,00",
      "document.expiry_date": "30/06/2026"
    }
  },
  "document_expiring": {
    "label": "Documento in scadenza (DURC, polizze, certificazioni)",
    "description": "Un documento aziendale sta per scadere · Admin azienda",
    "category": "fiscale",
    "iconName": "FileText",
    "placeholders": [
      {
        "key": "document.type",
        "label": "Tipo documento",
        "example": "DURC",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "document.days_left",
        "label": "Giorni alla scadenza",
        "example": "7",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "document.expiry_date",
        "label": "Data scadenza",
        "example": "30/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "document.type": "DURC",
      "document.days_left": "7",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "document.expiry_date": "30/06/2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "site_inspection": {
    "label": "Sopralluogo programmato",
    "description": "Viene fissato un sopralluogo · Responsabile / tecnico assegnato",
    "category": "fiscale",
    "iconName": "FileText",
    "placeholders": [
      {
        "key": "inspection.date",
        "label": "Data sopralluogo",
        "example": "26/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "inspection.time",
        "label": "Ora sopralluogo",
        "example": "09:00",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "site.address",
        "label": "Indirizzo cantiere",
        "example": "Via Roma 12, Milano",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "inspection.date": "26/06/2026",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "inspection.time": "09:00",
      "site.address": "Via Roma 12, Milano",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "lifecycle_monthly_summary": {
    "label": "Lifecycle · Riepilogo mensile",
    "description": "Inizio mese, riepilogo del mese precedente · Admin azienda attiva",
    "category": "lifecycle",
    "iconName": "TrendingUp",
    "placeholders": [
      {
        "key": "period.month",
        "label": "Mese",
        "example": "Giugno",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "stats.orders",
        "label": "Numero commesse",
        "example": "12",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "stats.revenue",
        "label": "Fatturato del mese",
        "example": "€42.300",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "stats.hours_saved",
        "label": "Ore risparmiate",
        "example": "26",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "period.month": "Giugno",
      "user.first_name": "Marco",
      "stats.orders": "12",
      "stats.revenue": "€42.300",
      "stats.hours_saved": "26",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "lifecycle_d3_no_activation": {
    "label": "Lifecycle · D+3 non attivato",
    "description": "3 giorni dopo la registrazione, setup fermo · Admin azienda",
    "category": "lifecycle",
    "iconName": "TrendingUp",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "lifecycle_d7_features": {
    "label": "Lifecycle · D+7 funzioni",
    "description": "7 giorni dopo la registrazione · Admin azienda",
    "category": "lifecycle",
    "iconName": "TrendingUp",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "winback": {
    "label": "Win-back inattività",
    "description": "L'utente non accede da molti giorni · Admin azienda inattiva",
    "category": "lifecycle",
    "iconName": "TrendingUp",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "user.inactive_days",
        "label": "Giorni di inattività",
        "example": "30",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "user.inactive_days": "30",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "feature_announcement": {
    "label": "Annuncio nuova funzionalità",
    "description": "Rilascio di una funzione rilevante · Tutti gli utenti attivi",
    "category": "lifecycle",
    "iconName": "TrendingUp",
    "placeholders": [
      {
        "key": "feature.name",
        "label": "Nome funzionalità",
        "example": "Render AI",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "feature.name": "Render AI",
      "user.first_name": "Marco",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "nps_feedback": {
    "label": "Richiesta feedback / NPS",
    "description": "Dopo un periodo d'uso, per misurare la soddisfazione · Admin azienda attiva",
    "category": "lifecycle",
    "iconName": "TrendingUp",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "maintenance_scheduled": {
    "label": "Manutenzione programmata",
    "description": "Prima di un intervento pianificato · Tutti gli utenti",
    "category": "sistema",
    "iconName": "ShieldCheck",
    "placeholders": [
      {
        "key": "maintenance.date",
        "label": "Data manutenzione",
        "example": "28/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "maintenance.window",
        "label": "Finestra manutenzione",
        "example": "02:00–04:00",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "maintenance.date": "28/06/2026",
      "user.first_name": "Marco",
      "maintenance.window": "02:00–04:00"
    }
  },
  "terms_update": {
    "label": "Aggiornamento Termini / Privacy",
    "description": "Modifica ai documenti legali · Tutti gli utenti",
    "category": "sistema",
    "iconName": "ShieldCheck",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "event.date",
        "label": "Data",
        "example": "24/06/2026",
        "required": false,
        "category": "contenuto"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "event.date": "24/06/2026",
      "link_url_1": "https://app.ediliziaincloud.com/…"
    }
  },
  "gdpr_export": {
    "label": "Export dati pronto (GDPR)",
    "description": "Un export dati richiesto è pronto · Admin azienda",
    "category": "sistema",
    "iconName": "ShieldCheck",
    "placeholders": [
      {
        "key": "user.first_name",
        "label": "Nome destinatario",
        "example": "Marco",
        "required": false,
        "category": "destinatario"
      },
      {
        "key": "company.name",
        "label": "Nome azienda",
        "example": "Rossi Costruzioni SRL",
        "required": false,
        "category": "azienda"
      },
      {
        "key": "link_url_1",
        "label": "Link / bottone #1",
        "example": "https://app.ediliziaincloud.com/…",
        "required": true,
        "category": "link"
      },
      {
        "key": "trial.days_left",
        "label": "Giorni rimasti",
        "example": "3",
        "required": false,
        "category": "contenuto"
      }
    ],
    "mockProps": {
      "companyName": "Rossi Costruzioni SRL",
      "user.first_name": "Marco",
      "company.name": "Rossi Costruzioni SRL",
      "link_url_1": "https://app.ediliziaincloud.com/…",
      "trial.days_left": "3"
    }
  }
};
