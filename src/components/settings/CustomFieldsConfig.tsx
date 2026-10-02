import { useState, useMemo, useEffect } from "react";
import { TablePagination } from "@/components/ui/table-pagination";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Search, Copy, FolderPlus, Lock, AlertCircle, Pencil, FolderOpen, Undo2, ShieldAlert } from "lucide-react";
import {
  useCustomFieldFolders,
  useCreateCustomFieldFolder,
  useUpdateCustomFieldFolder,
  useDeleteCustomFieldFolder,
  type CustomFieldFolder,
} from "@/hooks/useCustomFieldFolders";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/* ───── types ───── */
export interface UnifiedField {
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
  objectType?: string;
}

interface MarketingCustomFieldRow {
  id: string;
  name: string;
  object_type: string;
  section: string | null;
  created_at: string;
  field_type: string;
  options: string[] | null;
}

type CustomFieldUsageCounts = {
  contacts: number;
  opportunities: number;
  entities: number;
};

const OPTION_FIELD_TYPES = new Set(["select", "radio", "multiselect"]);

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");

const normalizeOptions = (value: string) => {
  const seen = new Set<string>();
  return value
    .split(/[,;\n]/)
    .map((o) => o.trim())
    .filter(Boolean)
    .filter((o) => {
      const key = o.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const formatSafeDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd MMM yyyy", { locale: it });
};

class CustomFieldInUseError extends Error {
  usage: CustomFieldUsageCounts;

  constructor(usage: CustomFieldUsageCounts) {
    super("CUSTOM_FIELD_IN_USE");
    this.name = "CustomFieldInUseError";
    this.usage = usage;
  }
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "";
}

async function getCustomFieldUsageCounts(fieldId: string): Promise<CustomFieldUsageCounts> {
  const [contactsRes, opportunitiesRes, entitiesRes] = await Promise.all([
    supabase
      .from("marketing_contact_field_values")
      .select("id", { count: "exact", head: true })
      .eq("field_id", fieldId),
    supabase
      .from("marketing_opportunity_field_values")
      .select("id", { count: "exact", head: true })
      .eq("field_id", fieldId),
    supabase
      .from("entity_custom_field_values")
      .select("id", { count: "exact", head: true })
      .eq("field_id", fieldId),
  ]);

  if (contactsRes.error) throw contactsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;
  if (entitiesRes.error) throw entitiesRes.error;

  return {
    contacts: contactsRes.count ?? 0,
    opportunities: opportunitiesRes.count ?? 0,
    entities: entitiesRes.count ?? 0,
  };
}

/* ───── folder colors & labels ───── */
export const FOLDER_COLORS: Record<string, string> = {
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
  candidato: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  colloquio: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  warehouse: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  user: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
  salesperson: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  external_team: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  supplier: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  // ── Cantieri ────────────────────────────────────────────────────
  ordini_variazione: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  giornale_lavori: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  pos_document: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  duvri_document: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  // ── Assistenza/Interventi ─────────────────────────────────────────────────
  intervento: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  rapportino: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  // ── Manutenzione Programmata ──────────────────────────────────────────────
  impianto: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  contratto_manutenzione: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  piano_manutenzione: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  // ── Subappaltatori ────────────────────────────────────────────────────────
  subappaltatore: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  contratto_subappalto: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  sal_subappaltatore: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  // ── Acquisti ──────────────────────────────────────────────────────────────
  ordine_acquisto: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ddt_ricezione: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  // ── Finanza ───────────────────────────────────────────────────────────────
  costo_aziendale: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  // ── Azienda ───────────────────────────────────────────────────────────────
  company: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  // ── Catalogo Esteso (Sprint C) ────────────────────────────────────────────
  product: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  family: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  tariffa: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  catalog_category: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
};
export const FOLDER_LABELS: Record<string, string> = {
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
  candidato: "Candidato",
  colloquio: "Colloquio Candidato",
  warehouse: "Magazzino",
  user: "Utente",
  salesperson: "Venditore",
  external_team: "Squadra Esterna",
  supplier: "Fornitore",
  // ── Cantieri ──
  ordini_variazione: "Ordine di Variazione",
  giornale_lavori: "Giornale dei Lavori",
  pos_document: "POS – Sicurezza",
  duvri_document: "DUVRI – Sicurezza",
  // ── Assistenza ────────────────────────────────────────────────────────────
  intervento: "Intervento / Assistenza",
  rapportino: "Rapportino Intervento",
  // ── Manutenzione ──────────────────────────────────────────────────────────
  impianto: "Impianto Cliente",
  contratto_manutenzione: "Contratto Manutenzione",
  piano_manutenzione: "Piano Manutenzione",
  // ── Subappaltatori ────────────────────────────────────────────────────────
  subappaltatore: "Subappaltatore",
  contratto_subappalto: "Contratto Subappalto",
  sal_subappaltatore: "SAL Subappaltatore",
  // ── Acquisti ──────────────────────────────────────────────────────────────
  ordine_acquisto: "Ordine Acquisto (OdA)",
  ddt_ricezione: "DDT Ricezione Merce",
  // ── Finanza ───────────────────────────────────────────────────────────────
  costo_aziendale: "Costo Aziendale",
  // ── Azienda ───────────────────────────────────────────────────────────────
  company: "Azienda / Profilo",
  // ── Catalogo Esteso (Sprint C) ────────────────────────────────────────────
  product: "Prodotto (Articolo)",
  family: "Famiglia Prodotto",
  tariffa: "Tariffa / Manodopera",
  catalog_category: "Categoria Listino",
};

/* ───── helper to build system fields ───── */
function sysField(id: string, name: string, object: string, folder: string, uniqueKey: string): UnifiedField {
  return { id, name, object, folder, folderColor: FOLDER_COLORS[folder] || FOLDER_COLORS.additional_info, uniqueKey, createdAt: "2024-01-01", isSystem: true };
}

/* ───── built-in fields ───── */
export const BUILTIN_FIELDS: UnifiedField[] = [
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
  sysField("sys_emp_active",        "Attivo",              "Dipendente", "employee", "{{ employee.is_active }}"),
  // ── Dipendente — campi estesi (modulo 11) ──────────────────────────────
  sysField("sys_emp_fiscal_code",   "Codice Fiscale",      "Dipendente", "employee", "{{ employee.fiscal_code }}"),
  sysField("sys_emp_address",       "Indirizzo",           "Dipendente", "employee", "{{ employee.address }}"),
  sysField("sys_emp_sede_id",       "ID Sede",             "Dipendente", "employee", "{{ employee.sede_id }}"),
  sysField("sys_emp_avatar",        "Avatar URL",          "Dipendente", "employee", "{{ employee.avatar_url }}"),
  sysField("sys_emp_dob",           "Data Nascita",        "Dipendente", "employee", "{{ employee.date_of_birth }}"),
  sysField("sys_emp_contract_type", "Tipo Contratto",      "Dipendente", "employee", "{{ employee.contract_type }}"),
  sysField("sys_emp_hire_date",     "Data Assunzione",     "Dipendente", "employee", "{{ employee.hire_date }}"),
  sysField("sys_emp_contract_end",  "Data Fine Contratto", "Dipendente", "employee", "{{ employee.contract_end_date }}"),
  sysField("sys_emp_hourly_cost",   "Costo Orario",        "Dipendente", "employee", "{{ employee.hourly_cost }}"),
  sysField("sys_emp_specializ",     "Specializzazione",    "Dipendente", "employee", "{{ employee.specializzazione }}"),

  // ══════════════════════════════════════
  // ── Candidato (banca dati selezione) ──
  // ══════════════════════════════════════
  sysField("sys_cand_id",          "ID Candidato",          "Candidato (Selezione)", "candidato", "{{ candidato.id }}"),
  sysField("sys_cand_nome",        "Nome Candidato",        "Candidato (Selezione)", "candidato", "{{ candidato.nome }}"),
  sysField("sys_cand_cognome",     "Cognome Candidato",     "Candidato (Selezione)", "candidato", "{{ candidato.cognome }}"),
  sysField("sys_cand_email",       "Email Candidato",       "Candidato (Selezione)", "candidato", "{{ candidato.email }}"),
  sysField("sys_cand_telefono",    "Telefono Candidato",    "Candidato (Selezione)", "candidato", "{{ candidato.telefono }}"),
  sysField("sys_cand_citta",       "Città",                 "Candidato (Selezione)", "candidato", "{{ candidato.citta }}"),
  sysField("sys_cand_ruolo",       "Ruolo Cercato",         "Candidato (Selezione)", "candidato", "{{ candidato.ruolo }}"),
  sysField("sys_cand_fonte",       "Fonte",                 "Candidato (Selezione)", "candidato", "{{ candidato.fonte }}"),
  sysField("sys_cand_stato",       "Esito / Stato",         "Candidato (Selezione)", "candidato", "{{ candidato.stato }}"),
  sysField("sys_cand_fase",        "Fase Selezione",        "Candidato (Selezione)", "candidato", "{{ candidato.fase_nome }}"),
  sysField("sys_cand_valutazione", "Valutazione (stelle)",  "Candidato (Selezione)", "candidato", "{{ candidato.valutazione }}"),
  sysField("sys_cand_cv_nome",     "Nome File CV",          "Candidato (Selezione)", "candidato", "{{ candidato.cv_nome }}"),
  sysField("sys_cand_note",        "Note",                  "Candidato (Selezione)", "candidato", "{{ candidato.note }}"),
  sysField("sys_cand_created",     "Data Candidatura",      "Candidato (Selezione)", "candidato", "{{ candidato.created_at }}"),
  sysField("sys_cand_modulo",      "Modulo di Provenienza", "Candidato (Selezione)", "candidato", "{{ candidato.modulo_titolo }}"),

  // ── Colloquio candidato ──
  sysField("sys_coll_data",  "Data Colloquio",     "Colloquio Candidato", "colloquio", "{{ colloquio.data_colloquio }}"),
  sysField("sys_coll_ora",   "Ora Colloquio",      "Colloquio Candidato", "colloquio", "{{ colloquio.ora_colloquio }}"),
  sysField("sys_coll_tipo",  "Tipo Colloquio",     "Colloquio Candidato", "colloquio", "{{ colloquio.tipo }}"),
  sysField("sys_coll_esito", "Esito Colloquio",    "Colloquio Candidato", "colloquio", "{{ colloquio.esito }}"),
  sysField("sys_coll_note",  "Note Colloquio",     "Colloquio Candidato", "colloquio", "{{ colloquio.note }}"),
  sysField("sys_emp_notes",         "Note Interne",        "Dipendente", "employee", "{{ employee.notes }}"),

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

  // ══════════════════════════════════════
  // ── Ordine di Variazione ──
  // ══════════════════════════════════════
  sysField("sys_odv_id",        "ID OdV",             "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.id }}"),
  sysField("sys_odv_numero",    "Numero OdV",          "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.numero_odv }}"),
  sysField("sys_odv_titolo",    "Titolo",              "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.titolo }}"),
  sysField("sys_odv_importo",   "Importo Aggiuntivo",  "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.impatto_economico }}"),
  sysField("sys_odv_giorni",    "Giorni Aggiuntivi",   "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.impatto_giorni }}"),
  sysField("sys_odv_status",    "Stato",               "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.status }}"),
  sysField("sys_odv_desc",      "Descrizione",         "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.descrizione }}"),
  sysField("sys_odv_motivaz",   "Motivazione",         "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.motivazione }}"),
  sysField("sys_odv_richda",    "Richiesto Da",        "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.richiesto_da }}"),
  sysField("sys_odv_firmato",   "Firmato Da",          "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.firmato_da }}"),
  sysField("sys_odv_firmato_il","Data Firma",          "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.firmato_il }}"),

  // ══════════════════════════════════════
  // ── Giornale dei Lavori ──
  // ══════════════════════════════════════
  sysField("sys_gl_id",         "ID Report",           "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.id }}"),
  sysField("sys_gl_data",       "Data Lavori",         "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.data_lavori }}"),
  sysField("sys_gl_resp",       "Responsabile",        "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.responsabile_lavori }}"),
  sysField("sys_gl_meteo",      "Meteo",               "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.meteo }}"),
  sysField("sys_gl_avanz",      "Avanzamento %",       "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.avanzamento_percentuale }}"),
  sysField("sys_gl_attivita",   "Attività Svolte",     "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.attivita_svolte }}"),
  sysField("sys_gl_problemi",   "Problemi Riscontrati","Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.problemi_riscontrati }}"),
  sysField("sys_gl_operai",     "N° Operai",           "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.numero_operai }}"),

  // ══════════════════════════════════════
  // ── POS – Sicurezza Cantiere ──
  // ══════════════════════════════════════
  sysField("sys_pos_id",        "ID Documento POS",    "POS – Sicurezza", "pos_document", "{{ pos_document.id }}"),
  sysField("sys_pos_order",     "Ordine",              "POS – Sicurezza", "pos_document", "{{ pos_document.order_id }}"),
  sysField("sys_pos_indirizzo", "Indirizzo Cantiere",  "POS – Sicurezza", "pos_document", "{{ pos_document.indirizzo_cantiere }}"),
  sysField("sys_pos_resp",      "Responsabile Sic.",   "POS – Sicurezza", "pos_document", "{{ pos_document.responsabile_sicurezza }}"),
  sysField("sys_pos_costi",     "Costi Sicurezza",     "POS – Sicurezza", "pos_document", "{{ pos_document.costi_sicurezza }}"),
  sysField("sys_pos_status",    "Stato",               "POS – Sicurezza", "pos_document", "{{ pos_document.status }}"),

  // ══════════════════════════════════════
  // ── DUVRI – Sicurezza Cantiere ──
  // ══════════════════════════════════════
  sysField("sys_duvri_id",      "ID Documento DUVRI",  "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.id }}"),
  sysField("sys_duvri_order",   "Ordine",              "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.order_id }}"),
  sysField("sys_duvri_indirizzo","Indirizzo Cantiere", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.indirizzo_cantiere }}"),
  sysField("sys_duvri_resp",    "Responsabile Sic.",   "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.responsabile_sicurezza }}"),
  sysField("sys_duvri_status",  "Stato",               "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.status }}"),

  // ══════════════════════════════════════
  // ── 1. Intervento / Ticket Tecnico ──
  // ══════════════════════════════════════
  sysField("sys_int_id",                "ID Ticket/Intervento",      "Intervento", "intervento", "{{ intervento.id }}"),
  sysField("sys_int_subject",           "Soggetto / Titolo",         "Intervento", "intervento", "{{ intervento.subject }}"),
  sysField("sys_int_tipo",              "Tipo Intervento",           "Intervento", "intervento", "{{ intervento.tipo }}"),
  sysField("sys_int_status",            "Stato",                     "Intervento", "intervento", "{{ intervento.status }}"),
  sysField("sys_int_priority",          "Priorità",                  "Intervento", "intervento", "{{ intervento.priority }}"),
  sysField("sys_int_category",          "Categoria",                 "Intervento", "intervento", "{{ intervento.category }}"),
  sysField("sys_int_customer_id",       "ID Cliente",                "Intervento", "intervento", "{{ intervento.customer_id }}"),
  sysField("sys_int_order_id",          "ID Ordine",                 "Intervento", "intervento", "{{ intervento.order_id }}"),
  sysField("sys_int_impianto_id",       "ID Impianto",               "Intervento", "intervento", "{{ intervento.impianto_id }}"),
  sysField("sys_int_assigned_to",       "Assegnato a",               "Intervento", "intervento", "{{ intervento.assigned_to }}"),
  sysField("sys_int_data_prevista",     "Data Intervento Prevista",  "Intervento", "intervento", "{{ intervento.data_intervento_prevista }}"),
  sysField("sys_int_data_effettiva",    "Data Intervento Effettiva", "Intervento", "intervento", "{{ intervento.data_intervento_effettiva }}"),
  sysField("sys_int_durata_ore",        "Durata (ore)",              "Intervento", "intervento", "{{ intervento.durata_ore }}"),
  sysField("sys_int_indirizzo",         "Indirizzo Intervento",      "Intervento", "intervento", "{{ intervento.indirizzo_intervento }}"),
  sysField("sys_int_internal_notes",    "Note Interne",              "Intervento", "intervento", "{{ intervento.internal_notes }}"),
  sysField("sys_int_note_tecnico",      "Note Tecnico",              "Intervento", "intervento", "{{ intervento.note_tecnico }}"),
  sysField("sys_int_last_message_at",   "Ultimo Messaggio",          "Intervento", "intervento", "{{ intervento.last_message_at }}"),

  // ── Rapportino Intervento ──
  sysField("sys_rap_id",               "ID Rapportino",      "Rapportino", "rapportino", "{{ rapportino.id }}"),
  sysField("sys_rap_numero",           "Numero Rapportino",  "Rapportino", "rapportino", "{{ rapportino.numero }}"),
  sysField("sys_rap_data",             "Data Intervento",    "Rapportino", "rapportino", "{{ rapportino.data_intervento }}"),
  sysField("sys_rap_tecnico_id",       "Tecnico ID",         "Rapportino", "rapportino", "{{ rapportino.tecnico_id }}"),
  sysField("sys_rap_ore_lavoro",       "Ore Lavoro",         "Rapportino", "rapportino", "{{ rapportino.ore_lavoro }}"),
  sysField("sys_rap_descrizione",      "Descrizione Lavori", "Rapportino", "rapportino", "{{ rapportino.descrizione }}"),
  sysField("sys_rap_note",             "Note",               "Rapportino", "rapportino", "{{ rapportino.note }}"),
  sysField("sys_rap_materiali",        "Materiali Usati",    "Rapportino", "rapportino", "{{ rapportino.materiali_usati }}"),
  sysField("sys_rap_stato",            "Stato",              "Rapportino", "rapportino", "{{ rapportino.stato }}"),
  sysField("sys_rap_firmato_da",       "Firmato Da",         "Rapportino", "rapportino", "{{ rapportino.firmato_da }}"),
  sysField("sys_rap_firmato_il",       "Firmato Il",         "Rapportino", "rapportino", "{{ rapportino.firmato_il }}"),
  sysField("sys_rap_ticket_id",        "ID Ticket",          "Rapportino", "rapportino", "{{ rapportino.ticket_id }}"),

  // ══════════════════════════════════════
  // ── 2. Impianto Cliente ──
  // ══════════════════════════════════════
  sysField("sys_imp_id",               "ID Impianto",       "Impianto", "impianto", "{{ impianto.id }}"),
  sysField("sys_imp_tipo",             "Tipo Impianto",     "Impianto", "impianto", "{{ impianto.tipo_impianto }}"),
  sysField("sys_imp_marca",            "Marca",             "Impianto", "impianto", "{{ impianto.marca }}"),
  sysField("sys_imp_modello",          "Modello",           "Impianto", "impianto", "{{ impianto.modello }}"),
  sysField("sys_imp_matricola",        "Matricola",         "Impianto", "impianto", "{{ impianto.matricola }}"),
  sysField("sys_imp_data_inst",        "Data Installazione","Impianto", "impianto", "{{ impianto.data_installazione }}"),
  sysField("sys_imp_garanzia",         "Scadenza Garanzia", "Impianto", "impianto", "{{ impianto.garanzia_scadenza }}"),
  sysField("sys_imp_customer_id",      "ID Cliente",        "Impianto", "impianto", "{{ impianto.customer_id }}"),
  sysField("sys_imp_order_id",         "ID Ordine Origine", "Impianto", "impianto", "{{ impianto.order_id }}"),
  sysField("sys_imp_note_tecniche",    "Note Tecniche",     "Impianto", "impianto", "{{ impianto.note_tecniche }}"),
  sysField("sys_imp_attivo",           "Attivo",            "Impianto", "impianto", "{{ impianto.attivo }}"),

  // ══════════════════════════════════════
  // ── 3. Contratto Manutenzione ──
  // ══════════════════════════════════════
  sysField("sys_cm_id",                "ID Contratto",          "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.id }}"),
  sysField("sys_cm_nome",              "Nome Contratto",        "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.nome_contratto }}"),
  sysField("sys_cm_impianto_id",       "ID Impianto",           "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.impianto_id }}"),
  sysField("sys_cm_customer_id",       "ID Cliente",            "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.customer_id }}"),
  sysField("sys_cm_data_inizio",       "Data Inizio",           "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.data_inizio }}"),
  sysField("sys_cm_data_scadenza",     "Data Scadenza",         "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.data_scadenza }}"),
  sysField("sys_cm_importo",           "Importo Canone",        "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.importo_canone }}"),
  sysField("sys_cm_tipo_fatt",         "Tipo Fatturazione",     "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.tipo_fatturazione }}"),
  sysField("sys_cm_rinnovo",           "Rinnovo Automatico",    "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.rinnovo_automatico }}"),
  sysField("sys_cm_stato",             "Stato",                 "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.stato }}"),
  sysField("sys_cm_note",              "Note",                  "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.note }}"),

  // ══════════════════════════════════════
  // ── 4. Piano Manutenzione ──
  // ══════════════════════════════════════
  sysField("sys_pm_id",                "ID Piano",              "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.id }}"),
  sysField("sys_pm_titolo",            "Titolo",                "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.titolo }}"),
  sysField("sys_pm_contratto_id",      "ID Contratto",          "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.contratto_id }}"),
  sysField("sys_pm_freq_giorni",       "Frequenza (giorni)",    "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.frequenza_giorni }}"),
  sysField("sys_pm_freq_tipo",         "Tipo Frequenza",        "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.frequenza_tipo }}"),
  sysField("sys_pm_prossima",          "Prossima Scadenza",     "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.prossima_scadenza }}"),
  sysField("sys_pm_ultima",            "Ultima Esecuzione",     "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.ultima_esecuzione }}"),
  sysField("sys_pm_tecnico",           "Tecnico Preferito",     "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.tecnico_preferito }}"),
  sysField("sys_pm_checklist",         "Checklist Attività",    "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.checklist_attivita }}"),
  sysField("sys_pm_attivo",            "Attivo",                "Piano Manutenzione", "piano_manutenzione", "{{ piano_manutenzione.attivo }}"),

  // ══════════════════════════════════════
  // ── 5. Subappaltatore ──
  // ══════════════════════════════════════
  sysField("sys_sub_id",               "ID Subappaltatore",     "Subappaltatore", "subappaltatore", "{{ subappaltatore.id }}"),
  sysField("sys_sub_ragione_sociale",  "Ragione Sociale",       "Subappaltatore", "subappaltatore", "{{ subappaltatore.ragione_sociale }}"),
  sysField("sys_sub_responsabile",     "Responsabile",          "Subappaltatore", "subappaltatore", "{{ subappaltatore.responsabile }}"),
  sysField("sys_sub_telefono",         "Telefono",              "Subappaltatore", "subappaltatore", "{{ subappaltatore.telefono }}"),
  sysField("sys_sub_tipo_lavori",      "Tipo Lavori",           "Subappaltatore", "subappaltatore", "{{ subappaltatore.tipo_lavori }}"),
  sysField("sys_sub_order_id",         "ID Ordine/Cantiere",    "Subappaltatore", "subappaltatore", "{{ subappaltatore.order_id }}"),
  sysField("sys_sub_data_inizio",      "Data Inizio",           "Subappaltatore", "subappaltatore", "{{ subappaltatore.data_inizio }}"),
  sysField("sys_sub_data_fine",        "Data Fine",             "Subappaltatore", "subappaltatore", "{{ subappaltatore.data_fine }}"),
  sysField("sys_sub_durc_scadenza",    "DURC Scadenza",         "Subappaltatore", "subappaltatore", "{{ subappaltatore.durc_scadenza }}"),

  // ══════════════════════════════════════
  // ── 6. Contratto Subappalto ──
  // ══════════════════════════════════════
  sysField("sys_cs_id",                "ID Contratto",              "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.id }}"),
  sysField("sys_cs_numero",            "Numero Contratto",          "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.numero_contratto }}"),
  sysField("sys_cs_sub_id",            "ID Subappaltatore",         "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.subappaltatore_id }}"),
  sysField("sys_cs_order_id",          "ID Ordine",                 "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.order_id }}"),
  sysField("sys_cs_desc_lavori",       "Descrizione Lavori",        "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.descrizione_lavori }}"),
  sysField("sys_cs_importo",           "Importo Contrattuale",      "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.importo_contrattuale }}"),
  sysField("sys_cs_data_inizio",       "Data Inizio",               "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.data_inizio }}"),
  sysField("sys_cs_data_fine_prev",    "Data Fine Prevista",        "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.data_fine_prevista }}"),
  sysField("sys_cs_data_fine_eff",     "Data Fine Effettiva",       "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.data_fine_effettiva }}"),
  sysField("sys_cs_ritenuta_pct",      "Ritenuta Garanzia %",       "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.ritenuta_garanzia_pct }}"),
  sysField("sys_cs_stato",             "Stato",                     "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.stato }}"),
  sysField("sys_cs_note",              "Note",                      "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.note }}"),

  // ══════════════════════════════════════
  // ── 7. SAL Subappaltatore ──
  // ══════════════════════════════════════
  sysField("sys_sal_id",               "ID SAL",             "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.id }}"),
  sysField("sys_sal_numero",           "Numero SAL",         "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.numero_sal }}"),
  sysField("sys_sal_contratto_id",     "ID Contratto",       "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.contratto_id }}"),
  sysField("sys_sal_sub_id",           "ID Subappaltatore",  "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.subappaltatore_id }}"),
  sysField("sys_sal_data_emissione",   "Data Emissione",     "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.data_emissione }}"),
  sysField("sys_sal_data_pagamento",   "Data Pagamento",     "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.data_pagamento }}"),
  sysField("sys_sal_importo_lordo",    "Importo Lordo",      "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.importo_lordo }}"),
  sysField("sys_sal_ritenuta_pct",     "Ritenuta %",         "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.ritenuta_pct }}"),
  sysField("sys_sal_ritenuta_importo", "Ritenuta Importo",   "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.ritenuta_importo }}"),
  sysField("sys_sal_importo_netto",    "Importo Netto",      "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.importo_netto }}"),
  sysField("sys_sal_stato",            "Stato",              "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.stato }}"),
  sysField("sys_sal_note",             "Note",               "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.note }}"),
  sysField("sys_sal_order_id",         "ID Ordine",          "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.order_id }}"),

  // ══════════════════════════════════════
  // ── 8. Ordine Acquisto (OdA) ──
  // ══════════════════════════════════════
  sysField("sys_oda_id",               "ID OdA",                    "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.id }}"),
  sysField("sys_oda_numero",           "Numero OdA",                "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.oda_number }}"),
  sysField("sys_oda_supplier_id",      "ID Fornitore",              "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.supplier_id }}"),
  sysField("sys_oda_order_id",         "ID Ordine Cantiere",        "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.order_id }}"),
  sysField("sys_oda_status",           "Stato",                     "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.status }}"),
  sysField("sys_oda_issue_date",       "Data Emissione",            "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.issue_date }}"),
  sysField("sys_oda_expected_del",     "Data Consegna Prevista",    "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.expected_delivery_date }}"),
  sysField("sys_oda_actual_del",       "Data Consegna Effettiva",   "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.actual_delivery_date }}"),
  sysField("sys_oda_subtotal",         "Subtotale",                 "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.subtotal }}"),
  sysField("sys_oda_vat_total",        "IVA Totale",                "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.vat_total }}"),
  sysField("sys_oda_total",            "Totale",                    "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.total }}"),
  sysField("sys_oda_pay_method",       "Metodo Pagamento",          "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.payment_method }}"),
  sysField("sys_oda_pay_terms",        "Condizioni Pagamento",      "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.payment_terms }}"),
  sysField("sys_oda_delivery_addr",    "Indirizzo Consegna",        "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.delivery_address }}"),
  sysField("sys_oda_internal_notes",   "Note Interne",              "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.internal_notes }}"),
  sysField("sys_oda_sup_ref",          "Rif. Fornitore",            "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.supplier_reference }}"),
  sysField("sys_oda_sent_at",          "Inviato Il",                "Ordine Acquisto", "ordine_acquisto", "{{ ordine_acquisto.sent_at }}"),

  // ══════════════════════════════════════
  // ── 9. DDT Ricezione Merce ──
  // ══════════════════════════════════════
  sysField("sys_ddt_id",               "ID DDT",               "DDT Ricezione", "ddt_ricezione", "{{ ddt_ricezione.id }}"),
  sysField("sys_ddt_numero",           "Numero DDT",           "DDT Ricezione", "ddt_ricezione", "{{ ddt_ricezione.numero_ddt }}"),
  sysField("sys_ddt_oda_id",           "ID Ordine Acquisto",   "DDT Ricezione", "ddt_ricezione", "{{ ddt_ricezione.purchase_order_id }}"),
  sysField("sys_ddt_data",             "Data Ricezione",       "DDT Ricezione", "ddt_ricezione", "{{ ddt_ricezione.data_ricezione }}"),
  sysField("sys_ddt_quantita",         "Quantità Ricevuta",    "DDT Ricezione", "ddt_ricezione", "{{ ddt_ricezione.quantita_ricevuta }}"),
  sysField("sys_ddt_stato",            "Stato",                "DDT Ricezione", "ddt_ricezione", "{{ ddt_ricezione.stato }}"),
  sysField("sys_ddt_note",             "Note",                 "DDT Ricezione", "ddt_ricezione", "{{ ddt_ricezione.note }}"),

  // ══════════════════════════════════════
  // ── 10. Costo Aziendale ──
  // ══════════════════════════════════════
  sysField("sys_ca_id",                "ID Costo",         "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.id }}"),
  sysField("sys_ca_name",              "Nome / Descrizione","Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.name }}"),
  sysField("sys_ca_amount",            "Importo",          "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.amount }}"),
  sysField("sys_ca_cost_type",         "Tipo Costo",       "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.cost_type }}"),
  sysField("sys_ca_category",          "Categoria",        "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.category }}"),
  sysField("sys_ca_due_date",          "Data Scadenza",    "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.due_date }}"),
  sysField("sys_ca_is_paid",           "Pagato",           "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.is_paid }}"),
  sysField("sys_ca_paid_date",         "Data Pagamento",   "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.paid_date }}"),
  sysField("sys_ca_pay_method",        "Metodo Pagamento", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.payment_method }}"),
  sysField("sys_ca_recurrence",        "Ricorrenza",       "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.recurrence }}"),
  sysField("sys_ca_supplier_id",       "ID Fornitore",     "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.supplier_id }}"),
  sysField("sys_ca_order_id",          "ID Ordine",        "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.order_id }}"),
  sysField("sys_ca_vat_rate",          "Aliquota IVA",     "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.vat_rate }}"),
  sysField("sys_ca_notes",             "Note",             "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.notes }}"),

  // ══════════════════════════════════════
  // ── 12. Azienda / Profilo Company ──
  // ══════════════════════════════════════
  sysField("sys_co_business_name",     "Ragione Sociale",       "Azienda", "company", "{{ company.business_name }}"),
  sysField("sys_co_email",             "Email",                 "Azienda", "company", "{{ company.email }}"),
  sysField("sys_co_phone",             "Telefono",              "Azienda", "company", "{{ company.phone }}"),
  sysField("sys_co_vat_number",        "Partita IVA",           "Azienda", "company", "{{ company.vat_number }}"),
  sysField("sys_co_fiscal_code",       "Codice Fiscale",        "Azienda", "company", "{{ company.fiscal_code }}"),
  sysField("sys_co_address",           "Indirizzo Sede",        "Azienda", "company", "{{ company.address }}"),
  sysField("sys_co_city",              "Città",                 "Azienda", "company", "{{ company.city }}"),
  sysField("sys_co_province",          "Provincia",             "Azienda", "company", "{{ company.province }}"),
  sysField("sys_co_postal_code",       "CAP",                   "Azienda", "company", "{{ company.postal_code }}"),
  sysField("sys_co_country",           "Paese",                 "Azienda", "company", "{{ company.country }}"),
  sysField("sys_co_website",           "Sito Web",              "Azienda", "company", "{{ company.website }}"),
  sysField("sys_co_pec",               "PEC",                   "Azienda", "company", "{{ company.pec }}"),
  sysField("sys_co_sdi_code",          "Codice SDI",            "Azienda", "company", "{{ company.sdi_code }}"),
  sysField("sys_co_bank_iban",         "IBAN",                  "Azienda", "company", "{{ company.bank_iban }}"),
  sysField("sys_co_bank_holder",       "Intestatario Conto",    "Azienda", "company", "{{ company.bank_account_holder }}"),
  sysField("sys_co_bank_name",         "Nome Banca",            "Azienda", "company", "{{ company.bank_name }}"),
  sysField("sys_co_logo_url",          "Logo URL",              "Azienda", "company", "{{ company.logo_url }}"),
  sysField("sys_co_regime_fiscale",    "Regime Fiscale",        "Azienda", "company", "{{ company.regime_fiscale }}"),

  // ══════════════════════════════════════════════════════════════════════════
  // ── Catalogo Esteso (Sprint C) ─ Prodotto / Articolo ─────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  sysField("sys_prod_id",              "ID Prodotto",           "Prodotto", "product", "{{ product.id }}"),
  sysField("sys_prod_code",            "Codice Articolo",       "Prodotto", "product", "{{ product.code }}"),
  sysField("sys_prod_name",            "Nome / Descrizione",    "Prodotto", "product", "{{ product.name }}"),
  sysField("sys_prod_description",     "Descrizione Estesa",    "Prodotto", "product", "{{ product.description }}"),
  sysField("sys_prod_category",        "Categoria",             "Prodotto", "product", "{{ product.category }}"),
  sysField("sys_prod_family_id",       "Famiglia",              "Prodotto", "product", "{{ product.family_id }}"),
  sysField("sys_prod_supplier_id",     "Fornitore",             "Prodotto", "product", "{{ product.supplier_id }}"),
  sysField("sys_prod_unit",            "Unità di Misura",       "Prodotto", "product", "{{ product.unit }}"),
  sysField("sys_prod_base_price",      "Prezzo Base",           "Prodotto", "product", "{{ product.base_price }}"),
  sysField("sys_prod_list_price",      "Prezzo Listino",        "Prodotto", "product", "{{ product.list_price }}"),
  sysField("sys_prod_cost",            "Costo",                 "Prodotto", "product", "{{ product.cost }}"),
  sysField("sys_prod_margin_pct",      "Margine %",             "Prodotto", "product", "{{ product.margin_pct }}"),
  sysField("sys_prod_vat_rate",        "Aliquota IVA",          "Prodotto", "product", "{{ product.vat_rate }}"),
  sysField("sys_prod_barcode",         "Barcode / EAN",         "Prodotto", "product", "{{ product.barcode }}"),
  sysField("sys_prod_sku",             "SKU",                   "Prodotto", "product", "{{ product.sku }}"),
  sysField("sys_prod_weight",          "Peso (kg)",             "Prodotto", "product", "{{ product.weight }}"),
  sysField("sys_prod_notes",           "Note",                  "Prodotto", "product", "{{ product.notes }}"),
  sysField("sys_prod_active",          "Attivo",                "Prodotto", "product", "{{ product.active }}"),

  // ══════════════════════════════════════════════════════════════════════════
  // ── Catalogo Esteso (Sprint C) ─ Famiglia Prodotto ───────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  sysField("sys_fam_id",               "ID Famiglia",           "Famiglia", "family", "{{ family.id }}"),
  sysField("sys_fam_name",             "Nome Famiglia",         "Famiglia", "family", "{{ family.name }}"),
  sysField("sys_fam_code",             "Codice Famiglia",       "Famiglia", "family", "{{ family.code }}"),
  sysField("sys_fam_parent_id",        "Famiglia Padre",        "Famiglia", "family", "{{ family.parent_id }}"),
  sysField("sys_fam_supplier_id",      "Fornitore di Origine",  "Famiglia", "family", "{{ family.supplier_id }}"),
  sysField("sys_fam_default_margin",   "Margine Default %",     "Famiglia", "family", "{{ family.default_margin_pct }}"),
  sysField("sys_fam_default_markup",   "Ricarico Default %",    "Famiglia", "family", "{{ family.default_markup_pct }}"),
  sysField("sys_fam_description",      "Descrizione",           "Famiglia", "family", "{{ family.description }}"),
  sysField("sys_fam_notes",            "Note",                  "Famiglia", "family", "{{ family.notes }}"),
  sysField("sys_fam_active",           "Attiva",                "Famiglia", "family", "{{ family.active }}"),

  // ══════════════════════════════════════════════════════════════════════════
  // ── Catalogo Esteso (Sprint C) ─ Tariffa / Manodopera ────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  sysField("sys_tar_id",               "ID Tariffa",            "Tariffa", "tariffa", "{{ tariffa.id }}"),
  sysField("sys_tar_nome",             "Nome Tariffa",          "Tariffa", "tariffa", "{{ tariffa.nome }}"),
  sysField("sys_tar_codice",           "Codice Tariffa",        "Tariffa", "tariffa", "{{ tariffa.codice }}"),
  sysField("sys_tar_categoria",        "Categoria (Operaio/Tecnico)", "Tariffa", "tariffa", "{{ tariffa.categoria }}"),
  sysField("sys_tar_qualifica",        "Qualifica / Livello",   "Tariffa", "tariffa", "{{ tariffa.qualifica }}"),
  sysField("sys_tar_costo_orario",     "Costo Orario Base",     "Tariffa", "tariffa", "{{ tariffa.costo_orario }}"),
  sysField("sys_tar_costo_giornaliero","Costo Giornaliero",     "Tariffa", "tariffa", "{{ tariffa.costo_giornaliero }}"),
  sysField("sys_tar_prezzo_orario",    "Prezzo Vendita Orario", "Tariffa", "tariffa", "{{ tariffa.prezzo_orario }}"),
  sysField("sys_tar_margine_pct",      "Margine %",             "Tariffa", "tariffa", "{{ tariffa.margine_pct }}"),
  sysField("sys_tar_ore_giornaliere",  "Ore Giornaliere Std.",  "Tariffa", "tariffa", "{{ tariffa.ore_giornaliere }}"),
  sysField("sys_tar_ccnl",             "CCNL di Riferimento",   "Tariffa", "tariffa", "{{ tariffa.ccnl }}"),
  sysField("sys_tar_valida_dal",       "Valida Dal",            "Tariffa", "tariffa", "{{ tariffa.valida_dal }}"),
  sysField("sys_tar_valida_al",        "Valida Al",             "Tariffa", "tariffa", "{{ tariffa.valida_al }}"),
  sysField("sys_tar_note",             "Note",                  "Tariffa", "tariffa", "{{ tariffa.note }}"),
  sysField("sys_tar_attiva",           "Attiva",                "Tariffa", "tariffa", "{{ tariffa.attiva }}"),
  // ══════════════════════════════════════════════════════════════════════════
  // ── Campi aggiunti il 02/10/2026: colonne reali che mancavano nel dizionario ──
  // Ogni voce è una colonna esistente della tabella dell'oggetto. Per contatto,
  // opportunità, appuntamento, ordine, fattura, preventivo, task e ticket sono
  // anche utilizzabili in email e automazioni (EMAIL_RECORD_FIELDS, stesso elenco:
  // lo garantisce src/test/logic/campiSistemaParita.test.ts).
  // ══════════════════════════════════════════════════════════════════════════
  // ── Contatto ──
  sysField("sys_x_c_created_at", "Data Creazione", "Contatto", "contact", "{{ contact.created_at }}"),
  sysField("sys_x_c_updated_at", "Ultima Modifica", "Contatto", "contact", "{{ contact.updated_at }}"),
  sysField("sys_x_c_region", "Regione", "Contatto", "contact", "{{ contact.region }}"),
  sysField("sys_x_c_follower_id", "Follower (ID)", "Contatto", "contact", "{{ contact.follower_id }}"),
  sysField("sys_x_c_call_center_id", "Call Center (ID)", "Contatto", "contact", "{{ contact.call_center_id }}"),
  sysField("sys_x_c_sede_id", "Sede (ID)", "Contatto", "contact", "{{ contact.sede_id }}"),
  sysField("sys_x_c_stato", "Stato Contatto", "Contatto", "contact", "{{ contact.stato }}"),
  sysField("sys_x_c_tipo", "Tipologia Contatto", "Contatto", "contact", "{{ contact.tipo }}"),
  sysField("sys_x_c_source_channel", "Canale di Provenienza", "Contatto", "contact", "{{ contact.source_channel }}"),
  sysField("sys_x_c_source_campaign_id", "ID Campagna di Origine", "Contatto", "contact", "{{ contact.source_campaign_id }}"),
  sysField("sys_x_c_attr_source", "Attribuzione · Sorgente", "Contatto", "contact", "{{ contact.attr_source }}"),
  sysField("sys_x_c_attr_medium", "Attribuzione · Mezzo", "Contatto", "contact", "{{ contact.attr_medium }}"),
  sysField("sys_x_c_attr_campaign", "Attribuzione · Campagna", "Contatto", "contact", "{{ contact.attr_campaign }}"),
  sysField("sys_x_c_attr_content", "Attribuzione · Contenuto / Inserzione", "Contatto", "contact", "{{ contact.attr_content }}"),
  sysField("sys_x_c_attr_model", "Attribuzione · Modello", "Contatto", "contact", "{{ contact.attr_model }}"),
  sysField("sys_x_c_meta_platform", "Piattaforma Meta (Facebook/Instagram)", "Contatto", "contact", "{{ contact.meta_platform }}"),
  sysField("sys_x_c_meta_campaign_id", "ID Campagna Meta", "Contatto", "contact", "{{ contact.meta_campaign_id }}"),
  sysField("sys_x_c_meta_adset_id", "ID Gruppo Inserzioni Meta", "Contatto", "contact", "{{ contact.meta_adset_id }}"),
  sysField("sys_x_c_meta_ad_id", "ID Inserzione Meta", "Contatto", "contact", "{{ contact.meta_ad_id }}"),
  sysField("sys_x_c_meta_lead_id", "ID Lead Meta", "Contatto", "contact", "{{ contact.meta_lead_id }}"),
  sysField("sys_x_c_fbclid", "Facebook Click ID", "Contatto", "contact", "{{ contact.fbclid }}"),
  sysField("sys_x_c_google_campaign_id", "ID Campagna Google", "Contatto", "contact", "{{ contact.google_campaign_id }}"),
  sysField("sys_x_c_google_ad_group_id", "ID Gruppo Annunci Google", "Contatto", "contact", "{{ contact.google_ad_group_id }}"),
  sysField("sys_x_c_google_ad_id", "ID Annuncio Google", "Contatto", "contact", "{{ contact.google_ad_id }}"),
  sysField("sys_x_c_gclid", "Google Click ID", "Contatto", "contact", "{{ contact.gclid }}"),
  sysField("sys_x_c_icp_score", "ICP Score", "Contatto", "contact", "{{ contact.icp_score }}"),
  sysField("sys_x_c_is_decision_maker", "È Decisore", "Contatto", "contact", "{{ contact.is_decision_maker }}"),
  sysField("sys_x_c_ai_score", "Punteggio AI", "Contatto", "contact", "{{ contact.ai_score }}"),
  sysField("sys_x_c_ai_score_tier", "Fascia Punteggio AI", "Contatto", "contact", "{{ contact.ai_score_tier }}"),
  sysField("sys_x_c_ai_next_action", "Prossima Azione Suggerita (AI)", "Contatto", "contact", "{{ contact.ai_next_action }}"),
  sysField("sys_x_c_ai_predicted_value_eur", "Valore Previsto (AI)", "Contatto", "contact", "{{ contact.ai_predicted_value_eur }}"),
  sysField("sys_x_c_optout_at", "Data Opt-out", "Contatto", "contact", "{{ contact.optout_at }}"),
  sysField("sys_x_c_optout_reason", "Motivo Opt-out", "Contatto", "contact", "{{ contact.optout_reason }}"),
  sysField("sys_x_c_opt_out", "Opt-out Generale", "Contatto", "contact", "{{ contact.opt_out }}"),
  sysField("sys_x_c_unsubscribed_at", "Data Disiscrizione", "Contatto", "contact", "{{ contact.unsubscribed_at }}"),
  sysField("sys_x_c_marketing_consent", "Consenso Marketing", "Contatto", "contact", "{{ contact.marketing_consent }}"),
  sysField("sys_x_c_marketing_consent_at", "Data Consenso Marketing", "Contatto", "contact", "{{ contact.marketing_consent_at }}"),
  sysField("sys_x_c_marketing_consent_source", "Fonte Consenso Marketing", "Contatto", "contact", "{{ contact.marketing_consent_source }}"),
  sysField("sys_x_c_ricontatta_dopo", "Ricontatta Dopo", "Contatto", "contact", "{{ contact.ricontatta_dopo }}"),
  sysField("sys_x_c_fatturato", "Fatturato Azienda", "Contatto", "contact", "{{ contact.fatturato }}"),
  sysField("sys_x_c_dipendenti", "N° Dipendenti", "Contatto", "contact", "{{ contact.dipendenti }}"),
  sysField("sys_x_c_company_size", "Dimensione Azienda", "Contatto", "contact", "{{ contact.company_size }}"),
  sysField("sys_x_c_ateco_code", "Codice ATECO", "Contatto", "contact", "{{ contact.ateco_code }}"),
  sysField("sys_x_c_lat", "Latitudine", "Contatto", "contact", "{{ contact.lat }}"),
  sysField("sys_x_c_lng", "Longitudine", "Contatto", "contact", "{{ contact.lng }}"),
  sysField("sys_x_c_created_by", "Creato Da (ID)", "Contatto", "contact", "{{ contact.created_by }}"),
  // ── Opportunità ──
  sysField("sys_x_opp_created_at", "Data Creazione", "Opportunità", "opportunity_details", "{{ opportunity.created_at }}"),
  sysField("sys_x_opp_updated_at", "Ultima Modifica", "Opportunità", "opportunity_details", "{{ opportunity.updated_at }}"),
  sysField("sys_x_opp_last_activity_at", "Ultima Attività", "Opportunità", "opportunity_details", "{{ opportunity.last_activity_at }}"),
  sysField("sys_x_opp_stage_changed_at", "Data Cambio Fase", "Opportunità", "opportunity_details", "{{ opportunity.stage_changed_at }}"),
  sysField("sys_x_opp_won_at", "Data Vinta", "Opportunità", "opportunity_details", "{{ opportunity.won_at }}"),
  sysField("sys_x_opp_lost_at", "Data Persa", "Opportunità", "opportunity_details", "{{ opportunity.lost_at }}"),
  sysField("sys_x_opp_tipo_opportunita", "Tipo Opportunità", "Opportunità", "opportunity_details", "{{ opportunity.tipo_opportunita }}"),
  sysField("sys_x_opp_follower_id", "Follower (ID)", "Opportunità", "opportunity_details", "{{ opportunity.follower_id }}"),
  sysField("sys_x_opp_call_center_id", "Call Center (ID)", "Opportunità", "opportunity_details", "{{ opportunity.call_center_id }}"),
  sysField("sys_x_opp_product_line_id", "Linea Prodotto (ID)", "Opportunità", "opportunity_details", "{{ opportunity.product_line_id }}"),
  sysField("sys_x_opp_package_id", "Pacchetto (ID)", "Opportunità", "opportunity_details", "{{ opportunity.package_id }}"),
  sysField("sys_x_opp_fv_progetto_id", "Progetto Fotovoltaico (ID)", "Opportunità", "opportunity_details", "{{ opportunity.fv_progetto_id }}"),
  sysField("sys_x_opp_meta_campaign_id", "ID Campagna Meta", "Opportunità", "opportunity_details", "{{ opportunity.meta_campaign_id }}"),
  sysField("sys_x_opp_meta_adset_id", "ID Gruppo Inserzioni Meta", "Opportunità", "opportunity_details", "{{ opportunity.meta_adset_id }}"),
  sysField("sys_x_opp_meta_ad_id", "ID Inserzione Meta", "Opportunità", "opportunity_details", "{{ opportunity.meta_ad_id }}"),
  sysField("sys_x_opp_meta_lead_id", "ID Lead Meta", "Opportunità", "opportunity_details", "{{ opportunity.meta_lead_id }}"),
  sysField("sys_x_opp_google_campaign_id", "ID Campagna Google", "Opportunità", "opportunity_details", "{{ opportunity.google_campaign_id }}"),
  sysField("sys_x_opp_google_ad_group_id", "ID Gruppo Annunci Google", "Opportunità", "opportunity_details", "{{ opportunity.google_ad_group_id }}"),
  sysField("sys_x_opp_google_ad_id", "ID Annuncio Google", "Opportunità", "opportunity_details", "{{ opportunity.google_ad_id }}"),
  sysField("sys_x_opp_gclid", "Google Click ID", "Opportunità", "opportunity_details", "{{ opportunity.gclid }}"),
  sysField("sys_x_opp_created_by", "Creato Da (ID)", "Opportunità", "opportunity_details", "{{ opportunity.created_by }}"),
  // ── Appuntamento ──
  sysField("sys_x_apt_created_at", "Data Creazione", "Appuntamento", "appointment", "{{ appointment.created_at }}"),
  sysField("sys_x_apt_updated_at", "Ultima Modifica", "Appuntamento", "appointment", "{{ appointment.updated_at }}"),
  sysField("sys_x_apt_calendar_id", "Calendario (ID)", "Appuntamento", "appointment", "{{ appointment.calendar_id }}"),
  sysField("sys_x_apt_opportunity_id", "ID Opportunità", "Appuntamento", "appointment", "{{ appointment.opportunity_id }}"),
  sysField("sys_x_apt_address_line", "Via / Piazza", "Appuntamento", "appointment", "{{ appointment.address_line }}"),
  sysField("sys_x_apt_address_city", "Città", "Appuntamento", "appointment", "{{ appointment.address_city }}"),
  sysField("sys_x_apt_address_postal_code", "CAP", "Appuntamento", "appointment", "{{ appointment.address_postal_code }}"),
  sysField("sys_x_apt_address_province", "Provincia", "Appuntamento", "appointment", "{{ appointment.address_province }}"),
  sysField("sys_x_apt_address_country", "Nazione", "Appuntamento", "appointment", "{{ appointment.address_country }}"),
  sysField("sys_x_apt_address_notes", "Note Indirizzo", "Appuntamento", "appointment", "{{ appointment.address_notes }}"),
  sysField("sys_x_apt_lat", "Latitudine", "Appuntamento", "appointment", "{{ appointment.lat }}"),
  sysField("sys_x_apt_lng", "Longitudine", "Appuntamento", "appointment", "{{ appointment.lng }}"),
  sysField("sys_x_apt_meeting_url", "Link Videochiamata", "Appuntamento", "appointment", "{{ appointment.meeting_url }}"),
  sysField("sys_x_apt_meeting_provider", "Piattaforma Videochiamata", "Appuntamento", "appointment", "{{ appointment.meeting_provider }}"),
  sysField("sys_x_apt_meeting_status", "Stato Videochiamata", "Appuntamento", "appointment", "{{ appointment.meeting_status }}"),
  sysField("sys_x_apt_booking_email", "Email di Prenotazione", "Appuntamento", "appointment", "{{ appointment.booking_email }}"),
  sysField("sys_x_apt_cancelled_at", "Data Annullamento", "Appuntamento", "appointment", "{{ appointment.cancelled_at }}"),
  sysField("sys_x_apt_riprogrammato_at", "Data Riprogrammazione", "Appuntamento", "appointment", "{{ appointment.riprogrammato_at }}"),
  sysField("sys_x_apt_conferma_inviata_at", "Conferma Inviata Il", "Appuntamento", "appointment", "{{ appointment.conferma_inviata_at }}"),
  sysField("sys_x_apt_is_blocked_slot", "Slot Bloccato", "Appuntamento", "appointment", "{{ appointment.is_blocked_slot }}"),
  sysField("sys_x_apt_created_by", "Creato Da (ID)", "Appuntamento", "appointment", "{{ appointment.created_by }}"),
  sysField("sys_x_apt_meta_campaign_id", "ID Campagna Meta", "Appuntamento", "appointment", "{{ appointment.meta_campaign_id }}"),
  sysField("sys_x_apt_google_campaign_id", "ID Campagna Google", "Appuntamento", "appointment", "{{ appointment.google_campaign_id }}"),
  // ── Ordine ──
  sysField("sys_x_ord_created_at", "Data Creazione", "Ordine", "order", "{{ order.created_at }}"),
  sysField("sys_x_ord_updated_at", "Ultima Modifica", "Ordine", "order", "{{ order.updated_at }}"),
  sysField("sys_x_ord_status", "Stato", "Ordine", "order", "{{ order.status }}"),
  sysField("sys_x_ord_fulfillment_status", "Stato Evasione", "Ordine", "order", "{{ order.fulfillment_status }}"),
  sysField("sys_x_ord_order_type", "Tipo Ordine", "Ordine", "order", "{{ order.order_type }}"),
  sysField("sys_x_ord_percentuale_avanzamento", "Avanzamento Lavori %", "Ordine", "order", "{{ order.percentuale_avanzamento }}"),
  sysField("sys_x_ord_tipo_lavoro", "Tipo Lavoro", "Ordine", "order", "{{ order.tipo_lavoro }}"),
  sysField("sys_x_ord_client_name", "Nome Cliente", "Ordine", "order", "{{ order.client_name }}"),
  sysField("sys_x_ord_client_email", "Email Cliente", "Ordine", "order", "{{ order.client_email }}"),
  sysField("sys_x_ord_client_phone", "Telefono Cliente", "Ordine", "order", "{{ order.client_phone }}"),
  sysField("sys_x_ord_client_company", "Azienda Cliente", "Ordine", "order", "{{ order.client_company }}"),
  sysField("sys_x_ord_client_address", "Indirizzo Cliente", "Ordine", "order", "{{ order.client_address }}"),
  sysField("sys_x_ord_indirizzo_lavori", "Indirizzo Lavori", "Ordine", "order", "{{ order.indirizzo_lavori }}"),
  sysField("sys_x_ord_work_address", "Indirizzo Cantiere", "Ordine", "order", "{{ order.work_address }}"),
  sysField("sys_x_ord_work_description", "Descrizione Lavori", "Ordine", "order", "{{ order.work_description }}"),
  sysField("sys_x_ord_materials_location", "Dove Sono i Materiali", "Ordine", "order", "{{ order.materials_location }}"),
  sysField("sys_x_ord_quote_id", "ID Preventivo", "Ordine", "order", "{{ order.quote_id }}"),
  sysField("sys_x_ord_quote_number", "Numero Preventivo", "Ordine", "order", "{{ order.quote_number }}"),
  sysField("sys_x_ord_opportunity_id", "ID Opportunità", "Ordine", "order", "{{ order.opportunity_id }}"),
  sysField("sys_x_ord_sede_id", "Sede (ID)", "Ordine", "order", "{{ order.sede_id }}"),
  sysField("sys_x_ord_destination_warehouse_id", "Magazzino Destinazione (ID)", "Ordine", "order", "{{ order.destination_warehouse_id }}"),
  sysField("sys_x_ord_deposit_expected_date", "Data Prevista Acconto", "Ordine", "order", "{{ order.deposit_expected_date }}"),
  sysField("sys_x_ord_deposit_2_expected_date", "Data Prevista 2° Acconto", "Ordine", "order", "{{ order.deposit_2_expected_date }}"),
  sysField("sys_x_ord_balance_expected_date", "Data Prevista Saldo", "Ordine", "order", "{{ order.balance_expected_date }}"),
  sysField("sys_x_ord_financing_expected_date", "Data Prevista Finanziamento", "Ordine", "order", "{{ order.financing_expected_date }}"),
  sysField("sys_x_ord_financing_paid_date", "Data Pagamento Finanziamento", "Ordine", "order", "{{ order.financing_paid_date }}"),
  sysField("sys_x_ord_work_start_time", "Ora Inizio Lavori", "Ordine", "order", "{{ order.work_start_time }}"),
  sysField("sys_x_ord_work_end_time", "Ora Fine Lavori", "Ordine", "order", "{{ order.work_end_time }}"),
  sysField("sys_x_ord_next_action", "Prossima Azione", "Ordine", "order", "{{ order.next_action }}"),
  sysField("sys_x_ord_next_action_date", "Data Prossima Azione", "Ordine", "order", "{{ order.next_action_date }}"),
  sysField("sys_x_ord_distanza_sede_km", "Distanza dalla Sede (km)", "Ordine", "order", "{{ order.distanza_sede_km }}"),
  sysField("sys_x_ord_distanza_sede_minuti", "Distanza dalla Sede (min)", "Ordine", "order", "{{ order.distanza_sede_minuti }}"),
  sysField("sys_x_ord_dl_notification_email", "Email Direttore Lavori", "Ordine", "order", "{{ order.dl_notification_email }}"),
  sysField("sys_x_ord_dl_notification_phone", "Telefono Direttore Lavori", "Ordine", "order", "{{ order.dl_notification_phone }}"),
  sysField("sys_x_ord_capomastro_user_id", "Capomastro (ID)", "Ordine", "order", "{{ order.capomastro_user_id }}"),
  sysField("sys_x_ord_created_by", "Creato Da (ID)", "Ordine", "order", "{{ order.created_by }}"),
  // ── Fattura ──
  sysField("sys_x_inv_progressive_number", "Numero Progressivo", "Fattura", "invoice", "{{ invoice.progressive_number }}"),
  sysField("sys_x_inv_payment_date", "Data Pagamento", "Fattura", "invoice", "{{ invoice.payment_date }}"),
  sysField("sys_x_inv_credited_invoice_id", "Fattura Stornata (ID)", "Fattura", "invoice", "{{ invoice.credited_invoice_id }}"),
  sysField("sys_x_inv_footer_text", "Testo a Piè di Pagina", "Fattura", "invoice", "{{ invoice.footer_text }}"),
  sysField("sys_x_inv_external_status", "Stato Invio SDI", "Fattura", "invoice", "{{ invoice.external_status }}"),
  sysField("sys_x_inv_external_sdi_id", "ID SDI", "Fattura", "invoice", "{{ invoice.external_sdi_id }}"),
  sysField("sys_x_inv_external_provider", "Provider Fatturazione", "Fattura", "invoice", "{{ invoice.external_provider }}"),
  sysField("sys_x_inv_pdf_generated_at", "PDF Generato Il", "Fattura", "invoice", "{{ invoice.pdf_generated_at }}"),
  sysField("sys_x_inv_created_at", "Data Creazione", "Fattura", "invoice", "{{ invoice.created_at }}"),
  sysField("sys_x_inv_updated_at", "Ultima Modifica", "Fattura", "invoice", "{{ invoice.updated_at }}"),
  sysField("sys_x_inv_sede_id", "Sede (ID)", "Fattura", "invoice", "{{ invoice.sede_id }}"),
  sysField("sys_x_inv_created_by", "Creato Da (ID)", "Fattura", "invoice", "{{ invoice.created_by }}"),
  // ── Preventivo ──
  sysField("sys_x_qt_created_at", "Data Creazione", "Preventivo", "quote", "{{ quote.created_at }}"),
  sysField("sys_x_qt_updated_at", "Ultima Modifica", "Preventivo", "quote", "{{ quote.updated_at }}"),
  sysField("sys_x_qt_notes", "Note", "Preventivo", "quote", "{{ quote.notes }}"),
  sysField("sys_x_qt_tipo_lavoro", "Tipo Lavoro", "Preventivo", "quote", "{{ quote.tipo_lavoro }}"),
  sysField("sys_x_qt_indirizzo_lavori", "Indirizzo Lavori", "Preventivo", "quote", "{{ quote.indirizzo_lavori }}"),
  sysField("sys_x_qt_piano_installazione", "Piano Installazione", "Preventivo", "quote", "{{ quote.piano_installazione }}"),
  sysField("sys_x_qt_km_cantiere", "Km Cantiere", "Preventivo", "quote", "{{ quote.km_cantiere }}"),
  sysField("sys_x_qt_source", "Origine Preventivo", "Preventivo", "quote", "{{ quote.source }}"),
  sysField("sys_x_qt_signed_by_name", "Firmato Da", "Preventivo", "quote", "{{ quote.signed_by_name }}"),
  sysField("sys_x_qt_refused_at", "Data Rifiuto", "Preventivo", "quote", "{{ quote.refused_at }}"),
  sysField("sys_x_qt_refused_reason", "Motivo Rifiuto", "Preventivo", "quote", "{{ quote.refused_reason }}"),
  sysField("sys_x_qt_approval_status", "Stato Approvazione", "Preventivo", "quote", "{{ quote.approval_status }}"),
  sysField("sys_x_qt_sconto_richiesto_pct", "Sconto Richiesto %", "Preventivo", "quote", "{{ quote.sconto_richiesto_pct }}"),
  sysField("sys_x_qt_sconto_autorizzato_pct", "Sconto Autorizzato %", "Preventivo", "quote", "{{ quote.sconto_autorizzato_pct }}"),
  sysField("sys_x_qt_margine_totale_percentuale", "Margine Totale %", "Preventivo", "quote", "{{ quote.margine_totale_percentuale }}"),
  sysField("sys_x_qt_totale_costo_interno", "Totale Costo Interno", "Preventivo", "quote", "{{ quote.totale_costo_interno }}"),
  sysField("sys_x_qt_totale_overhead", "Totale Overhead", "Preventivo", "quote", "{{ quote.totale_overhead }}"),
  sysField("sys_x_qt_payment_method", "Metodo di Pagamento", "Preventivo", "quote", "{{ quote.payment_method }}"),
  sysField("sys_x_qt_revision_number", "N° Revisione", "Preventivo", "quote", "{{ quote.revision_number }}"),
  sysField("sys_x_qt_parent_quote_id", "Preventivo Originale (ID)", "Preventivo", "quote", "{{ quote.parent_quote_id }}"),
  sysField("sys_x_qt_financing_amount", "Importo Finanziato", "Preventivo", "quote", "{{ quote.financing_amount }}"),
  sysField("sys_x_qt_financing_num_installments", "N° Rate Finanziamento", "Preventivo", "quote", "{{ quote.financing_num_installments }}"),
  sysField("sys_x_qt_financing_monthly_rate", "Rata Mensile Finanziamento", "Preventivo", "quote", "{{ quote.financing_monthly_rate }}"),
  sysField("sys_x_qt_financing_total_due", "Totale Dovuto Finanziamento", "Preventivo", "quote", "{{ quote.financing_total_due }}"),
  sysField("sys_x_qt_ai_close_probability_pct", "Probabilità Chiusura (AI) %", "Preventivo", "quote", "{{ quote.ai_close_probability_pct }}"),
  sysField("sys_x_qt_ai_predicted_close_date", "Data Chiusura Prevista (AI)", "Preventivo", "quote", "{{ quote.ai_predicted_close_date }}"),
  sysField("sys_x_qt_salesperson_id", "Venditore (ID)", "Preventivo", "quote", "{{ quote.salesperson_id }}"),
  sysField("sys_x_qt_template_id", "Modello (ID)", "Preventivo", "quote", "{{ quote.template_id }}"),
  sysField("sys_x_qt_sede_id", "Sede (ID)", "Preventivo", "quote", "{{ quote.sede_id }}"),
  sysField("sys_x_qt_created_by", "Creato Da (ID)", "Preventivo", "quote", "{{ quote.created_by }}"),
  // ── Ticket ──
  sysField("sys_x_tk_created_at", "Data Creazione", "Ticket", "ticket", "{{ ticket.created_at }}"),
  sysField("sys_x_tk_updated_at", "Ultima Modifica", "Ticket", "ticket", "{{ ticket.updated_at }}"),
  sysField("sys_x_tk_created_by", "Creato Da (ID)", "Ticket", "ticket", "{{ ticket.created_by }}"),
  sysField("sys_x_tk_fonte", "Fonte", "Ticket", "ticket", "{{ ticket.fonte }}"),
  // ── Intervento ──
  sysField("sys_x_int_titolo", "Titolo", "Intervento", "intervento", "{{ intervento.titolo }}"),
  sysField("sys_x_int_descrizione", "Descrizione", "Intervento", "intervento", "{{ intervento.descrizione }}"),
  sysField("sys_x_int_priorita", "Priorità (IT)", "Intervento", "intervento", "{{ intervento.priorita }}"),
  sysField("sys_x_int_fonte", "Fonte Richiesta", "Intervento", "intervento", "{{ intervento.fonte }}"),
  sysField("sys_x_int_created_at", "Data Creazione", "Intervento", "intervento", "{{ intervento.created_at }}"),
  sysField("sys_x_int_updated_at", "Ultima Modifica", "Intervento", "intervento", "{{ intervento.updated_at }}"),
  sysField("sys_x_int_tipo_impianto_id", "Tipo Impianto (ID)", "Intervento", "intervento", "{{ intervento.tipo_impianto_id }}"),
  sysField("sys_x_int_tipo_intervento_id", "Tipo Intervento (ID)", "Intervento", "intervento", "{{ intervento.tipo_intervento_id }}"),
  sysField("sys_x_int_squadra_id", "Squadra (ID)", "Intervento", "intervento", "{{ intervento.squadra_id }}"),
  sysField("sys_x_int_a_pagamento", "A Pagamento", "Intervento", "intervento", "{{ intervento.a_pagamento }}"),
  sysField("sys_x_int_motivo_gratuito", "Motivo Gratuità", "Intervento", "intervento", "{{ intervento.motivo_gratuito }}"),
  sysField("sys_x_int_importo_preventivato", "Importo Preventivato", "Intervento", "intervento", "{{ intervento.importo_preventivato }}"),
  sysField("sys_x_int_importo_finale", "Importo Finale", "Intervento", "intervento", "{{ intervento.importo_finale }}"),
  sysField("sys_x_int_pagato", "Pagato", "Intervento", "intervento", "{{ intervento.pagato }}"),
  sysField("sys_x_int_data_pagamento", "Data Pagamento", "Intervento", "intervento", "{{ intervento.data_pagamento }}"),
  sysField("sys_x_int_metodo_pagamento", "Metodo Pagamento", "Intervento", "intervento", "{{ intervento.metodo_pagamento }}"),
  sysField("sys_x_int_note_pagamento", "Note Pagamento", "Intervento", "intervento", "{{ intervento.note_pagamento }}"),
  sysField("sys_x_int_ore_effettive", "Ore Effettive", "Intervento", "intervento", "{{ intervento.ore_effettive }}"),
  sysField("sys_x_int_costo_orario_applicato", "Costo Orario Applicato", "Intervento", "intervento", "{{ intervento.costo_orario_applicato }}"),
  sysField("sys_x_int_costo_trasferta", "Costo Trasferta", "Intervento", "intervento", "{{ intervento.costo_trasferta }}"),
  sysField("sys_x_int_costo_materiale", "Costo Materiale", "Intervento", "intervento", "{{ intervento.costo_materiale }}"),
  sysField("sys_x_int_merce_richiesta", "Merce Richiesta", "Intervento", "intervento", "{{ intervento.merce_richiesta }}"),
  sysField("sys_x_int_merce_stato", "Stato Merce", "Intervento", "intervento", "{{ intervento.merce_stato }}"),
  sysField("sys_x_int_merce_mancante", "Merce Mancante", "Intervento", "intervento", "{{ intervento.merce_mancante }}"),
  sysField("sys_x_int_merce_arrivata_at", "Merce Arrivata Il", "Intervento", "intervento", "{{ intervento.merce_arrivata_at }}"),
  sysField("sys_x_int_richiami_count", "N° Richiami", "Intervento", "intervento", "{{ intervento.richiami_count }}"),
  sysField("sys_x_int_ultimo_richiamo_at", "Ultimo Richiamo", "Intervento", "intervento", "{{ intervento.ultimo_richiamo_at }}"),
  sysField("sys_x_int_note_richiami", "Note Richiami", "Intervento", "intervento", "{{ intervento.note_richiami }}"),
  // ── Task ──
  sysField("sys_x_tsk_created_at", "Data Creazione", "Task", "task", "{{ task.created_at }}"),
  sysField("sys_x_tsk_updated_at", "Ultima Modifica", "Task", "task", "{{ task.updated_at }}"),
  sysField("sys_x_tsk_created_by", "Creato Da (ID)", "Task", "task", "{{ task.created_by }}"),
  sysField("sys_x_tsk_is_recurring", "Ricorrente", "Task", "task", "{{ task.is_recurring }}"),
  sysField("sys_x_tsk_recurrence_rule", "Regola Ricorrenza", "Task", "task", "{{ task.recurrence_rule }}"),
  sysField("sys_x_tsk_recurrence_end_date", "Fine Ricorrenza", "Task", "task", "{{ task.recurrence_end_date }}"),
  sysField("sys_x_tsk_estimated_hours", "Ore Stimate", "Task", "task", "{{ task.estimated_hours }}"),
  sysField("sys_x_tsk_actual_hours", "Ore Effettive", "Task", "task", "{{ task.actual_hours }}"),
  sysField("sys_x_tsk_parent_task_id", "Task Padre (ID)", "Task", "task", "{{ task.parent_task_id }}"),
  sysField("sys_x_tsk_ufficio_id", "Ufficio (ID)", "Task", "task", "{{ task.ufficio_id }}"),
  // ── Dipendente ──
  sysField("sys_x_emp_created_at", "Data Creazione", "Dipendente", "employee", "{{ employee.created_at }}"),
  sysField("sys_x_emp_updated_at", "Ultima Modifica", "Dipendente", "employee", "{{ employee.updated_at }}"),
  sysField("sys_x_emp_user_id", "Utente (ID)", "Dipendente", "employee", "{{ employee.user_id }}"),
  sysField("sys_x_emp_area", "Area", "Dipendente", "employee", "{{ employee.area }}"),
  sysField("sys_x_emp_phone_whatsapp", "WhatsApp", "Dipendente", "employee", "{{ employee.phone_whatsapp }}"),
  sysField("sys_x_emp_qualifica", "Qualifica", "Dipendente", "employee", "{{ employee.qualifica }}"),
  sysField("sys_x_emp_livello_inquadramento", "Livello Inquadramento", "Dipendente", "employee", "{{ employee.livello_inquadramento }}"),
  sysField("sys_x_emp_ccnl_applicato", "CCNL Applicato", "Dipendente", "employee", "{{ employee.ccnl_applicato }}"),
  sysField("sys_x_emp_data_assunzione", "Data Assunzione (HR)", "Dipendente", "employee", "{{ employee.data_assunzione }}"),
  sysField("sys_x_emp_data_inizio_lavoro", "Data Inizio Lavoro", "Dipendente", "employee", "{{ employee.data_inizio_lavoro }}"),
  sysField("sys_x_emp_retribuzione_lorda_annua", "Retribuzione Lorda Annua", "Dipendente", "employee", "{{ employee.retribuzione_lorda_annua }}"),
  sysField("sys_x_emp_ore_settimana", "Ore Settimanali", "Dipendente", "employee", "{{ employee.ore_settimana }}"),
  sysField("sys_x_emp_costo_orario", "Costo Orario (HR)", "Dipendente", "employee", "{{ employee.costo_orario }}"),
  sysField("sys_x_emp_onboarding_status", "Stato Onboarding", "Dipendente", "employee", "{{ employee.onboarding_status }}"),
  sysField("sys_x_emp_onboarding_started_at", "Onboarding Iniziato Il", "Dipendente", "employee", "{{ employee.onboarding_started_at }}"),
  sysField("sys_x_emp_onboarding_completed_at", "Onboarding Completato Il", "Dipendente", "employee", "{{ employee.onboarding_completed_at }}"),
  sysField("sys_x_emp_visita_medica_data", "Data Visita Medica", "Dipendente", "employee", "{{ employee.visita_medica_data }}"),
  sysField("sys_x_emp_visita_medica_esito", "Esito Visita Medica", "Dipendente", "employee", "{{ employee.visita_medica_esito }}"),
  sysField("sys_x_emp_formazione_sicurezza_completed", "Formazione Sicurezza Completata", "Dipendente", "employee", "{{ employee.formazione_sicurezza_completed }}"),
  sysField("sys_x_emp_formazione_sicurezza_data", "Data Formazione Sicurezza", "Dipendente", "employee", "{{ employee.formazione_sicurezza_data }}"),
  sysField("sys_x_emp_formazione_sicurezza_scadenza", "Scadenza Formazione Sicurezza", "Dipendente", "employee", "{{ employee.formazione_sicurezza_scadenza }}"),
  sysField("sys_x_emp_dpi_consegnati", "DPI Consegnati", "Dipendente", "employee", "{{ employee.dpi_consegnati }}"),
  sysField("sys_x_emp_dpi_consegna_data", "Data Consegna DPI", "Dipendente", "employee", "{{ employee.dpi_consegna_data }}"),
  sysField("sys_x_emp_unilav_protocollo", "Protocollo UNILAV", "Dipendente", "employee", "{{ employee.unilav_protocollo }}"),
  // ── Candidato (Selezione) ──
  sysField("sys_x_cand_updated_at", "Ultima Modifica", "Candidato (Selezione)", "candidato", "{{ candidato.updated_at }}"),
  sysField("sys_x_cand_fase_id", "Fase Selezione (ID)", "Candidato (Selezione)", "candidato", "{{ candidato.fase_id }}"),
  sysField("sys_x_cand_hr_profilo_id", "Profilo HR (ID)", "Candidato (Selezione)", "candidato", "{{ candidato.hr_profilo_id }}"),
  // ── Colloquio Candidato ──
  sysField("sys_x_coll_candidato_id", "Candidato (ID)", "Colloquio Candidato", "colloquio", "{{ colloquio.candidato_id }}"),
  sysField("sys_x_coll_appointment_id", "Appuntamento (ID)", "Colloquio Candidato", "colloquio", "{{ colloquio.appointment_id }}"),
  sysField("sys_x_coll_created_at", "Data Creazione", "Colloquio Candidato", "colloquio", "{{ colloquio.created_at }}"),
  // ── Magazzino ──
  sysField("sys_x_wh_created_at", "Data Creazione", "Magazzino", "warehouse", "{{ warehouse.created_at }}"),
  sysField("sys_x_wh_updated_at", "Ultima Modifica", "Magazzino", "warehouse", "{{ warehouse.updated_at }}"),
  sysField("sys_x_wh_warehouse_id", "Magazzino (ID)", "Magazzino", "warehouse", "{{ warehouse.warehouse_id }}"),
  sysField("sys_x_wh_section_id", "Zona (ID)", "Magazzino", "warehouse", "{{ warehouse.section_id }}"),
  sysField("sys_x_wh_barcode", "Codice a Barre", "Magazzino", "warehouse", "{{ warehouse.barcode }}"),
  sysField("sys_x_wh_internal_code", "Codice Interno", "Magazzino", "warehouse", "{{ warehouse.internal_code }}"),
  sysField("sys_x_wh_tracking_mode", "Modalità Tracciamento", "Magazzino", "warehouse", "{{ warehouse.tracking_mode }}"),
  sysField("sys_x_wh_requires_warranty", "Richiede Garanzia", "Magazzino", "warehouse", "{{ warehouse.requires_warranty }}"),
  sysField("sys_x_wh_default_warranty_months", "Garanzia (mesi)", "Magazzino", "warehouse", "{{ warehouse.default_warranty_months }}"),
  sysField("sys_x_wh_article_family_id", "Famiglia Articolo (ID)", "Magazzino", "warehouse", "{{ warehouse.article_family_id }}"),
  // ── Utente ──
  sysField("sys_x_usr_created_at", "Data Creazione", "Utente", "user", "{{ user.created_at }}"),
  sysField("sys_x_usr_updated_at", "Ultima Modifica", "Utente", "user", "{{ user.updated_at }}"),
  sysField("sys_x_usr_last_login_at", "Ultimo Accesso", "Utente", "user", "{{ user.last_login_at }}"),
  sysField("sys_x_usr_is_business", "È un'Azienda", "Utente", "user", "{{ user.is_business }}"),
  sysField("sys_x_usr_business_name", "Ragione Sociale", "Utente", "user", "{{ user.business_name }}"),
  sysField("sys_x_usr_vat_number", "Partita IVA", "Utente", "user", "{{ user.vat_number }}"),
  sysField("sys_x_usr_city", "Città", "Utente", "user", "{{ user.city }}"),
  sysField("sys_x_usr_postal_code", "CAP", "Utente", "user", "{{ user.postal_code }}"),
  sysField("sys_x_usr_province", "Provincia", "Utente", "user", "{{ user.province }}"),
  sysField("sys_x_usr_country", "Nazione", "Utente", "user", "{{ user.country }}"),
  sysField("sys_x_usr_site_city", "Città Sede", "Utente", "user", "{{ user.site_city }}"),
  sysField("sys_x_usr_site_postal_code", "CAP Sede", "Utente", "user", "{{ user.site_postal_code }}"),
  sysField("sys_x_usr_site_province", "Provincia Sede", "Utente", "user", "{{ user.site_province }}"),
  sysField("sys_x_usr_customer_type", "Tipo Cliente", "Utente", "user", "{{ user.customer_type }}"),
  sysField("sys_x_usr_preferred_briefing_channel", "Canale Briefing Preferito", "Utente", "user", "{{ user.preferred_briefing_channel }}"),
  sysField("sys_x_usr_is_blocked", "Bloccato", "Utente", "user", "{{ user.is_blocked }}"),
  sysField("sys_x_usr_block_reason", "Motivo Blocco", "Utente", "user", "{{ user.block_reason }}"),
  sysField("sys_x_usr_area", "Area", "Utente", "user", "{{ user.area }}"),
  sysField("sys_x_usr_marketing_contact_id", "Contatto CRM (ID)", "Utente", "user", "{{ user.marketing_contact_id }}"),
  // ── Venditore ──
  sysField("sys_x_sp_created_at", "Data Creazione", "Venditore", "salesperson", "{{ salesperson.created_at }}"),
  sysField("sys_x_sp_updated_at", "Ultima Modifica", "Venditore", "salesperson", "{{ salesperson.updated_at }}"),
  sysField("sys_x_sp_user_id", "Utente (ID)", "Venditore", "salesperson", "{{ salesperson.user_id }}"),
  sysField("sys_x_sp_compensation_mode", "Modalità Compenso", "Venditore", "salesperson", "{{ salesperson.compensation_mode }}"),
  sysField("sys_x_sp_fixed_monthly_eur", "Fisso Mensile", "Venditore", "salesperson", "{{ salesperson.fixed_monthly_eur }}"),
  sysField("sys_x_sp_notes", "Note", "Venditore", "salesperson", "{{ salesperson.notes }}"),
  // ── Squadra Esterna ──
  sysField("sys_x_et_created_at", "Data Creazione", "Squadra Esterna", "external_team", "{{ external_team.created_at }}"),
  sysField("sys_x_et_color", "Colore", "Squadra Esterna", "external_team", "{{ external_team.color }}"),
  sysField("sys_x_et_kind", "Tipo Squadra", "Squadra Esterna", "external_team", "{{ external_team.kind }}"),
  sysField("sys_x_et_subappaltatore_id", "Subappaltatore (ID)", "Squadra Esterna", "external_team", "{{ external_team.subappaltatore_id }}"),
  sysField("sys_x_et_leader_user_id", "Capo Squadra (ID)", "Squadra Esterna", "external_team", "{{ external_team.leader_user_id }}"),
  // ── Fornitore ──
  sysField("sys_x_sup_created_at", "Data Creazione", "Fornitore", "supplier", "{{ supplier.created_at }}"),
  sysField("sys_x_sup_updated_at", "Ultima Modifica", "Fornitore", "supplier", "{{ supplier.updated_at }}"),
  sysField("sys_x_sup_vat_rate", "Aliquota IVA", "Fornitore", "supplier", "{{ supplier.vat_rate }}"),
  sysField("sys_x_sup_barcode_prefix", "Prefisso Codice a Barre", "Fornitore", "supplier", "{{ supplier.barcode_prefix }}"),
  // ── Ordine di Variazione ──
  sysField("sys_x_odv2_order_id", "ID Ordine", "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.order_id }}"),
  sysField("sys_x_odv2_richiesto_il", "Richiesto Il", "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.richiesto_il }}"),
  sysField("sys_x_odv2_note_interne", "Note Interne", "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.note_interne }}"),
  sysField("sys_x_odv2_created_at", "Data Creazione", "Ordine di Variazione", "ordini_variazione", "{{ ordini_variazione.created_at }}"),
  // ── Giornale dei Lavori ──
  sysField("sys_x_gl2_order_id", "ID Ordine", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.order_id }}"),
  sysField("sys_x_gl2_temperatura", "Temperatura", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.temperatura }}"),
  sysField("sys_x_gl2_condizioni_meteo", "Condizioni Meteo", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.condizioni_meteo }}"),
  sysField("sys_x_gl2_lavorazioni_eseguite", "Lavorazioni Eseguite", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.lavorazioni_eseguite }}"),
  sysField("sys_x_gl2_materiali_utilizzati", "Materiali Utilizzati", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.materiali_utilizzati }}"),
  sysField("sys_x_gl2_personale_presente", "Personale Presente", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.personale_presente }}"),
  sysField("sys_x_gl2_note", "Note", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.note }}"),
  sysField("sys_x_gl2_firmato_da", "Firmato Da", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.firmato_da }}"),
  sysField("sys_x_gl2_firmato_il", "Firmato Il", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.firmato_il }}"),
  sysField("sys_x_gl2_visibile_cliente", "Visibile al Cliente", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.visibile_cliente }}"),
  sysField("sys_x_gl2_created_at", "Data Creazione", "Giornale dei Lavori", "giornale_lavori", "{{ giornale_lavori.created_at }}"),
  // ── POS – Sicurezza ──
  sysField("sys_x_pos2_tipo_lavori", "Tipo Lavori", "POS – Sicurezza", "pos_document", "{{ pos_document.tipo_lavori }}"),
  sysField("sys_x_pos2_data_inizio", "Data Inizio", "POS – Sicurezza", "pos_document", "{{ pos_document.data_inizio }}"),
  sysField("sys_x_pos2_data_fine_prevista", "Data Fine Prevista", "POS – Sicurezza", "pos_document", "{{ pos_document.data_fine_prevista }}"),
  sysField("sys_x_pos2_numero_lavoratori", "N° Lavoratori", "POS – Sicurezza", "pos_document", "{{ pos_document.numero_lavoratori }}"),
  sysField("sys_x_pos2_rischi_presenti", "Rischi Presenti", "POS – Sicurezza", "pos_document", "{{ pos_document.rischi_presenti }}"),
  sysField("sys_x_pos2_dpi_richiesti", "DPI Richiesti", "POS – Sicurezza", "pos_document", "{{ pos_document.dpi_richiesti }}"),
  sysField("sys_x_pos2_procedure_operative", "Procedure Operative", "POS – Sicurezza", "pos_document", "{{ pos_document.procedure_operative }}"),
  sysField("sys_x_pos2_document_type", "Tipo Documento", "POS – Sicurezza", "pos_document", "{{ pos_document.document_type }}"),
  sysField("sys_x_pos2_revisione", "Revisione", "POS – Sicurezza", "pos_document", "{{ pos_document.revisione }}"),
  sysField("sys_x_pos2_firmato_da", "Firmato Da", "POS – Sicurezza", "pos_document", "{{ pos_document.firmato_da }}"),
  sysField("sys_x_pos2_firmato_il", "Firmato Il", "POS – Sicurezza", "pos_document", "{{ pos_document.firmato_il }}"),
  sysField("sys_x_pos2_approvato_da_nome", "Approvato Da", "POS – Sicurezza", "pos_document", "{{ pos_document.approvato_da_nome }}"),
  sysField("sys_x_pos2_approvato_il", "Approvato Il", "POS – Sicurezza", "pos_document", "{{ pos_document.approvato_il }}"),
  sysField("sys_x_pos2_valid_from", "Valido Dal", "POS – Sicurezza", "pos_document", "{{ pos_document.valid_from }}"),
  sysField("sys_x_pos2_valid_until", "Valido Fino Al", "POS – Sicurezza", "pos_document", "{{ pos_document.valid_until }}"),
  sysField("sys_x_pos2_created_at", "Data Creazione", "POS – Sicurezza", "pos_document", "{{ pos_document.created_at }}"),
  // ── DUVRI – Sicurezza ──
  sysField("sys_x_duvri2_committente_nome", "Committente", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.committente_nome }}"),
  sysField("sys_x_duvri2_committente_piva", "P.IVA Committente", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.committente_piva }}"),
  sysField("sys_x_duvri2_interferenze", "Interferenze", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.interferenze }}"),
  sysField("sys_x_duvri2_misure_prevenzione", "Misure di Prevenzione", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.misure_prevenzione }}"),
  sysField("sys_x_duvri2_costi_sicurezza", "Costi Sicurezza", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.costi_sicurezza }}"),
  sysField("sys_x_duvri2_firmato_committente_il", "Firmato dal Committente Il", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.firmato_committente_il }}"),
  sysField("sys_x_duvri2_firmato_subappaltatore_il", "Firmato dal Subappaltatore Il", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.firmato_subappaltatore_il }}"),
  sysField("sys_x_duvri2_created_at", "Data Creazione", "DUVRI – Sicurezza", "duvri_document", "{{ duvri_document.created_at }}"),
  // ── Rapportino ──
  sysField("sys_x_rap2_impianto_id", "ID Impianto", "Rapportino", "rapportino", "{{ rapportino.impianto_id }}"),
  sysField("sys_x_rap2_ore_lavoro_effettive", "Ore Lavoro Effettive", "Rapportino", "rapportino", "{{ rapportino.ore_lavoro_effettive }}"),
  sysField("sys_x_rap2_note_chiusura", "Note di Chiusura", "Rapportino", "rapportino", "{{ rapportino.note_chiusura }}"),
  sysField("sys_x_rap2_stato_chiusura", "Stato Chiusura", "Rapportino", "rapportino", "{{ rapportino.stato_chiusura }}"),
  sysField("sys_x_rap2_firmato_tecnico_at", "Firmato dal Tecnico Il", "Rapportino", "rapportino", "{{ rapportino.firmato_tecnico_at }}"),
  sysField("sys_x_rap2_created_at", "Data Creazione", "Rapportino", "rapportino", "{{ rapportino.created_at }}"),
  // ── Impianto ──
  sysField("sys_x_imp2_created_at", "Data Creazione", "Impianto", "impianto", "{{ impianto.created_at }}"),
  // ── Contratto Manutenzione ──
  sysField("sys_x_cm2_created_at", "Data Creazione", "Contratto Manutenzione", "contratto_manutenzione", "{{ contratto_manutenzione.created_at }}"),
  // ── Subappaltatore ──
  sysField("sys_x_sub2_email", "Email", "Subappaltatore", "subappaltatore", "{{ subappaltatore.email }}"),
  sysField("sys_x_sub2_piva", "Partita IVA", "Subappaltatore", "subappaltatore", "{{ subappaltatore.piva }}"),
  sysField("sys_x_sub2_indirizzo", "Indirizzo", "Subappaltatore", "subappaltatore", "{{ subappaltatore.indirizzo }}"),
  sysField("sys_x_sub2_is_active", "Attivo", "Subappaltatore", "subappaltatore", "{{ subappaltatore.is_active }}"),
  sysField("sys_x_sub2_notes", "Note", "Subappaltatore", "subappaltatore", "{{ subappaltatore.notes }}"),
  sysField("sys_x_sub2_created_at", "Data Creazione", "Subappaltatore", "subappaltatore", "{{ subappaltatore.created_at }}"),
  // ── Contratto Subappalto ──
  sysField("sys_x_csub2_created_at", "Data Creazione", "Contratto Subappalto", "contratto_subappalto", "{{ contratto_subappalto.created_at }}"),
  // ── SAL Subappaltatore ──
  sysField("sys_x_salsub2_note_contestazione", "Note di Contestazione", "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.note_contestazione }}"),
  sysField("sys_x_salsub2_payment_method", "Metodo di Pagamento", "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.payment_method }}"),
  sysField("sys_x_salsub2_payment_reference", "Riferimento Pagamento", "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.payment_reference }}"),
  sysField("sys_x_salsub2_created_at", "Data Creazione", "SAL Subappaltatore", "sal_subappaltatore", "{{ sal_subappaltatore.created_at }}"),
  // ── Ordine Acquisto (OdA) ──
  sysField("sys_x_oda2_notes", "Note", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.notes }}"),
  sysField("sys_x_oda2_confirmed_at", "Confermato Il", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.confirmed_at }}"),
  sysField("sys_x_oda2_delivery_warehouse_id", "Magazzino Consegna (ID)", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.delivery_warehouse_id }}"),
  sysField("sys_x_oda2_origine", "Origine", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.origine }}"),
  sysField("sys_x_oda2_payment_terms_base", "Base Termini Pagamento", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.payment_terms_base }}"),
  sysField("sys_x_oda2_payment_terms_giorni", "Giorni Termini Pagamento", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.payment_terms_giorni }}"),
  sysField("sys_x_oda2_created_at", "Data Creazione", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.created_at }}"),
  sysField("sys_x_oda2_updated_at", "Ultima Modifica", "Ordine Acquisto (OdA)", "ordine_acquisto", "{{ ordine_acquisto.updated_at }}"),
  // ── DDT Ricezione Merce ──
  sysField("sys_x_ddt2_source", "Origine", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.source }}"),
  sysField("sys_x_ddt2_warehouse_id", "Magazzino (ID)", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.warehouse_id }}"),
  sysField("sys_x_ddt2_corriere", "Corriere", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.corriere }}"),
  sysField("sys_x_ddt2_targa_mezzo", "Targa Mezzo", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.targa_mezzo }}"),
  sysField("sys_x_ddt2_autista_nome", "Nome Autista", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.autista_nome }}"),
  sysField("sys_x_ddt2_autista_telefono", "Telefono Autista", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.autista_telefono }}"),
  sysField("sys_x_ddt2_ora_arrivo", "Ora Arrivo", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.ora_arrivo }}"),
  sysField("sys_x_ddt2_ora_partenza", "Ora Partenza", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.ora_partenza }}"),
  sysField("sys_x_ddt2_ricevuto_da_nome", "Ricevuto Da", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.ricevuto_da_nome }}"),
  sysField("sys_x_ddt2_non_conformita", "Non Conformità", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.non_conformita }}"),
  sysField("sys_x_ddt2_has_damages", "Merce Danneggiata", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.has_damages }}"),
  sysField("sys_x_ddt2_verified_at", "Verificato Il", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.verified_at }}"),
  sysField("sys_x_ddt2_created_at", "Data Creazione", "DDT Ricezione Merce", "ddt_ricezione", "{{ ddt_ricezione.created_at }}"),
  // ── Costo Aziendale ──
  sysField("sys_x_cost2_giorni_dilazione", "Giorni Dilazione", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.giorni_dilazione }}"),
  sysField("sys_x_cost2_giorni_preavviso", "Giorni Preavviso", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.giorni_preavviso }}"),
  sysField("sys_x_cost2_recurrence_end_date", "Fine Ricorrenza", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.recurrence_end_date }}"),
  sysField("sys_x_cost2_purchase_order_id", "Ordine Acquisto (ID)", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.purchase_order_id }}"),
  sysField("sys_x_cost2_ticket_id", "Ticket (ID)", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.ticket_id }}"),
  sysField("sys_x_cost2_sede_id", "Sede (ID)", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.sede_id }}"),
  sysField("sys_x_cost2_created_at", "Data Creazione", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.created_at }}"),
  sysField("sys_x_cost2_updated_at", "Ultima Modifica", "Costo Aziendale", "costo_aziendale", "{{ costo_aziendale.updated_at }}"),
  // ── Prodotto (Articolo) ──
  sysField("sys_x_prod2_unit_price", "Prezzo Unitario", "Prodotto (Articolo)", "product", "{{ product.unit_price }}"),
  sysField("sys_x_prod2_standard_cost", "Costo Standard", "Prodotto (Articolo)", "product", "{{ product.standard_cost }}"),
  sysField("sys_x_prod2_unit_of_measure", "Unità di Misura", "Prodotto (Articolo)", "product", "{{ product.unit_of_measure }}"),
  sysField("sys_x_prod2_modalita_prezzo", "Modalità Prezzo", "Prodotto (Articolo)", "product", "{{ product.modalita_prezzo }}"),
  sysField("sys_x_prod2_prezzo_acquisto_netto", "Prezzo Acquisto Netto", "Prodotto (Articolo)", "product", "{{ product.prezzo_acquisto_netto }}"),
  sysField("sys_x_prod2_prezzo_vendita", "Prezzo di Vendita", "Prodotto (Articolo)", "product", "{{ product.prezzo_vendita }}"),
  sysField("sys_x_prod2_margine_minimo_percentuale", "Margine Minimo %", "Prodotto (Articolo)", "product", "{{ product.margine_minimo_percentuale }}"),
  sysField("sys_x_prod2_sconto_max_cliente_percentuale", "Sconto Max Cliente %", "Prodotto (Articolo)", "product", "{{ product.sconto_max_cliente_percentuale }}"),
  sysField("sys_x_prod2_marca", "Marca", "Prodotto (Articolo)", "product", "{{ product.marca }}"),
  sysField("sys_x_prod2_modello", "Modello", "Prodotto (Articolo)", "product", "{{ product.modello }}"),
  sysField("sys_x_prod2_note_interne", "Note Interne", "Prodotto (Articolo)", "product", "{{ product.note_interne }}"),
  sysField("sys_x_prod2_attivo", "Attivo", "Prodotto (Articolo)", "product", "{{ product.attivo }}"),
  sysField("sys_x_prod2_ha_montaggio", "Ha Montaggio", "Prodotto (Articolo)", "product", "{{ product.ha_montaggio }}"),
  sysField("sys_x_prod2_montaggio_tipo", "Tipo Montaggio", "Prodotto (Articolo)", "product", "{{ product.montaggio_tipo }}"),
  sysField("sys_x_prod2_categoria_id", "Categoria (ID)", "Prodotto (Articolo)", "product", "{{ product.categoria_id }}"),
  sysField("sys_x_prod2_created_at", "Data Creazione", "Prodotto (Articolo)", "product", "{{ product.created_at }}"),
  // ── Famiglia Prodotto ──
  sysField("sys_x_fam2_nome", "Nome (IT)", "Famiglia Prodotto", "family", "{{ family.nome }}"),
  sysField("sys_x_fam2_codice", "Codice (IT)", "Famiglia Prodotto", "family", "{{ family.codice }}"),
  sysField("sys_x_fam2_descrizione", "Descrizione (IT)", "Famiglia Prodotto", "family", "{{ family.descrizione }}"),
  sysField("sys_x_fam2_vertical", "Settore", "Famiglia Prodotto", "family", "{{ family.vertical }}"),
  sysField("sys_x_fam2_modalita_prezzo_base", "Modalità Prezzo Base", "Famiglia Prodotto", "family", "{{ family.modalita_prezzo_base }}"),
  sysField("sys_x_fam2_prezzo_base_vendita", "Prezzo Base Vendita", "Famiglia Prodotto", "family", "{{ family.prezzo_base_vendita }}"),
  sysField("sys_x_fam2_prezzo_base_acquisto", "Prezzo Base Acquisto", "Famiglia Prodotto", "family", "{{ family.prezzo_base_acquisto }}"),
  sysField("sys_x_fam2_vat_rate", "Aliquota IVA Vendita", "Famiglia Prodotto", "family", "{{ family.vat_rate }}"),
  sysField("sys_x_fam2_vat_rate_acquisto", "Aliquota IVA Acquisto", "Famiglia Prodotto", "family", "{{ family.vat_rate_acquisto }}"),
  sysField("sys_x_fam2_unit_of_measure", "Unità di Misura", "Famiglia Prodotto", "family", "{{ family.unit_of_measure }}"),
  sysField("sys_x_fam2_markup_tipo", "Tipo Ricarico", "Famiglia Prodotto", "family", "{{ family.markup_tipo }}"),
  sysField("sys_x_fam2_markup_valore", "Valore Ricarico", "Famiglia Prodotto", "family", "{{ family.markup_valore }}"),
  sysField("sys_x_fam2_sconto_fornitore_1", "Sconto Fornitore 1", "Famiglia Prodotto", "family", "{{ family.sconto_fornitore_1 }}"),
  sysField("sys_x_fam2_sconto_fornitore_2", "Sconto Fornitore 2", "Famiglia Prodotto", "family", "{{ family.sconto_fornitore_2 }}"),
  sysField("sys_x_fam2_manodopera_modalita", "Modalità Manodopera", "Famiglia Prodotto", "family", "{{ family.manodopera_modalita }}"),
  sysField("sys_x_fam2_manodopera_costo_acquisto", "Costo Manodopera", "Famiglia Prodotto", "family", "{{ family.manodopera_costo_acquisto }}"),
  sysField("sys_x_fam2_manodopera_prezzo_vendita", "Prezzo Manodopera", "Famiglia Prodotto", "family", "{{ family.manodopera_prezzo_vendita }}"),
  sysField("sys_x_fam2_manodopera_unita", "Unità Manodopera", "Famiglia Prodotto", "family", "{{ family.manodopera_unita }}"),
  sysField("sys_x_fam2_attivo", "Attiva", "Famiglia Prodotto", "family", "{{ family.attivo }}"),
  sysField("sys_x_fam2_mostra_preventivo", "Mostra nel Preventivo", "Famiglia Prodotto", "family", "{{ family.mostra_preventivo }}"),
  sysField("sys_x_fam2_created_at", "Data Creazione", "Famiglia Prodotto", "family", "{{ family.created_at }}"),
  // ── Tariffa / Manodopera ──
  sysField("sys_x_tar2_tipo", "Tipo Tariffa", "Tariffa / Manodopera", "tariffa", "{{ tariffa.tipo }}"),
  sysField("sys_x_tar2_descrizione", "Descrizione", "Tariffa / Manodopera", "tariffa", "{{ tariffa.descrizione }}"),
  sysField("sys_x_tar2_unita", "Unità", "Tariffa / Manodopera", "tariffa", "{{ tariffa.unita }}"),
  sysField("sys_x_tar2_prezzo_costo", "Prezzo di Costo", "Tariffa / Manodopera", "tariffa", "{{ tariffa.prezzo_costo }}"),
  sysField("sys_x_tar2_prezzo_vendita", "Prezzo di Vendita", "Tariffa / Manodopera", "tariffa", "{{ tariffa.prezzo_vendita }}"),
  sysField("sys_x_tar2_costo_interno", "Costo Interno", "Tariffa / Manodopera", "tariffa", "{{ tariffa.costo_interno }}"),
  sysField("sys_x_tar2_costo_default", "Costo Predefinito", "Tariffa / Manodopera", "tariffa", "{{ tariffa.costo_default }}"),
  sysField("sys_x_tar2_unita_fatturazione", "Unità Fatturazione", "Tariffa / Manodopera", "tariffa", "{{ tariffa.unita_fatturazione }}"),
  sysField("sys_x_tar2_categoria_prodotto", "Categoria Prodotto", "Tariffa / Manodopera", "tariffa", "{{ tariffa.categoria_prodotto }}"),
  sysField("sys_x_tar2_incidenza_manodopera_pct", "Incidenza Manodopera %", "Tariffa / Manodopera", "tariffa", "{{ tariffa.incidenza_manodopera_pct }}"),
  sysField("sys_x_tar2_fonte", "Fonte", "Tariffa / Manodopera", "tariffa", "{{ tariffa.fonte }}"),
  sysField("sys_x_tar2_external_team_id", "Squadra Esterna (ID)", "Tariffa / Manodopera", "tariffa", "{{ tariffa.external_team_id }}"),
  sysField("sys_x_tar2_created_at", "Data Creazione", "Tariffa / Manodopera", "tariffa", "{{ tariffa.created_at }}"),
];

export const FIELD_TYPES = [
  { value: "text", label: "Testo breve" },
  { value: "textarea", label: "Testo lungo" },
  { value: "number", label: "Numero" },
  { value: "currency", label: "Importo" },
  { value: "percent", label: "Percentuale" },
  { value: "date", label: "Data" },
  { value: "time", label: "Ora" },
  { value: "select", label: "Selezione" },
  { value: "multiselect", label: "Multi-selezione" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
  { value: "phone", label: "Telefono" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "file", label: "File / Allegato" },
];

const CONTACT_SECTIONS = [
  { value: "contact", label: "Contatto" },
  { value: "general_info", label: "Informazioni generali" },
  { value: "additional_info", label: "Informazioni aggiuntive" },
];
const OPPORTUNITY_SECTIONS = [
  { value: "opportunity_details", label: "Opportunità Details" },
];
// Cantieri: ogni entity type ha una sezione con lo stesso nome
const CANTIERE_SECTIONS: Record<string, { value: string; label: string }[]> = {
  ordini_variazione: [{ value: "ordini_variazione", label: "Ordine di Variazione" }],
  giornale_lavori:   [{ value: "giornale_lavori",   label: "Giornale dei Lavori" }],
  pos_document:      [{ value: "pos_document",      label: "POS – Sicurezza" }],
  duvri_document:    [{ value: "duvri_document",    label: "DUVRI – Sicurezza" }],
  // ── Assistenza ──
  intervento:            [{ value: "intervento",            label: "Intervento / Assistenza" }],
  rapportino:            [{ value: "rapportino",            label: "Rapportino Intervento" }],
  // ── Manutenzione ──
  impianto:              [{ value: "impianto",              label: "Impianto Cliente" }],
  contratto_manutenzione:[{ value: "contratto_manutenzione",label: "Contratto Manutenzione" }],
  piano_manutenzione:    [{ value: "piano_manutenzione",    label: "Piano Manutenzione" }],
  // ── Subappaltatori ──
  subappaltatore:        [{ value: "subappaltatore",        label: "Subappaltatore" }],
  contratto_subappalto:  [{ value: "contratto_subappalto",  label: "Contratto Subappalto" }],
  sal_subappaltatore:    [{ value: "sal_subappaltatore",    label: "SAL Subappaltatore" }],
  // ── Acquisti ──
  ordine_acquisto:       [{ value: "ordine_acquisto",       label: "Ordine Acquisto (OdA)" }],
  ddt_ricezione:         [{ value: "ddt_ricezione",         label: "DDT Ricezione Merce" }],
  // ── Finanza ──
  costo_aziendale:       [{ value: "costo_aziendale",       label: "Costo Aziendale" }],
  // ── Personale & HR: selezione ──
  candidato:             [{ value: "candidato",             label: "Candidato (Selezione)" }],
  colloquio:             [{ value: "colloquio",             label: "Colloquio Candidato" }],
  // ── Azienda ──
  company:               [{ value: "company",               label: "Azienda / Profilo" }],
  // ── Catalogo Esteso (Sprint C) ──
  product:               [{ value: "product",               label: "Prodotto (Articolo)" }],
  family:                [{ value: "family",                label: "Famiglia Prodotto" }],
  tariffa:               [{ value: "tariffa",               label: "Tariffa / Manodopera" }],
  catalog_category:      [{ value: "catalog_category",      label: "Categoria Listino" }],
};

// v8.6.46 — C3 minimal: traccia gli oggetti che hanno un renderer reale
// nei form dell'app. Gli altri salvano il valore in DB ma non sono
// visualizzati in UI. Usato per warning nel dialog di create/edit campo.
export const RENDERED_OBJECT_TYPES = new Set<string>([
  "contact",                  // ContactFieldsSheet + ContactDialog
  "opportunity",              // OpportunityDialog (fix v8.6.44)
  "ordini_variazione",        // OdVSection
  "giornale_lavori",          // GiornaleLavori
  "pos_document",             // SicurezzaCantiere
  "duvri_document",           // SicurezzaCantiere
  "product",                  // CustomFieldValuesForm (articoli)
  "family",                   // CustomFieldValuesForm (famiglie)
  "tariffa",                  // CustomFieldValuesForm (tariffe)
  "catalog_category",         // CustomFieldValuesForm
]);

export function isObjectRendered(objectType: string): boolean {
  return RENDERED_OBJECT_TYPES.has(objectType);
}

export const GROUP_OPTIONS = [
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
  // ── Cantieri ──
  { value: "ordini_variazione", label: "Ordine di Variazione" },
  { value: "giornale_lavori",   label: "Giornale dei Lavori" },
  { value: "pos_document",      label: "POS – Sicurezza" },
  { value: "duvri_document",    label: "DUVRI – Sicurezza" },
  // ── Assistenza ──
  { value: "intervento",            label: "Intervento / Assistenza" },
  { value: "rapportino",            label: "Rapportino Intervento" },
  // ── Manutenzione ──
  { value: "impianto",              label: "Impianto Cliente" },
  { value: "contratto_manutenzione",label: "Contratto Manutenzione" },
  { value: "piano_manutenzione",    label: "Piano Manutenzione" },
  // ── Subappaltatori ──
  { value: "subappaltatore",        label: "Subappaltatore" },
  { value: "contratto_subappalto",  label: "Contratto Subappalto" },
  { value: "sal_subappaltatore",    label: "SAL Subappaltatore" },
  // ── Acquisti ──
  { value: "ordine_acquisto",       label: "Ordine Acquisto (OdA)" },
  { value: "ddt_ricezione",         label: "DDT Ricezione Merce" },
  // ── Finanza ──
  { value: "costo_aziendale",       label: "Costo Aziendale" },
  // ── Azienda ──
  { value: "company",               label: "Azienda / Profilo" },
  // ── Catalogo Esteso (Sprint C) ──
  { value: "product",               label: "Prodotto (Articolo)" },
  { value: "family",                label: "Famiglia Prodotto" },
  { value: "tariffa",               label: "Tariffa / Manodopera" },
  { value: "catalog_category",      label: "Categoria Listino" },
];

export const OBJECT_NAME_MAP: Record<string, string> = {
  contact: "Contatto",
  candidato: "Candidato (Selezione)",
  colloquio: "Colloquio Candidato",
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
  // ── Cantieri ──
  ordini_variazione: "Ordine di Variazione",
  giornale_lavori: "Giornale dei Lavori",
  pos_document: "POS – Sicurezza",
  duvri_document: "DUVRI – Sicurezza",
  // ── Assistenza ──
  intervento: "Intervento / Assistenza",
  rapportino: "Rapportino Intervento",
  // ── Manutenzione ──
  impianto: "Impianto Cliente",
  contratto_manutenzione: "Contratto Manutenzione",
  piano_manutenzione: "Piano Manutenzione",
  // ── Subappaltatori ──
  subappaltatore: "Subappaltatore",
  contratto_subappalto: "Contratto Subappalto",
  sal_subappaltatore: "SAL Subappaltatore",
  // ── Acquisti ──
  ordine_acquisto: "Ordine Acquisto (OdA)",
  ddt_ricezione: "DDT Ricezione Merce",
  // ── Finanza ──
  costo_aziendale: "Costo Aziendale",
  // ── Azienda ──
  company: "Azienda / Profilo",
  // ── Catalogo Esteso (Sprint C) ──
  product: "Prodotto (Articolo)",
  family: "Famiglia Prodotto",
  tariffa: "Tariffa / Manodopera",
  catalog_category: "Categoria Listino",
};

export function toSnakeCase(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/* ───── component ───── */
export function CustomFieldsConfig() {
  const { effectiveCompany } = useAuth();
  // Campi e cartelle li cambia chi ha «Personalizzazione» in modifica: è la
  // stessa regola del database (policy «Permesso personalizzazione»).
  const { canEditSettingsCustomization: puoModificare } = usePermissions();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [section, setSection] = useState("general_info");
  const [objectType, setObjectType] = useState<string>("contact");
  const [optionsInput, setOptionsInput] = useState("");
  // v8.6.46 — C5 minimal: validazione + UX
  const [isRequired, setIsRequired] = useState(false);
  const [helpText, setHelpText] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [groupBy, setGroupBy] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedField | null>(null);
  const [editTarget, setEditTarget] = useState<UnifiedField | null>(null);
  // v8.6.45 — Folders (tab Cartelle)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderEditId, setFolderEditId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("#1E3A5F");
  const [folderObjectType, setFolderObjectType] = useState<string>("contact");
  const [folderDeleteId, setFolderDeleteId] = useState<string | null>(null);

  // v8.6.45 — Resiliente alla migration `deleted_at` non ancora applicata.
  // Se la colonna non esiste (migration 20270517130000 ancora pending),
  // l'UI degrada graceful: tab Eliminati mostra banner, tab principale
  // continua a funzionare (filtro client-side se la colonna esiste).
  const { data: customFields = [], isLoading, isError, error, refetch } = useQuery({
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
      // Filtro client-side dei soft-deletati (compatibile pre-migration:
      // se la colonna non esiste è semplicemente undefined e tutti passano).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).filter((row: any) => !row.deleted_at);
    },
    enabled: !!companyId,
  });

  // v8.6.45 — Tab "Campi eliminati": graceful fallback se la migration
  // non è ancora applicata. Catturo l'errore PostgREST `column does not exist`
  // e ritorno [] + flag per mostrare un banner informativo.
  const [softDeleteSupported, setSoftDeleteSupported] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: deletedFields = [] } = useQuery<any[]>({
    queryKey: ["marketing_custom_fields_deleted", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) {
        // Migration pending: la colonna deleted_at non esiste ancora
        if (/deleted_at.*does not exist/i.test(error.message ?? "")) {
          setSoftDeleteSupported(false);
          return [];
        }
        throw error;
      }
      setSoftDeleteSupported(true);
      return data ?? [];
    },
    enabled: !!companyId,
    retry: false,
  });

  // v8.6.45 — Tab Cartelle: hook CRUD
  const { data: folders = [] } = useCustomFieldFolders();
  const createFolder = useCreateCustomFieldFolder();
  const updateFolder = useUpdateCustomFieldFolder();
  const deleteFolder = useDeleteCustomFieldFolder();

  const openCreateFolderDialog = () => {
    setFolderEditId(null);
    setFolderName("");
    setFolderColor("#1E3A5F");
    setFolderObjectType("contact");
    setFolderDialogOpen(true);
  };
  const openEditFolderDialog = (f: CustomFieldFolder) => {
    setFolderEditId(f.id);
    setFolderName(f.name);
    setFolderColor(f.color ?? "#1E3A5F");
    setFolderObjectType(f.object_type ?? "contact");
    setFolderDialogOpen(true);
  };
  const submitFolder = () => {
    if (folderEditId) {
      updateFolder.mutate(
        { id: folderEditId, name: folderName, color: folderColor, object_type: folderObjectType },
        { onSuccess: () => setFolderDialogOpen(false) },
      );
    } else {
      createFolder.mutate(
        { name: folderName, color: folderColor, object_type: folderObjectType },
        { onSuccess: () => setFolderDialogOpen(false) },
      );
    }
  };

  const allFields = useMemo<UnifiedField[]>(() => {
    const custom: UnifiedField[] = (customFields as MarketingCustomFieldRow[]).map((f) => {
      const objectName = OBJECT_NAME_MAP[f.object_type] ?? f.object_type;
      const templateNs = f.object_type; // es. 'ordini_variazione'
      return {
        id: f.id,
        name: f.name,
        object: objectName,
        folder: f.section ?? f.object_type,
        folderColor: FOLDER_COLORS[f.section ?? f.object_type] || FOLDER_COLORS.additional_info,
        uniqueKey: `{{ ${templateNs}.${toSnakeCase(f.name)} }}`,
        createdAt: f.created_at,
        isSystem: false,
        fieldType: f.field_type,
        options: f.options ?? [],
        section: f.section,
        objectType: f.object_type,
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

  // Campi creati su oggetti "solo API": salvati in DB ma non ancora resi nei
  // form della UI. Sorgente di verità: RENDERED_OBJECT_TYPES.
  const apiOnlyCustomCount = useMemo(
    () => (customFields as MarketingCustomFieldRow[]).filter(
      (f) => !isObjectRendered(f.object_type),
    ).length,
    [customFields],
  );

  const handleObjectTypeChange = (val: string) => {
    setObjectType(val);
    if (val === "opportunity") setSection("opportunity_details");
    else if (CANTIERE_SECTIONS[val]) setSection(val);
    else setSection("general_info");
  };

  const availableSections =
    objectType === "opportunity"
      ? OPPORTUNITY_SECTIONS
      : CANTIERE_SECTIONS[objectType]
      ? CANTIERE_SECTIONS[objectType]
      : CONTACT_SECTIONS;

  const resetForm = () => {
    setName("");
    setFieldType("text");
    setSection("general_info");
    setObjectType("contact");
    setOptionsInput("");
    setEditTarget(null);
    setIsRequired(false);
    setHelpText("");
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (field: UnifiedField) => {
    if (!field.objectType) return;
    setEditTarget(field);
    setName(field.name);
    setFieldType(field.fieldType || "text");
    setObjectType(field.objectType);
    setSection(field.section || field.objectType);
    setOptionsInput((field.options || []).join(", "));
    // v8.6.46 — hydrate is_required + help_text (resiliente se colonne assenti)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = customFields.find((f: any) => f.id === field.id) as any;
    setIsRequired(Boolean(raw?.is_required));
    setHelpText(raw?.help_text ?? "");
    setDialogOpen(true);
  };

  const selectedType = FIELD_TYPES.find((t) => t.value === fieldType);
  const needsOptions = OPTION_FIELD_TYPES.has(fieldType);
  const normalizedOptions = needsOptions ? normalizeOptions(optionsInput) : [];
  const normalizedName = normalizeName(name);
  const previewKey = objectType ? `{{ ${objectType}.${toSnakeCase(normalizedName || "nome_campo")} }}` : "";

  const validateForm = () => {
    if (!companyId) throw new Error("Azienda non disponibile");
    if (!normalizedName) throw new Error("Inserisci il nome del campo");
    if (normalizedName.length > 100) throw new Error("Il nome del campo deve restare sotto i 100 caratteri");
    if (needsOptions && normalizedOptions.length === 0) {
      throw new Error("Inserisci almeno un'opzione per questo tipo di campo");
    }
    const duplicate = (customFields as MarketingCustomFieldRow[]).some(
      (field) =>
        field.id !== editTarget?.id &&
        field.object_type === objectType &&
        normalizeName(field.name).toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error("Esiste già un campo con questo nome per l'oggetto selezionato");
    }
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      validateForm();
      // v8.6.46 — try-first con is_required + help_text. Se la migration
      // C5 non è applicata, fallback su payload base.
      const fullPayload = {
        company_id: companyId!,
        name: normalizedName,
        field_type: fieldType,
        options: normalizedOptions,
        section,
        position: customFields.length,
        object_type: objectType,
        is_required: isRequired,
        help_text: helpText.trim() || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("marketing_custom_fields").insert(fullPayload);
      if (error) {
        if (/is_required|help_text.*does not exist/i.test(error.message ?? "")) {
          // Migration C5 pending — retry senza i nuovi campi
          const { error: retryErr } = await supabase.from("marketing_custom_fields").insert({
            company_id: companyId!,
            name: normalizedName,
            field_type: fieldType,
            options: normalizedOptions,
            section,
            position: customFields.length,
            object_type: objectType,
          });
          if (retryErr) throw retryErr;
        } else {
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-custom-fields"] });
      toast.success("Campo personalizzato aggiunto");
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e) || "Errore nel salvataggio"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !editTarget) throw new Error("Campo non disponibile");
      validateForm();

      const usage = await getCustomFieldUsageCounts(editTarget.id);
      const isUsed = usage.contacts > 0 || usage.opportunities > 0 || usage.entities > 0;
      const typeChanged = fieldType !== editTarget.fieldType;
      const objectChanged = objectType !== editTarget.objectType;
      const optionsChanged = JSON.stringify(normalizedOptions) !== JSON.stringify(editTarget.options || []);

      if (isUsed && (typeChanged || objectChanged || optionsChanged)) {
        throw new Error("Il campo contiene valori salvati: puoi modificare nome e sezione, ma non tipo, oggetto o opzioni.");
      }

      // v8.6.46 — try-first con is_required + help_text. Fallback se
      // migration C5 pending.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("marketing_custom_fields")
        .update({
          name: normalizedName,
          field_type: fieldType,
          options: normalizedOptions,
          section,
          object_type: objectType,
          is_required: isRequired,
          help_text: helpText.trim() || null,
        })
        .eq("id", editTarget.id)
        .eq("company_id", companyId);
      if (error) {
        if (/is_required|help_text.*does not exist/i.test(error.message ?? "")) {
          const { error: retryErr } = await supabase
            .from("marketing_custom_fields")
            .update({
              name: normalizedName,
              field_type: fieldType,
              options: normalizedOptions,
              section,
              object_type: objectType,
            })
            .eq("id", editTarget.id)
            .eq("company_id", companyId);
          if (retryErr) throw retryErr;
        } else {
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-custom-fields"] });
      toast.success("Campo personalizzato aggiornato");
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e) || "Errore nell'aggiornamento"),
  });

  // v8.6.45 — Soft-delete: marca deleted_at invece di DELETE hard.
  // I valori storici nelle tabelle *_field_values restano referenziati,
  // l'utente può ripristinare il campo dalla tab "Campi eliminati".
  // Il blocco "usage > 0" non serve più come hard-block: con soft-delete
  // il campo torna disponibile in 1 click. Lo manteniamo come WARNING.
  const deleteMutation = useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const usage = await getCustomFieldUsageCounts(id);
      if (!force && (usage.contacts > 0 || usage.opportunities > 0 || usage.entities > 0)) {
        throw new CustomFieldInUseError(usage);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("marketing_custom_fields")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) {
        // Migration pending: fallback hard-delete (backward compat)
        if (/deleted_at.*does not exist/i.test(error.message ?? "")) {
          const { error: hardErr } = await supabase
            .from("marketing_custom_fields")
            .delete()
            .eq("id", id)
            .eq("company_id", companyId);
          if (hardErr) throw hardErr;
          return { hard: true };
        }
        throw error;
      }
      return { hard: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields_deleted"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-custom-fields"] });
      toast.success(
        result?.hard
          ? "Campo eliminato"
          : "Campo spostato nei campi eliminati. Puoi ripristinarlo in qualsiasi momento."
      );
    },
    onError: (e: unknown) => {
      if (e instanceof CustomFieldInUseError) {
        const total = e.usage.contacts + e.usage.opportunities + e.usage.entities;
        toast.error(`Campo già usato in ${total} valore/i. Riprova confermando l'eliminazione per proteggere i dati.`);
        return;
      }
      toast.error(getErrorMessage(e) || "Errore nell'eliminazione");
    },
  });

  // v8.6.45 — Ripristina un campo soft-deleted (UPDATE deleted_at = null)
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("marketing_custom_fields")
        .update({ deleted_at: null })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields_deleted"] });
      toast.success("Campo ripristinato");
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e) || "Errore nel ripristino"),
  });

  // v8.6.45 — Eliminazione DEFINITIVA (hard delete) dei campi già nella
  // tab Eliminati. Solo se non hanno valori storici associati.
  const purgeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const usage = await getCustomFieldUsageCounts(id);
      if (usage.contacts > 0 || usage.opportunities > 0 || usage.entities > 0) {
        throw new CustomFieldInUseError(usage);
      }
      const { error } = await supabase
        .from("marketing_custom_fields")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields_deleted"] });
      toast.success("Campo eliminato definitivamente");
    },
    onError: (e: unknown) => {
      if (e instanceof CustomFieldInUseError) {
        const total = e.usage.contacts + e.usage.opportunities + e.usage.entities;
        toast.error(`Impossibile eliminare definitivamente: ${total} valore/i ancora referenziati. Cancellali manualmente prima di procedere.`);
        return;
      }
      toast.error(getErrorMessage(e) || "Errore nell'eliminazione definitiva");
    },
  });

  const copyKey = (key: string) => {
    navigator.clipboard
      .writeText(key)
      .then(() => toast.success("Chiave copiata"))
      .catch(() => toast.error("Non è stato possibile copiare la chiave"));
  };

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const visibleFields = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Reset page on filter/search changes
  useEffect(() => { setCurrentPage(1); }, [search, activeTab, groupBy]);

  return (
    <div className="space-y-0">
      {/* ── Header tabs + buttons ──
          v8.6.45 — 2 tab prima `disabled` ora attive:
          - "Cartelle": CRUD folders custom
          - "Campi eliminati": lista soft-deleted + restore/purge */}
      {/* v8.6.74 — flex-wrap su mobile: prima i 3 tabs + button "Aggiungi
          campo" andavano in overflow su 375px → button tagliato a destra. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
          <TabsList className="bg-transparent h-auto p-0 gap-0 overflow-x-auto max-w-full">
            <TabsTrigger value="all" className="rounded-none border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-3 sm:px-4 pb-2.5 pt-1 shrink-0">
              Tutti i campi
            </TabsTrigger>
            <TabsTrigger value="folders" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-3 sm:px-4 pb-2.5 pt-1 shrink-0">
              Cartelle
            </TabsTrigger>
            <TabsTrigger value="deleted" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-3 sm:px-4 pb-2.5 pt-1 shrink-0">
              Campi eliminati
              {deletedFields.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {deletedFields.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 pb-1 shrink-0 w-full sm:w-auto">
          {!puoModificare ? null : activeTab === "folders" ? (
            <Button size="sm" onClick={openCreateFolderDialog} disabled={!companyId} className="w-full sm:w-auto">
              <FolderPlus className="h-4 w-4 mr-1.5" /> Aggiungi cartella
            </Button>
          ) : (
            <Button size="sm" onClick={openCreateDialog} disabled={!companyId} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-1.5" /> Aggiungi campo
            </Button>
          )}
        </div>
      </div>

      {!puoModificare && (
        <div className="pt-3">
          <AvvisoSolaLettura>
            Sola lettura: per aggiungere o modificare campi e cartelle serve il permesso «Modifica» su Personalizzazione.
          </AvvisoSolaLettura>
        </div>
      )}

      {/* ── Search bar (solo su "all") ── */}
      {activeTab === "all" && (
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
      )}

      {/* ── Banner copertura: campi su oggetti "solo API" ── */}
      {activeTab === "all" && apiOnlyCustomCount > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/60 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{apiOnlyCustomCount}</strong> camp{apiOnlyCustomCount === 1 ? "o" : "i"} su oggetti
            “solo API”: i valori si salvano e sono utilizzabili via API, automazioni e variabili email,
            ma non vengono ancora mostrati nei form della UI.
          </span>
        </div>
      )}

      {/* ── Table (solo tab "all") ── */}
      {activeTab === "all" && (isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Campi personalizzati non disponibili</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{getErrorMessage(error) || "Non è stato possibile caricare i campi personalizzati aziendali."}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
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
                {/* «Creato il» da 1280: a 1024 la tabella sbordava di 76px. */}
                <TableHead className="text-xs uppercase tracking-wider font-semibold md:max-xl:hidden">Creato Il</TableHead>
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
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {f.object}
                        {f.objectType && !isObjectRendered(f.objectType) && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 px-1.5 py-0 text-[10px] font-normal text-amber-700 dark:border-amber-900/50 dark:text-amber-300"
                          >
                            Solo API
                          </Badge>
                        )}
                      </span>
                    </TableCell>
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
                          aria-label="Copia chiave campo"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground md:max-xl:hidden">
                      {formatSafeDate(f.createdAt)}
                    </TableCell>
                    <TableCell>
                      {!f.isSystem && (
                        <div className={puoModificare ? "flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" : "hidden"}>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEditDialog(f)}
                            disabled={updateMutation.isPending}
                            aria-label="Modifica campo"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteTarget(f)}
                            disabled={deleteMutation.isPending}
                            aria-label="Elimina campo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ))}

      {/* ── Footer pagination (solo tab "all") ── */}
      {activeTab === "all" && (
        <TablePagination
          currentPage={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          pageSizeOptions={[25, 50, 100, 200]}
        />
      )}

      {/* ── Tab CARTELLE ── v8.6.45 — */}
      {activeTab === "folders" && (
        <div className="space-y-3 pt-3">
          {!softDeleteSupported && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Funzione in attivazione</AlertTitle>
              <AlertDescription className="text-xs">
                Le cartelle dei campi personalizzati richiedono una migration DB
                non ancora applicata (<code className="text-[10px]">20270517130000</code>).
                Contatta il super_admin per attivarla.
              </AlertDescription>
            </Alert>
          )}
          {folders.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed p-10 text-center">
              <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Nessuna cartella creata</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Crea cartelle per raggruppare campi custom dello stesso oggetto in sezioni logiche.
              </p>
              {puoModificare && (
                <Button size="sm" className="mt-4" onClick={openCreateFolderDialog} disabled={!companyId}>
                  <FolderPlus className="h-4 w-4 mr-1.5" /> Crea la prima cartella
                </Button>
              )}
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Nome</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Oggetto</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Colore</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Creata</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folders.map((f) => (
                    <TableRow key={f.id} className="group">
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-sm border"
                            style={{ backgroundColor: f.color ?? "#1E3A5F" }}
                          />
                          {f.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {f.object_type ? (OBJECT_NAME_MAP[f.object_type] ?? f.object_type) : "—"}
                      </TableCell>
                      <TableCell>
                        <code className="text-[11px] font-mono text-muted-foreground">{f.color ?? "—"}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatSafeDate(f.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className={puoModificare ? "flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" : "hidden"}>
                          <Button
                            size="icon" aria-label="Modifica cartella"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEditFolderDialog(f)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" aria-label="Elimina cartella"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setFolderDeleteId(f.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab CAMPI ELIMINATI ── v8.6.45 — */}
      {activeTab === "deleted" && (
        <div className="space-y-3 pt-3">
          {!softDeleteSupported && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Funzione in attivazione</AlertTitle>
              <AlertDescription className="text-xs">
                Il soft-delete dei campi personalizzati richiede una migration DB
                non ancora applicata (<code className="text-[10px]">20270517130000</code>).
                Contatta il super_admin per attivarla. Nel frattempo l'eliminazione
                resta definitiva.
              </AlertDescription>
            </Alert>
          )}
          {deletedFields.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed p-10 text-center">
              <Trash2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Nessun campo eliminato</p>
              <p className="text-xs text-muted-foreground mt-1">
                I campi che elimini finiscono qui. Puoi ripristinarli in qualsiasi momento o eliminarli definitivamente.
              </p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Nome Del Campo</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Oggetto</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Tipo</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-semibold">Eliminato Il</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider font-semibold">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(deletedFields as MarketingCustomFieldRow[]).map((f) => (
                    <TableRow key={f.id} className="group">
                      <TableCell className="font-medium text-sm">{f.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {OBJECT_NAME_MAP[f.object_type] ?? f.object_type}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{f.field_type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(f as { deleted_at?: string }).deleted_at ? formatSafeDate((f as { deleted_at?: string }).deleted_at!) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className={puoModificare ? "flex items-center justify-end gap-1" : "hidden"}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => restoreMutation.mutate(f.id)}
                            disabled={restoreMutation.isPending}
                          >
                            <Undo2 className="h-3 w-3" />
                            Ripristina
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (window.confirm("Eliminazione DEFINITIVA: il campo e tutti i suoi metadati saranno rimossi. Operazione irreversibile. Procedere?")) {
                                purgeMutation.mutate(f.id);
                              }
                            }}
                            disabled={purgeMutation.isPending}
                          >
                            <ShieldAlert className="h-3 w-3" />
                            Elimina definitivamente
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Dialog Cartelle */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{folderEditId ? "Modifica cartella" : "Nuova cartella"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="folder-name">Nome cartella *</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="es. Anagrafica fiscale"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="folder-object">Oggetto</Label>
              <Select value={folderObjectType} onValueChange={setFolderObjectType}>
                <SelectTrigger id="folder-object">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OBJECT_NAME_MAP).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="folder-color">Colore</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="folder-color"
                  type="color"
                  value={folderColor}
                  onChange={(e) => setFolderColor(e.target.value)}
                  className="h-9 w-16 p-1"
                />
                <code className="text-xs text-muted-foreground font-mono">{folderColor}</code>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={submitFolder}
              disabled={!folderName.trim() || createFolder.isPending || updateFolder.isPending}
            >
              {folderEditId ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Elimina Cartella */}
      <AlertDialog open={!!folderDeleteId} onOpenChange={(o) => !o && setFolderDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina cartella</AlertDialogTitle>
            <AlertDialogDescription>
              I campi che appartenevano a questa cartella resteranno disponibili (senza cartella). Vuoi procedere?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (folderDeleteId) deleteFolder.mutate(folderDeleteId);
                setFolderDeleteId(null);
              }}
              disabled={deleteFolder.isPending}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina campo personalizzato</AlertDialogTitle>
            <AlertDialogDescription>
              L'eliminazione e' consentita solo se il campo non contiene valori salvati su contatti, opportunita' o altre entita'. Questo evita perdita dati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id });
                setDeleteTarget(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add field dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Modifica Campo Personalizzato" : "Nuovo Campo Personalizzato"}</DialogTitle>
            <DialogDescription>
              Configura il campo e verifica l'anteprima prima di salvarlo. I dati esistenti vengono protetti da modifiche distruttive.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Oggetto *</Label>
              <Select value={objectType} onValueChange={handleObjectTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUP_OPTIONS.filter((g) => g.value !== "all").map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      <span className="inline-flex items-center gap-1.5">
                        {g.label}
                        {!isObjectRendered(g.value) && (
                          <span className="text-[10px] text-amber-600">(API only)</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* v8.6.46 — Warning UX onestà: avverte l'utente quando crea
                  un campo su un oggetto senza renderer integrato nei form. */}
              {!isObjectRendered(objectType) && (
                <Alert className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Oggetto API-only:</strong> il campo verrà salvato in DB e sarà
                    accessibile via API/integrazioni/automazioni, ma non viene ancora visualizzato
                    nei form della UI. Roadmap render universale in corso.
                  </AlertDescription>
                </Alert>
              )}
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
            {needsOptions && (
              <div className="space-y-1.5">
                <Label>Opzioni</Label>
                <Input
                  value={optionsInput}
                  onChange={(e) => setOptionsInput(e.target.value)}
                  placeholder="es. Condensazione, Tradizionale, Ibrida"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  Puoi separare le opzioni con virgole, punto e virgola o invio. I duplicati vengono rimossi.
                </p>
              </div>
            )}
            {/* v8.6.46 — C5: validazione + UX (is_required + help_text) */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cf-required"
                  checked={isRequired}
                  onCheckedChange={(c) => setIsRequired(c === true)}
                />
                <Label htmlFor="cf-required" className="text-sm font-medium cursor-pointer">
                  Campo obbligatorio
                </Label>
                <span className="text-xs text-muted-foreground">
                  l'utente deve compilarlo prima di salvare
                </span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-help">Testo di aiuto (opzionale)</Label>
                <Input
                  id="cf-help"
                  value={helpText}
                  onChange={(e) => setHelpText(e.target.value)}
                  placeholder="es. Indica la potenza nominale in kW"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  Mostrato come hint sotto al campo nel form.
                </p>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">Anteprima campo</p>
              <p><span className="text-muted-foreground">Oggetto:</span> {OBJECT_NAME_MAP[objectType] || objectType}</p>
              <p><span className="text-muted-foreground">Tipo:</span> {selectedType?.label || fieldType}</p>
              <p><span className="text-muted-foreground">Chiave:</span> <code>{previewKey}</code></p>
              {needsOptions && (
                <p><span className="text-muted-foreground">Opzioni valide:</span> {normalizedOptions.length ? normalizedOptions.join(", ") : "nessuna"}</p>
              )}
              {editTarget && (
                <p className="text-amber-700">
                  Se il campo contiene valori salvati, tipo, oggetto e opzioni non verranno modificati per evitare perdita dati.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => editTarget ? updateMutation.mutate() : addMutation.mutate()}
              disabled={!companyId || !normalizedName || (needsOptions && normalizedOptions.length === 0) || addMutation.isPending || updateMutation.isPending}
            >
              {addMutation.isPending || updateMutation.isPending
                ? "Salvataggio..."
                : editTarget ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
