import { EMAIL_PREFIX_TYPES } from "./automationEmail.ts";

/** Synthetic examples only: never reads contact data or produces actionable links. */
export function automationEmailSampleValues(now = new Date()): Record<string, string> {
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const displayDate = now.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  const records: Record<string, Record<string, string>> = {
    contact: {
      first_name: "Marco", last_name: "Rossi", full_name: "Marco Rossi",
      email: "marco@example.invalid", phone: "+39 000 0000000", city: "Roma", province: "RM",
      region: "Lazio", address: "Via Esempio 1", postal_code: "00100", company_name: "Impresa di esempio",
      source: "manual", tags: "Cliente, Esempio", created_at: date, date_of_birth: "1980-01-01",
    },
    opportunity: { name: "Ristrutturazione di esempio", value: "15000", status: "open", source: "manual", expected_close_date: date, loss_reason: "Motivo di esempio" },
    appointment: {
      title: "Sopralluogo di esempio", appointment_date: date, appointment_time: "09:30", appointment_end_time: "10:00",
      formatted_address: "Via Esempio 1, Roma", meeting_url: "https://example.invalid/call", status: "confermato",
      giorno: now.toLocaleDateString("it-IT", { weekday: "long", timeZone: "Europe/Rome" }), data: displayDate,
      ora: "09:30", ora_fine: "10:00", titolo: "Sopralluogo di esempio", luogo: "Via Esempio 1, Roma",
      link_riprogramma: "https://example.invalid/appuntamento", link_sposta: "https://example.invalid/appuntamento", link_call: "https://example.invalid/call",
    },
    order: { order_code: "COM-ESEMPIO", description: "Ristrutturazione di esempio", total_amount: "15000", deposit_amount: "3000", balance_amount: "12000", expected_date: date, work_start_date: date, work_end_date: date },
    quote: { quote_number: "PREV-ESEMPIO", total: "15000", client_name: "Marco Rossi", client_email: "marco@example.invalid", expires_at: date },
    invoice: { invoice_number: "FT-ESEMPIO", total: "15000", tax_amount: "1500", client_company_name: "Impresa di esempio", client_email: "marco@example.invalid", due_date: date },
    task: { title: "Richiamare il cliente (esempio)", priority: "medium", due_date: date, status: "pending" },
    ticket: { subject: "Richiesta di esempio", priority: "medium", category: "assistenza", status: "open" },
  };
  const values: Record<string, string> = {};
  for (const [prefix, type] of Object.entries(EMAIL_PREFIX_TYPES)) {
    for (const [field, value] of Object.entries(records[type] ?? {})) values[`${prefix}.${field}`] = value;
  }
  return { ...values,
    nome: "Marco", cognome: "Rossi", nome_completo: "Marco Rossi", azienda: "Impresa di esempio",
    "azienda.name": "Impresa di esempio", "azienda.nome": "Impresa di esempio",
    "azienda.email": "azienda@example.invalid", "azienda.phone": "+39 000 0000000", "azienda.telefono": "+39 000 0000000",
    "azienda.iban": "IBAN DI ESEMPIO", "azienda.intestatario_conto": "Impresa di esempio",
    "system.today": displayDate, "system.company_name": "Impresa di esempio",
    "cliente.nome": "Marco", "cliente.cognome": "Rossi", "cliente.nome_completo": "Marco Rossi", "cliente.email": "marco@example.invalid",
    "commessa.codice": "COM-ESEMPIO", "commessa.descrizione": "Ristrutturazione di esempio", "commessa.fase": "In lavorazione",
    "commessa.importo": "15.000,00 €", "commessa.acconto": "3.000,00 €", "commessa.saldo": "12.000,00 €",
    "commessa.data_installazione": displayDate, "commessa.indirizzo": "Via Esempio 1, Roma",
    unsubscribe_url: "https://example.invalid/disiscrizione", giorni_rimasti: "5", data_scadenza: displayDate,
  };
}
