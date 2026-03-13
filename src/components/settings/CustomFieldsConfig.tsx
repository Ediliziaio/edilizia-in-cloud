import { useState, useMemo, useEffect } from "react";
import { TablePagination } from "@/components/ui/table-pagination";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Search, Copy, FolderPlus, Lock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/* ───── types ───── */
interface UnifiedField {
  id: string;
  name: string;
  object: string;
  folder: string;
  folderColor: string;
  uniqueKey: string;
  createdAt: string;
  isSystem: boolean;
  fieldType?: string;
  options?: string[];
  section?: string;
}

/* ───── folder colors & labels ───── */
const FOLDER_COLORS: Record<string, string> = {
  contact: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  general_info: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  additional_info: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  opportunity_details: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  appointment: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  order: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  invoice: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  quote: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  ticket: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  task: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  employee: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  warehouse: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  user: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
  salesperson: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  external_team: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  supplier: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
const FOLDER_LABELS: Record<string, string> = {
  contact: "Contatto",
  general_info: "General Info",
  additional_info: "Additional Info",
  opportunity_details: "Opportunità",
  appointment: "Appuntamento",
  order: "Ordine",
  invoice: "Fattura",
  quote: "Preventivo",
  ticket: "Ticket",
  task: "Task",
  employee: "Dipendente",
  warehouse: "Magazzino",
  user: "Utente",
  salesperson: "Venditore",
  external_team: "Squadra Esterna",
  supplier: "Fornitore",
};

/* ───── helper to build system fields ───── */
function sysField(id: string, name: string, object: string, folder: string, uniqueKey: string): UnifiedField {
  return { id, name, object, folder, folderColor: FOLDER_COLORS[folder] || FOLDER_COLORS.additional_info, uniqueKey, createdAt: "2024-01-01", isSystem: true };
}

/* ───── built-in fields ───── */
const BUILTIN_FIELDS: UnifiedField[] = [
  // ══════════════════════════════════════
  // ── Contatto ──
  // ══════════════════════════════════════
  sysField("sys_c_id", "ID Contatto", "Contatto", "contact", "{{ contact.id }}"),
  sysField("sys_first_name", "First Name", "Contatto", "contact", "{{ contact.first_name }}"),
  sysField("sys_last_name", "Last Name", "Contatto", "contact", "{{ contact.last_name }}"),
  sysField("sys_full_name", "Full Name", "Contatto", "contact", "{{ contact.full_name }}"),
  sysField("sys_email", "Email", "Contatto", "contact", "{{ contact.email }}"),
  sysField("sys_phone", "Phone", "Contatto", "contact", "{{ contact.phone }}"),
  sysField("sys_dob", "Date Of Birth", "Contatto", "contact", "{{ contact.date_of_birth }}"),
  sysField("sys_source", "Contact Source", "Contatto", "contact", "{{ contact.source }}"),
  sysField("sys_type", "Contact Type", "Contatto", "contact", "{{ contact.type }}"),
  sysField("sys_contact_type", "Tipo Contatto (B2B/B2C)", "Contatto", "contact", "{{ contact.contact_type }}"),
  sysField("sys_assigned_to", "Assigned To", "Contatto", "contact", "{{ contact.assigned_to }}"),
  sysField("sys_c_fiscal_code", "Codice Fiscale", "Contatto", "contact", "{{ contact.fiscal_code }}"),
  sysField("sys_c_vat_number", "Partita IVA", "Contatto", "contact", "{{ contact.vat_number }}"),
  sysField("sys_c_tags", "Tags", "Contatto", "contact", "{{ contact.tags }}"),
  sysField("sys_c_notes", "Note", "Contatto", "contact", "{{ contact.notes }}"),
  sysField("sys_c_lead_score", "Lead Score", "Contatto", "contact", "{{ contact.lead_score }}"),
  sysField("sys_c_icp_tier", "ICP Tier", "Contatto", "contact", "{{ contact.icp_tier }}"),
  sysField("sys_c_score", "Score", "Contatto", "contact", "{{ contact.score }}"),
  sysField("sys_c_pref_lang", "Lingua Preferita", "Contatto", "contact", "{{ contact.preferred_language }}"),
  sysField("sys_c_pref_channel", "Canale Preferito", "Contatto", "contact", "{{ contact.preferred_channel }}"),
  sysField("sys_c_optout_email", "Opt-out Email", "Contatto", "contact", "{{ contact.optout_email }}"),
  sysField("sys_c_optout_whatsapp", "Opt-out WhatsApp", "Contatto", "contact", "{{ contact.optout_whatsapp }}"),
  sysField("sys_c_optout_sms", "Opt-out SMS", "Contatto", "contact", "{{ contact.optout_sms }}"),
  sysField("sys_c_optout_call", "Opt-out Chiamata", "Contatto", "contact", "{{ contact.optout_call }}"),
  sysField("sys_c_unsubscribed", "Disiscritto", "Contatto", "contact", "{{ contact.unsubscribed }}"),
  sysField("sys_c_last_activity", "Ultima Attività", "Contatto", "contact", "{{ contact.last_activity_at }}"),
  // General Info
  sysField("sys_company_name", "Business Name", "Contatto", "general_info", "{{ contact.company_name }}"),
  sysField("sys_address", "Street Address", "Contatto", "general_info", "{{ contact.address }}"),
  sysField("sys_city", "City", "Contatto", "general_info", "{{ contact.city }}"),
  sysField("sys_province", "State", "Contatto", "general_info", "{{ contact.province }}"),
  sysField("sys_postal_code", "Postal Code", "Contatto", "general_info", "{{ contact.postal_code }}"),
  sysField("sys_country", "Country", "Contatto", "general_info", "{{ contact.country }}"),
  sysField("sys_website", "Website", "Contatto", "general_info", "{{ contact.website }}"),

  // ══════════════════════════════════════
  // ── Opportunità ──
  // ══════════════════════════════════════
  sysField("sys_opp_id", "ID Opportunità", "Opportunità", "opportunity_details", "{{ opportunity.id }}"),
  sysField("sys_opp_name", "Opportunity Name", "Opportunità", "opportunity_details", "{{ opportunity.name }}"),
  sysField("sys_opp_pipeline", "Pipeline", "Opportunità", "opportunity_details", "{{ opportunity.pipeline_id }}"),
  sysField("sys_opp_stage", "Stage", "Opportunità", "opportunity_details", "{{ opportunity.stage_id }}"),
  sysField("sys_opp_status", "Status", "Opportunità", "opportunity_details", "{{ opportunity.status }}"),
  sysField("sys_opp_value", "Lead Value", "Opportunità", "opportunity_details", "{{ opportunity.value }}"),
  sysField("sys_opp_owner", "Opportunity Owner", "Opportunità", "opportunity_details", "{{ opportunity.assigned_to }}"),
  sysField("sys_opp_source", "Opportunity Source", "Opportunità", "opportunity_details", "{{ opportunity.source }}"),
  sysField("sys_opp_lost_reason", "Lost Reason", "Opportunità", "opportunity_details", "{{ opportunity.loss_reason }}"),
  sysField("sys_opp_expected_close", "Expected Close Date", "Opportunità", "opportunity_details", "{{ opportunity.expected_close_date }}"),
  sysField("sys_opp_contact_id", "Contact ID", "Opportunità", "opportunity_details", "{{ opportunity.contact_id }}"),
  sysField("sys_opp_company_name", "Nome Azienda", "Opportunità", "opportunity_details", "{{ opportunity.company_name }}"),
  sysField("sys_opp_notes", "Note", "Opportunità", "opportunity_details", "{{ opportunity.notes }}"),
  sysField("sys_opp_tags", "Tags", "Opportunità", "opportunity_details", "{{ opportunity.tags }}"),
  sysField("sys_opp_probability", "Probabilità", "Opportunità", "opportunity_details", "{{ opportunity.probability }}"),
  sysField("sys_opp_next_action", "Prossima Azione", "Opportunità", "opportunity_details", "{{ opportunity.next_action }}"),
  sysField("sys_opp_next_action_date", "Data Prossima Azione", "Opportunità", "opportunity_details", "{{ opportunity.next_action_date }}"),
  sysField("sys_opp_loss_notes", "Note Perdita", "Opportunità", "opportunity_details", "{{ opportunity.loss_notes }}"),
  sysField("sys_opp_lost_reason_cat", "Categoria Motivo Perdita", "Opportunità", "opportunity_details", "{{ opportunity.lost_reason_category }}"),
  sysField("sys_opp_competitor", "Competitor Vincente", "Opportunità", "opportunity_details", "{{ opportunity.competitor_won }}"),

  // ══════════════════════════════════════
  // ── Appuntamento ──
  // ══════════════════════════════════════
  sysField("sys_apt_id", "ID Appuntamento", "Appuntamento", "appointment", "{{ appointment.id }}"),
  sysField("sys_apt_title", "Titolo", "Appuntamento", "appointment", "{{ appointment.title }}"),
  sysField("sys_apt_date", "Data", "Appuntamento", "appointment", "{{ appointment.appointment_date }}"),
  sysField("sys_apt_time", "Ora", "Appuntamento", "appointment", "{{ appointment.appointment_time }}"),
  sysField("sys_apt_end_time", "Ora fine", "Appuntamento", "appointment", "{{ appointment.appointment_end_time }}"),
  sysField("sys_apt_status", "Stato", "Appuntamento", "appointment", "{{ appointment.status }}"),
  sysField("sys_apt_type", "Tipo", "Appuntamento", "appointment", "{{ appointment.appointment_type }}"),
  sysField("sys_apt_address", "Indirizzo", "Appuntamento", "appointment", "{{ appointment.formatted_address }}"),
  sysField("sys_apt_notes", "Note interne", "Appuntamento", "appointment", "{{ appointment.internal_notes }}"),
  sysField("sys_apt_contact", "ID Contatto", "Appuntamento", "appointment", "{{ appointment.contact_id }}"),
  sysField("sys_apt_assigned", "Assegnato a", "Appuntamento", "appointment", "{{ appointment.assigned_to }}"),
  sysField("sys_apt_description", "Descrizione", "Appuntamento", "appointment", "{{ appointment.description }}"),
  sysField("sys_apt_order_id", "ID Ordine", "Appuntamento", "appointment", "{{ appointment.order_id }}"),
  sysField("sys_apt_completed", "Completato", "Appuntamento", "appointment", "{{ appointment.is_completed }}"),
  sysField("sys_apt_reminder", "Promemoria (min)", "Appuntamento", "appointment", "{{ appointment.reminder_minutes }}"),

  // ══════════════════════════════════════
  // ── Ordine ──
  // ══════════════════════════════════════
  sysField("sys_ord_id", "ID Ordine", "Ordine", "order", "{{ order.id }}"),
  sysField("sys_ord_code", "Codice Ordine", "Ordine", "order", "{{ order.order_code }}"),
  sysField("sys_ord_total", "Importo Totale", "Ordine", "order", "{{ order.total_amount }}"),
  sysField("sys_ord_desc", "Descrizione", "Ordine", "order", "{{ order.description }}"),
  sysField("sys_ord_expected", "Data Prevista", "Ordine", "order", "{{ order.expected_date }}"),
  sysField("sys_ord_status", "Stato (ID)", "Ordine", "order", "{{ order.current_status_id }}"),
  sysField("sys_ord_customer", "ID Cliente", "Ordine", "order", "{{ order.customer_id }}"),
  sysField("sys_ord_assigned", "Assegnato a", "Ordine", "order", "{{ order.assigned_to }}"),
  sysField("sys_ord_deposit", "Acconto", "Ordine", "order", "{{ order.deposit_amount }}"),
  sysField("sys_ord_balance", "Saldo", "Ordine", "order", "{{ order.balance_amount }}"),
  sysField("sys_ord_work_start", "Data Inizio Lavori", "Ordine", "order", "{{ order.work_start_date }}"),
  sysField("sys_ord_internal_notes", "Note Interne", "Ordine", "order", "{{ order.internal_notes }}"),
  sysField("sys_ord_payment_type", "Tipo Pagamento", "Ordine", "order", "{{ order.payment_type }}"),
  sysField("sys_ord_vat_rate", "Aliquota IVA", "Ordine", "order", "{{ order.vat_rate }}"),
  sysField("sys_ord_financing_cost", "Costo Finanziamento", "Ordine", "order", "{{ order.financing_cost }}"),
  sysField("sys_ord_financing_amount", "Importo Finanziamento", "Ordine", "order", "{{ order.financing_amount }}"),
  sysField("sys_ord_warehouse_arrival", "Arrivo Magazzino", "Ordine", "order", "{{ order.warehouse_arrival_date }}"),
  sysField("sys_ord_work_end", "Data Fine Lavori", "Ordine", "order", "{{ order.work_end_date }}"),
  sysField("sys_ord_deposit_2", "Secondo Acconto", "Ordine", "order", "{{ order.deposit_2_amount }}"),
  sysField("sys_ord_deposit_paid", "Acconto Pagato", "Ordine", "order", "{{ order.deposit_paid }}"),
  sysField("sys_ord_deposit_2_paid", "Secondo Acconto Pagato", "Ordine", "order", "{{ order.deposit_2_paid }}"),
  sysField("sys_ord_balance_paid", "Saldo Pagato", "Ordine", "order", "{{ order.balance_paid }}"),
  sysField("sys_ord_deposit_paid_date", "Data Pagamento Acconto", "Ordine", "order", "{{ order.deposit_paid_date }}"),
  sysField("sys_ord_deposit_2_paid_date", "Data Pagamento 2° Acconto", "Ordine", "order", "{{ order.deposit_2_paid_date }}"),
  sysField("sys_ord_balance_paid_date", "Data Pagamento Saldo", "Ordine", "order", "{{ order.balance_paid_date }}"),
  sysField("sys_ord_building_bonus", "Bonus Edilizio", "Ordine", "order", "{{ order.has_building_bonus }}"),
  sysField("sys_ord_financing_paid", "Finanziamento Pagato", "Ordine", "order", "{{ order.financing_paid }}"),

  // ══════════════════════════════════════
  // ── Fattura ──
  // ══════════════════════════════════════
  sysField("sys_inv_id", "ID Fattura", "Fattura", "invoice", "{{ invoice.id }}"),
  sysField("sys_inv_number", "Numero Fattura", "Fattura", "invoice", "{{ invoice.invoice_number }}"),
  sysField("sys_inv_total", "Totale", "Fattura", "invoice", "{{ invoice.total }}"),
  sysField("sys_inv_subtotal", "Subtotale", "Fattura", "invoice", "{{ invoice.subtotal }}"),
  sysField("sys_inv_tax", "IVA", "Fattura", "invoice", "{{ invoice.tax_amount }}"),
  sysField("sys_inv_status", "Stato", "Fattura", "invoice", "{{ invoice.status }}"),
  sysField("sys_inv_due", "Data Scadenza", "Fattura", "invoice", "{{ invoice.due_date }}"),
  sysField("sys_inv_issue", "Data Emissione", "Fattura", "invoice", "{{ invoice.issue_date }}"),
  sysField("sys_inv_paid", "Importo Pagato", "Fattura", "invoice", "{{ invoice.paid_amount }}"),
  sysField("sys_inv_client_name", "Nome Cliente", "Fattura", "invoice", "{{ invoice.client_company_name }}"),
  sysField("sys_inv_client_email", "Email Cliente", "Fattura", "invoice", "{{ invoice.client_email }}"),
  sysField("sys_inv_client_vat", "P.IVA Cliente", "Fattura", "invoice", "{{ invoice.client_vat_number }}"),
  sysField("sys_inv_payment", "Metodo Pagamento", "Fattura", "invoice", "{{ invoice.payment_method }}"),
  sysField("sys_inv_doc_type", "Tipo Documento", "Fattura", "invoice", "{{ invoice.document_type }}"),
  sysField("sys_inv_year", "Anno Fattura", "Fattura", "invoice", "{{ invoice.invoice_year }}"),
  sysField("sys_inv_client_fc", "CF Cliente", "Fattura", "invoice", "{{ invoice.client_fiscal_code }}"),
  sysField("sys_inv_client_pec", "PEC Cliente", "Fattura", "invoice", "{{ invoice.client_pec }}"),
  sysField("sys_inv_client_sdi", "Codice SDI Cliente", "Fattura", "invoice", "{{ invoice.client_sdi_code }}"),
  sysField("sys_inv_client_addr", "Indirizzo Cliente", "Fattura", "invoice", "{{ invoice.client_address }}"),
  sysField("sys_inv_client_city", "Città Cliente", "Fattura", "invoice", "{{ invoice.client_city }}"),
  sysField("sys_inv_client_zip", "CAP Cliente", "Fattura", "invoice", "{{ invoice.client_zip }}"),
  sysField("sys_inv_client_country", "Nazione Cliente", "Fattura", "invoice", "{{ invoice.client_country }}"),
  sysField("sys_inv_pay_terms", "Condizioni Pagamento", "Fattura", "invoice", "{{ invoice.payment_terms }}"),
  sysField("sys_inv_pay_days", "Giorni Pagamento", "Fattura", "invoice", "{{ invoice.payment_days }}"),
  sysField("sys_inv_iban", "IBAN Banca", "Fattura", "invoice", "{{ invoice.bank_iban }}"),
  sysField("sys_inv_notes", "Note", "Fattura", "invoice", "{{ invoice.notes }}"),
  sysField("sys_inv_pdf", "URL PDF", "Fattura", "invoice", "{{ invoice.pdf_url }}"),
  sysField("sys_inv_order_id", "ID Ordine", "Fattura", "invoice", "{{ invoice.order_id }}"),
  sysField("sys_inv_quote_id", "ID Preventivo", "Fattura", "invoice", "{{ invoice.quote_id }}"),
  sysField("sys_inv_client_id", "ID Anagrafica", "Fattura", "invoice", "{{ invoice.client_id }}"),

  // ══════════════════════════════════════
  // ── Preventivo ──
  // ══════════════════════════════════════
  sysField("sys_qt_id", "ID Preventivo", "Preventivo", "quote", "{{ quote.id }}"),
  sysField("sys_qt_number", "Numero Preventivo", "Preventivo", "quote", "{{ quote.quote_number }}"),
  sysField("sys_qt_title", "Titolo", "Preventivo", "quote", "{{ quote.title }}"),
  sysField("sys_qt_total", "Totale", "Preventivo", "quote", "{{ quote.total }}"),
  sysField("sys_qt_status", "Stato", "Preventivo", "quote", "{{ quote.status }}"),
  sysField("sys_qt_client_name", "Nome Cliente", "Preventivo", "quote", "{{ quote.client_name }}"),
  sysField("sys_qt_client_email", "Email Cliente", "Preventivo", "quote", "{{ quote.client_email }}"),
  sysField("sys_qt_client_phone", "Telefono Cliente", "Preventivo", "quote", "{{ quote.client_phone }}"),
  sysField("sys_qt_expires", "Scadenza", "Preventivo", "quote", "{{ quote.expires_at }}"),
  sysField("sys_qt_validity", "Giorni Validità", "Preventivo", "quote", "{{ quote.validity_days }}"),
  sysField("sys_qt_contact", "ID Contatto", "Preventivo", "quote", "{{ quote.contact_id }}"),
  sysField("sys_qt_desc", "Descrizione", "Preventivo", "quote", "{{ quote.description }}"),
  sysField("sys_qt_int_notes", "Note Interne", "Preventivo", "quote", "{{ quote.internal_notes }}"),
  sysField("sys_qt_terms", "Termini e Condizioni", "Preventivo", "quote", "{{ quote.terms_and_conditions }}"),
  sysField("sys_qt_subtotal", "Subtotale", "Preventivo", "quote", "{{ quote.subtotal }}"),
  sysField("sys_qt_vat", "Importo IVA", "Preventivo", "quote", "{{ quote.vat_amount }}"),
  sysField("sys_qt_disc_perc", "Sconto %", "Preventivo", "quote", "{{ quote.discount_percent }}"),
  sysField("sys_qt_disc_val", "Sconto Valore", "Preventivo", "quote", "{{ quote.discount_amount }}"),
  sysField("sys_qt_client_company", "Azienda Cliente", "Preventivo", "quote", "{{ quote.client_company }}"),
  sysField("sys_qt_client_vat", "P.IVA Cliente", "Preventivo", "quote", "{{ quote.client_vat_number }}"),
  sysField("sys_qt_client_fc", "CF Cliente", "Preventivo", "quote", "{{ quote.client_fiscal_code }}"),
  sysField("sys_qt_client_addr", "Indirizzo Cliente", "Preventivo", "quote", "{{ quote.client_address }}"),
  sysField("sys_qt_sent", "Data Invio", "Preventivo", "quote", "{{ quote.sent_at }}"),
  sysField("sys_qt_viewed", "Data Visualizzazione", "Preventivo", "quote", "{{ quote.viewed_at }}"),
  sysField("sys_qt_signed", "Data Firma", "Preventivo", "quote", "{{ quote.signed_at }}"),
  sysField("sys_qt_opp_id", "ID Opportunità", "Preventivo", "quote", "{{ quote.opportunity_id }}"),
  sysField("sys_qt_assigned", "Assegnato a", "Preventivo", "quote", "{{ quote.assigned_to }}"),

  // ══════════════════════════════════════
  // ── Ticket ──
  // ══════════════════════════════════════
  sysField("sys_tk_id", "ID Ticket", "Ticket", "ticket", "{{ ticket.id }}"),
  sysField("sys_tk_subject", "Oggetto", "Ticket", "ticket", "{{ ticket.subject }}"),
  sysField("sys_tk_status", "Stato", "Ticket", "ticket", "{{ ticket.status }}"),
  sysField("sys_tk_priority", "Priorità", "Ticket", "ticket", "{{ ticket.priority }}"),
  sysField("sys_tk_category", "Categoria", "Ticket", "ticket", "{{ ticket.category }}"),
  sysField("sys_tk_customer", "ID Cliente", "Ticket", "ticket", "{{ ticket.customer_id }}"),
  sysField("sys_tk_assigned", "Assegnato a", "Ticket", "ticket", "{{ ticket.assigned_to }}"),
  sysField("sys_tk_notes", "Note Interne", "Ticket", "ticket", "{{ ticket.internal_notes }}"),
  sysField("sys_tk_order_id", "ID Ordine", "Ticket", "ticket", "{{ ticket.order_id }}"),
  sysField("sys_tk_last_msg", "Ultimo Messaggio", "Ticket", "ticket", "{{ ticket.last_message_at }}"),

  // ══════════════════════════════════════
  // ── Task ──
  // ══════════════════════════════════════
  sysField("sys_tsk_id", "ID Task", "Task", "task", "{{ task.id }}"),
  sysField("sys_tsk_title", "Titolo", "Task", "task", "{{ task.title }}"),
  sysField("sys_tsk_status", "Stato", "Task", "task", "{{ task.status }}"),
  sysField("sys_tsk_priority", "Priorità", "Task", "task", "{{ task.priority }}"),
  sysField("sys_tsk_due", "Data Scadenza", "Task", "task", "{{ task.due_date }}"),
  sysField("sys_tsk_assigned", "Assegnato a", "Task", "task", "{{ task.assigned_to }}"),
  sysField("sys_tsk_notes", "Note", "Task", "task", "{{ task.notes }}"),
  sysField("sys_tsk_category", "Categoria", "Task", "task", "{{ task.category }}"),
  sysField("sys_tsk_contact", "ID Contatto", "Task", "task", "{{ task.contact_id }}"),
  sysField("sys_tsk_order_id", "ID Ordine", "Task", "task", "{{ task.order_id }}"),
  sysField("sys_tsk_opp_id", "ID Opportunità", "Task", "task", "{{ task.opportunity_id }}"),
  sysField("sys_tsk_ticket_id", "ID Ticket", "Task", "task", "{{ task.ticket_id }}"),
  sysField("sys_tsk_completed", "Completato il", "Task", "task", "{{ task.completed_at }}"),

  // ══════════════════════════════════════
  // ── Dipendente ──
  // ══════════════════════════════════════
  sysField("sys_emp_id", "ID Dipendente", "Dipendente", "employee", "{{ employee.id }}"),
  sysField("sys_emp_first", "Nome", "Dipendente", "employee", "{{ employee.first_name }}"),
  sysField("sys_emp_last", "Cognome", "Dipendente", "employee", "{{ employee.last_name }}"),
  sysField("sys_emp_email", "Email", "Dipendente", "employee", "{{ employee.email }}"),
  sysField("sys_emp_phone", "Telefono", "Dipendente", "employee", "{{ employee.phone }}"),
  sysField("sys_emp_role", "Ruolo", "Dipendente", "employee", "{{ employee.role_type }}"),
  sysField("sys_emp_gross", "RAL Lorda", "Dipendente", "employee", "{{ employee.gross_salary }}"),
  sysField("sys_emp_net", "Netto Mensile", "Dipendente", "employee", "{{ employee.net_salary }}"),
  sysField("sys_emp_hours", "Ore Mensili", "Dipendente", "employee", "{{ employee.monthly_hours }}"),
  sysField("sys_emp_active", "Attivo", "Dipendente", "employee", "{{ employee.is_active }}"),

  // ══════════════════════════════════════
  // ── Magazzino ──
  // ══════════════════════════════════════
  sysField("sys_wh_id", "ID Articolo", "Magazzino", "warehouse", "{{ warehouse.id }}"),
  sysField("sys_wh_name", "Nome", "Magazzino", "warehouse", "{{ warehouse.name }}"),
  sysField("sys_wh_qty", "Quantità", "Magazzino", "warehouse", "{{ warehouse.quantity }}"),
  sysField("sys_wh_min", "Scorta Minima", "Magazzino", "warehouse", "{{ warehouse.min_stock_level }}"),
  sysField("sys_wh_cost", "Costo Unitario", "Magazzino", "warehouse", "{{ warehouse.unit_cost }}"),
  sysField("sys_wh_available", "Quantità Disponibile", "Magazzino", "warehouse", "{{ warehouse.quantity_available }}"),
  sysField("sys_wh_desc", "Descrizione", "Magazzino", "warehouse", "{{ warehouse.description }}"),
  sysField("sys_wh_vat", "Aliquota IVA", "Magazzino", "warehouse", "{{ warehouse.vat_rate }}"),
  sysField("sys_wh_supplier", "ID Fornitore", "Magazzino", "warehouse", "{{ warehouse.supplier_id }}"),
  sysField("sys_wh_reserved", "Quantità Prenotata", "Magazzino", "warehouse", "{{ warehouse.quantity_reserved }}"),
  sysField("sys_wh_reorder", "Quantità Riordino", "Magazzino", "warehouse", "{{ warehouse.reorder_quantity }}"),
  sysField("sys_wh_last_delivery", "Ultima Consegna", "Magazzino", "warehouse", "{{ warehouse.last_delivery_date }}"),

  // ══════════════════════════════════════
  // ── Utente/Profilo ──
  // ══════════════════════════════════════
  sysField("sys_usr_id", "ID Utente", "Utente", "user", "{{ user.id }}"),
  sysField("sys_usr_first", "Nome", "Utente", "user", "{{ user.first_name }}"),
  sysField("sys_usr_last", "Cognome", "Utente", "user", "{{ user.last_name }}"),
  sysField("sys_usr_email", "Email", "Utente", "user", "{{ user.email }}"),
  sysField("sys_usr_phone", "Telefono", "Utente", "user", "{{ user.phone }}"),
  sysField("sys_usr_fiscal_code", "Codice Fiscale", "Utente", "user", "{{ user.fiscal_code }}"),
  sysField("sys_usr_address", "Indirizzo", "Utente", "user", "{{ user.address }}"),
  sysField("sys_usr_site_addr", "Indirizzo Sede", "Utente", "user", "{{ user.site_address }}"),
  sysField("sys_usr_avatar", "URL Avatar", "Utente", "user", "{{ user.avatar_url }}"),
  sysField("sys_usr_notes", "Note", "Utente", "user", "{{ user.notes }}"),
  sysField("sys_usr_salesperson", "ID Venditore", "Utente", "user", "{{ user.salesperson_id }}"),

  // ══════════════════════════════════════
  // ── Venditore ──
  // ══════════════════════════════════════
  sysField("sys_sp_id", "ID Venditore", "Venditore", "salesperson", "{{ salesperson.id }}"),
  sysField("sys_sp_first", "Nome", "Venditore", "salesperson", "{{ salesperson.first_name }}"),
  sysField("sys_sp_last", "Cognome", "Venditore", "salesperson", "{{ salesperson.last_name }}"),
  sysField("sys_sp_email", "Email", "Venditore", "salesperson", "{{ salesperson.email }}"),
  sysField("sys_sp_phone", "Telefono", "Venditore", "salesperson", "{{ salesperson.phone }}"),
  sysField("sys_sp_comm_type", "Tipo Provvigione", "Venditore", "salesperson", "{{ salesperson.commission_type }}"),
  sysField("sys_sp_comm_value", "Valore Provvigione", "Venditore", "salesperson", "{{ salesperson.commission_value }}"),
  sysField("sys_sp_area", "Area Geografica", "Venditore", "salesperson", "{{ salesperson.area_geografica }}"),
  sysField("sys_sp_zona", "Zona", "Venditore", "salesperson", "{{ salesperson.zona }}"),
  sysField("sys_sp_start", "Data Inizio", "Venditore", "salesperson", "{{ salesperson.data_inizio }}"),
  sysField("sys_sp_active", "Attivo", "Venditore", "salesperson", "{{ salesperson.is_active }}"),

  // ══════════════════════════════════════
  // ── Squadra Esterna ──
  // ══════════════════════════════════════
  sysField("sys_et_id", "ID Squadra", "Squadra Esterna", "external_team", "{{ external_team.id }}"),
  sysField("sys_et_name", "Nome Squadra", "Squadra Esterna", "external_team", "{{ external_team.name }}"),
  sysField("sys_et_contact", "Nome Referente", "Squadra Esterna", "external_team", "{{ external_team.contact_name }}"),
  sysField("sys_et_email", "Email", "Squadra Esterna", "external_team", "{{ external_team.email }}"),
  sysField("sys_et_phone", "Telefono", "Squadra Esterna", "external_team", "{{ external_team.phone }}"),
  sysField("sys_et_notes", "Note", "Squadra Esterna", "external_team", "{{ external_team.notes }}"),
  sysField("sys_et_vat", "Aliquota IVA", "Squadra Esterna", "external_team", "{{ external_team.vat_rate }}"),
  sysField("sys_et_active", "Attivo", "Squadra Esterna", "external_team", "{{ external_team.is_active }}"),

  // ══════════════════════════════════════
  // ── Fornitore ──
  // ══════════════════════════════════════
  sysField("sys_sup_id", "ID Fornitore", "Fornitore", "supplier", "{{ supplier.id }}"),
  sysField("sys_sup_name", "Nome", "Fornitore", "supplier", "{{ supplier.name }}"),
  sysField("sys_sup_email", "Email", "Fornitore", "supplier", "{{ supplier.email }}"),
  sysField("sys_sup_phone", "Telefono", "Fornitore", "supplier", "{{ supplier.phone }}"),
  sysField("sys_sup_vat", "Partita IVA", "Fornitore", "supplier", "{{ supplier.vat_number }}"),
  sysField("sys_sup_fc", "Codice Fiscale", "Fornitore", "supplier", "{{ supplier.fiscal_code }}"),
  sysField("sys_sup_address", "Indirizzo", "Fornitore", "supplier", "{{ supplier.address }}"),
  sysField("sys_sup_city", "Città", "Fornitore", "supplier", "{{ supplier.city }}"),
  sysField("sys_sup_province", "Provincia", "Fornitore", "supplier", "{{ supplier.province }}"),
  sysField("sys_sup_zip", "CAP", "Fornitore", "supplier", "{{ supplier.postal_code }}"),
  sysField("sys_sup_country", "Nazione", "Fornitore", "supplier", "{{ supplier.country }}"),
  sysField("sys_sup_website", "Sito Web", "Fornitore", "supplier", "{{ supplier.website }}"),
  sysField("sys_sup_iban", "IBAN", "Fornitore", "supplier", "{{ supplier.iban }}"),
  sysField("sys_sup_bank", "Banca", "Fornitore", "supplier", "{{ supplier.bank_name }}"),
  sysField("sys_sup_pay_method", "Metodo Pagamento", "Fornitore", "supplier", "{{ supplier.payment_method }}"),
  sysField("sys_sup_credit", "Fido", "Fornitore", "supplier", "{{ supplier.credit_limit }}"),
  sysField("sys_sup_lead_time", "Lead Time (gg)", "Fornitore", "supplier", "{{ supplier.lead_time_days }}"),
  sysField("sys_sup_min_order", "Ordine Minimo", "Fornitore", "supplier", "{{ supplier.min_order_amount }}"),
  sysField("sys_sup_category", "Categoria Prodotto", "Fornitore", "supplier", "{{ supplier.product_category }}"),
  sysField("sys_sup_rating", "Valutazione", "Fornitore", "supplier", "{{ supplier.rating }}"),
  sysField("sys_sup_notes", "Note", "Fornitore", "supplier", "{{ supplier.notes }}"),
  sysField("sys_sup_active", "Attivo", "Fornitore", "supplier", "{{ supplier.is_active }}"),
  sysField("sys_sup_foreign", "Estero", "Fornitore", "supplier", "{{ supplier.is_foreign }}"),
];

const FIELD_TYPES = [
  { value: "text", label: "Testo" },
  { value: "number", label: "Numero" },
  { value: "date", label: "Data" },
  { value: "select", label: "Selezione" },
];

const CONTACT_SECTIONS = [
  { value: "contact", label: "Contatto" },
  { value: "general_info", label: "Informazioni generali" },
  { value: "additional_info", label: "Informazioni aggiuntive" },
];
const OPPORTUNITY_SECTIONS = [
  { value: "opportunity_details", label: "Opportunità Details" },
];

const GROUP_OPTIONS = [
  { value: "all", label: "Tutto" },
  { value: "contact", label: "Contatto" },
  { value: "opportunity", label: "Opportunità" },
  { value: "appointment", label: "Appuntamento" },
  { value: "order", label: "Ordine" },
  { value: "invoice", label: "Fattura" },
  { value: "quote", label: "Preventivo" },
  { value: "ticket", label: "Ticket" },
  { value: "task", label: "Task" },
  { value: "employee", label: "Dipendente" },
  { value: "warehouse", label: "Magazzino" },
  { value: "user", label: "Utente" },
  { value: "salesperson", label: "Venditore" },
  { value: "external_team", label: "Squadra Esterna" },
  { value: "supplier", label: "Fornitore" },
];

const OBJECT_NAME_MAP: Record<string, string> = {
  contact: "Contatto",
  opportunity: "Opportunità",
  appointment: "Appuntamento",
  order: "Ordine",
  invoice: "Fattura",
  quote: "Preventivo",
  ticket: "Ticket",
  task: "Task",
  employee: "Dipendente",
  warehouse: "Magazzino",
  user: "Utente",
  salesperson: "Venditore",
  external_team: "Squadra Esterna",
  supplier: "Fornitore",
};

function toSnakeCase(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/* ───── component ───── */
export function CustomFieldsConfig() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [section, setSection] = useState("general_info");
  const [objectType, setObjectType] = useState<"contact" | "opportunity">("contact");
  const [optionsInput, setOptionsInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [groupBy, setGroupBy] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: customFields = [], isLoading } = useQuery({
    queryKey: ["marketing_custom_fields", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .order("section")
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const allFields = useMemo<UnifiedField[]>(() => {
    const custom: UnifiedField[] = customFields.map((f: any) => {
      const isOpp = f.object_type === "opportunity";
      return {
        id: f.id,
        name: f.name,
        object: isOpp ? "Opportunità" : "Contatto",
        folder: f.section,
        folderColor: FOLDER_COLORS[f.section] || FOLDER_COLORS.additional_info,
        uniqueKey: isOpp
          ? `{{ opportunity.${toSnakeCase(f.name)} }}`
          : `{{ contact.${toSnakeCase(f.name)} }}`,
        createdAt: f.created_at,
        isSystem: false,
        fieldType: f.field_type,
        options: f.options ?? [],
        section: f.section,
      };
    });
    return [...BUILTIN_FIELDS, ...custom];
  }, [customFields]);

  const filtered = useMemo(() => {
    let result = allFields;
    if (groupBy !== "all") {
      const objectName = OBJECT_NAME_MAP[groupBy];
      if (objectName) {
        result = result.filter((f) => f.object === objectName);
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.uniqueKey.toLowerCase().includes(q) ||
          f.object.toLowerCase().includes(q) ||
          (FOLDER_LABELS[f.folder] || f.folder).toLowerCase().includes(q)
      );
    }
    return result;
  }, [allFields, search, groupBy]);

  const handleObjectTypeChange = (val: "contact" | "opportunity") => {
    setObjectType(val);
    setSection(val === "opportunity" ? "opportunity_details" : "general_info");
  };

  const availableSections = objectType === "opportunity" ? OPPORTUNITY_SECTIONS : CONTACT_SECTIONS;

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !name.trim()) return;
      const options =
        fieldType === "select"
          ? optionsInput.split(",").map((o) => o.trim()).filter(Boolean)
          : [];
      const { error } = await supabase.from("marketing_custom_fields").insert({
        company_id: companyId,
        name: name.trim(),
        field_type: fieldType,
        options,
        section,
        position: customFields.length,
        object_type: objectType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      toast.success("Campo personalizzato aggiunto");
      setDialogOpen(false);
      setName("");
      setFieldType("text");
      setSection("general_info");
      setObjectType("contact");
      setOptionsInput("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_custom_fields").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      toast.success("Campo eliminato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Chiave copiata");
  };

  const visibleFields = filtered.slice(0, pageSize);
  const total = filtered.length;

  return (
    <div className="space-y-0">
      {/* ── Header tabs + buttons ── */}
      <div className="flex items-center justify-between border-b pb-0 mb-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            <TabsTrigger value="all" className="rounded-none border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 pb-2.5 pt-1">
              Tutti i campi
            </TabsTrigger>
            <TabsTrigger value="folders" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 pb-2.5 pt-1" disabled>
              Cartelle
            </TabsTrigger>
            <TabsTrigger value="deleted" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 pb-2.5 pt-1" disabled>
              Campi eliminati
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 pb-1">
          <Button variant="outline" size="sm" disabled>
            <FolderPlus className="h-4 w-4 mr-1.5" /> Aggiungi cartella
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Aggiungi campo
          </Button>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Raggruppa per:</span>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm py-12 text-center">Caricamento...</p>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-10 px-3"><Checkbox disabled /></TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Nome Del Campo</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Oggetto</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Cartella</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Chiave Univoca</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Creato Il</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleFields.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    Nessun campo trovato.
                  </TableCell>
                </TableRow>
              ) : (
                visibleFields.map((f) => (
                  <TableRow key={f.id} className="group">
                    <TableCell className="px-3">
                      {f.isSystem ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                      ) : (
                        <Checkbox />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.object}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs font-normal ${f.folderColor}`}>
                        {FOLDER_LABELS[f.folder] || f.folder}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{f.uniqueKey}</code>
                        <button
                          onClick={() => copyKey(f.uniqueKey)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(f.createdAt), "dd MMM yyyy", { locale: it })}
                    </TableCell>
                    <TableCell>
                      {!f.isSystem && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteMutation.mutate(f.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
        <span>
          Presentazione 1 a {Math.min(pageSize, total)} di {total} risultati
        </span>
        <div className="flex items-center gap-1.5">
          <span>Dimensione pagina:</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[80px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Add field dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Campo Personalizzato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Oggetto *</Label>
              <Select value={objectType} onValueChange={(v) => handleObjectTypeChange(v as "contact" | "opportunity")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contatto</SelectItem>
                  <SelectItem value="opportunity">Opportunità</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome del campo *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Tipo di caldaia"
                maxLength={100}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sezione</Label>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableSections.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {fieldType === "select" && (
              <div className="space-y-1.5">
                <Label>Opzioni (separate da virgola)</Label>
                <Input
                  value={optionsInput}
                  onChange={(e) => setOptionsInput(e.target.value)}
                  placeholder="es. Condensazione, Tradizionale, Ibrida"
                  maxLength={200}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!name.trim() || addMutation.isPending}>
              {addMutation.isPending ? "Salvataggio..." : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
