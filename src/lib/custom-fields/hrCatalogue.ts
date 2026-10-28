/** Native recruitment form configuration, never candidate answers or assessment results. */
export const RECRUITMENT_FIELDS = [
  { key: "nome", label: "Nome", type: "text", state: "obbligatorio" },
  { key: "cognome", label: "Cognome", type: "text", state: "facoltativo" },
  { key: "telefono", label: "Telefono", type: "phone", state: "obbligatorio" },
  { key: "email", label: "Email", type: "email", state: "facoltativo" },
  { key: "citta", label: "Città", type: "text", state: "facoltativo" },
  { key: "ruolo", label: "Ruolo", type: "select", state: "facoltativo" },
  { key: "messaggio", label: "Presentazione", type: "textarea", state: "facoltativo" },
  { key: "cv", label: "Curriculum", type: "file", state: "facoltativo" },
] as const;
