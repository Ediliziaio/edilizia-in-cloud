/**
 * MetaLeadFormBuilder — replica fedele del Meta Lead Form Manager.
 *
 * Sostituisce il vecchio "step 3 modulo" con i campi semplici (textarea
 * separati da virgola) con un editor strutturato che produce il payload
 * esatto della Meta Lead Ads API:
 *
 *   • Form Type: MORE_VOLUME (rapido, 3 step) vs HIGHER_INTENT (4 step con review)
 *   • Greeting / Intro screen (headline + body + image)
 *   • Questions (prefilled Meta fields + custom questions)
 *   • Privacy Policy URL (obbligatoria Meta)
 *   • Custom thank you screen (titolo + body + CTA button + URL)
 *   • Follow-up actions (phone call / WhatsApp / link)
 *
 * Struttura allineata 1:1 con il payload `/leadgen_form` Meta Marketing API:
 *   POST /{page_id}/leadgen_forms
 *     name, locale, follow_up_action_url, privacy_policy,
 *     questions[{ type, key, label, options }],
 *     context_card, thank_you_page
 */

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  HelpCircle,
  Mail,
  MapPin,
  Phone,
  Plus,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  User as UserIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════════
// TYPES — Meta Lead Form structure
// ════════════════════════════════════════════════════════════════════

export type MetaFormType = "MORE_VOLUME" | "HIGHER_INTENT";

/** Campi prefilled Meta (popolati automaticamente dal profilo utente FB/IG) */
export type MetaPrefilledFieldKey =
  | "EMAIL"
  | "FULL_NAME"
  | "FIRST_NAME"
  | "LAST_NAME"
  | "PHONE"
  | "STREET_ADDRESS"
  | "CITY"
  | "STATE"
  | "ZIP"
  | "COUNTRY"
  | "DATE_OF_BIRTH"
  | "GENDER";

export interface PrefilledField {
  kind: "prefilled";
  key: MetaPrefilledFieldKey;
  label?: string; // Override label, default Meta default
}

export type CustomQuestionType =
  | "short_answer" // testo libero corto
  | "multiple_choice" // scelta singola tra N opzioni
  | "conditional" // condizionale (V2)
  | "appointment_request"; // calendario (V2)

export interface CustomQuestion {
  kind: "custom";
  key: string; // identificatore univoco
  type: CustomQuestionType;
  label: string;
  options?: string[]; // solo per multiple_choice
  required?: boolean;
}

export type FormQuestion = PrefilledField | CustomQuestion;

export interface MetaLeadFormState {
  /** Nome interno del form (visibile solo all'admin) */
  name: string;
  /** Tipo form: MORE_VOLUME (rapido) vs HIGHER_INTENT (con review) */
  formType: MetaFormType;
  /** Lingua del form (default it_IT) */
  locale: string;
  /** Intro screen / Context card */
  introHeadline: string;
  introBody: string;
  introImageUrl?: string;
  showIntro: boolean;
  /** Domande del form */
  questions: FormQuestion[];
  /** URL Privacy Policy (obbligatoria Meta) */
  privacyPolicyUrl: string;
  /** Optional: testo custom privacy disclaimer */
  customPrivacyDisclaimer?: string;
  /** Thank-you screen */
  thankYouHeadline: string;
  thankYouBody: string;
  thankYouButtonText: string;
  thankYouButtonType: "VIEW_WEBSITE" | "CALL_BUSINESS" | "MESSAGE_BUSINESS" | "DOWNLOAD";
  thankYouButtonUrl?: string;
  thankYouBusinessPhone?: string;
  /** Follow-up automatico */
  followUpInstructions?: string;
}

interface Props {
  value: MetaLeadFormState;
  onChange: (next: MetaLeadFormState) => void;
  /** Default suggeriti basati sull'offerta */
  defaultOffer?: string;
  defaultCompanyName?: string;
  defaultCompanyPhone?: string;
}

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const PREFILLED_OPTIONS: Array<{
  key: MetaPrefilledFieldKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "contatto" | "anagrafica" | "indirizzo";
  recommended?: boolean;
}> = [
  { key: "FULL_NAME", label: "Nome completo", icon: UserIcon, category: "contatto", recommended: true },
  { key: "EMAIL", label: "Email", icon: Mail, category: "contatto", recommended: true },
  { key: "PHONE", label: "Telefono / cellulare", icon: Phone, category: "contatto", recommended: true },
  { key: "FIRST_NAME", label: "Solo nome", icon: UserIcon, category: "contatto" },
  { key: "LAST_NAME", label: "Solo cognome", icon: UserIcon, category: "contatto" },
  { key: "CITY", label: "Città", icon: MapPin, category: "indirizzo", recommended: true },
  { key: "ZIP", label: "CAP", icon: MapPin, category: "indirizzo" },
  { key: "STREET_ADDRESS", label: "Indirizzo via", icon: MapPin, category: "indirizzo" },
  { key: "STATE", label: "Provincia / Regione", icon: MapPin, category: "indirizzo" },
  { key: "COUNTRY", label: "Stato", icon: MapPin, category: "indirizzo" },
  { key: "DATE_OF_BIRTH", label: "Data nascita", icon: UserIcon, category: "anagrafica" },
  { key: "GENDER", label: "Genere", icon: UserIcon, category: "anagrafica" },
];

const QUALIFYING_TEMPLATES: Array<{
  label: string;
  question: CustomQuestion;
}> = [
  {
    label: "🏠 Tipo immobile (multipla)",
    question: {
      kind: "custom",
      key: "tipo_immobile",
      type: "multiple_choice",
      label: "Che tipo di immobile è?",
      options: ["Appartamento", "Casa singola", "Villetta", "Locale commerciale"],
      required: true,
    },
  },
  {
    label: "⏱️ Quando iniziare (multipla)",
    question: {
      kind: "custom",
      key: "tempistica",
      type: "multiple_choice",
      label: "Quando vorresti iniziare i lavori?",
      options: ["Entro 1 mese", "Entro 3 mesi", "Entro 6 mesi", "Ancora in valutazione"],
      required: true,
    },
  },
  {
    label: "💰 Budget orientativo (multipla)",
    question: {
      kind: "custom",
      key: "budget",
      type: "multiple_choice",
      label: "Hai un budget di massima?",
      options: ["Fino a 5.000€", "5.000–15.000€", "15.000–30.000€", "Oltre 30.000€", "Da definire"],
    },
  },
  {
    label: "📐 Misure (testo)",
    question: {
      kind: "custom",
      key: "metri_quadri",
      type: "short_answer",
      label: "Quanti metri quadri ha la zona da intervenire (circa)?",
    },
  },
  {
    label: "🔢 Quantità (multipla)",
    question: {
      kind: "custom",
      key: "quantita_finestre",
      type: "multiple_choice",
      label: "Quante finestre devi cambiare?",
      options: ["1-3", "4-6", "7-10", "Più di 10"],
    },
  },
  {
    label: "📝 Note (testo libero)",
    question: {
      kind: "custom",
      key: "note",
      type: "short_answer",
      label: "Qualcosa che dovremmo sapere prima del sopralluogo?",
    },
  },
];

export const META_FORM_DEFAULTS: MetaLeadFormState = {
  name: "Modulo lead campagna",
  formType: "HIGHER_INTENT",
  locale: "it_IT",
  introHeadline: "Vuoi un preventivo chiaro?",
  introBody: "Compila il modulo: ti contattiamo entro 24h con una proposta su misura.",
  showIntro: true,
  questions: [
    { kind: "prefilled", key: "FULL_NAME" },
    { kind: "prefilled", key: "PHONE" },
    { kind: "prefilled", key: "EMAIL" },
    { kind: "prefilled", key: "CITY" },
    {
      kind: "custom",
      key: "tipo_immobile",
      type: "multiple_choice",
      label: "Che tipo di immobile è?",
      options: ["Appartamento", "Casa singola", "Villetta"],
      required: true,
    },
  ],
  privacyPolicyUrl: "",
  thankYouHeadline: "Grazie! Ti contattiamo a breve.",
  thankYouBody: "Abbiamo ricevuto la tua richiesta. Ti chiameremo entro 24h dal numero che vedrai nella nostra firma.",
  thankYouButtonText: "Visita il sito",
  thankYouButtonType: "VIEW_WEBSITE",
  thankYouButtonUrl: "",
};

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════

export function MetaLeadFormBuilder({
  value,
  onChange,
  defaultOffer,
  defaultCompanyName,
  defaultCompanyPhone,
}: Props) {
  const [activeSection, setActiveSection] = useState<"intro" | "fields" | "privacy" | "thanks">("fields");

  const update = (patch: Partial<MetaLeadFormState>) => onChange({ ...value, ...patch });

  const prefilledKeys = useMemo(
    () => new Set(value.questions.filter((q) => q.kind === "prefilled").map((q) => (q as PrefilledField).key)),
    [value.questions],
  );

  const togglePrefilled = (key: MetaPrefilledFieldKey) => {
    if (prefilledKeys.has(key)) {
      update({ questions: value.questions.filter((q) => !(q.kind === "prefilled" && (q as PrefilledField).key === key)) });
    } else {
      update({ questions: [...value.questions, { kind: "prefilled", key }] });
    }
  };

  const addCustomQuestion = (q: CustomQuestion) => {
    // Evita duplicati per key
    if (value.questions.some((existing) => existing.kind === "custom" && (existing as CustomQuestion).key === q.key)) {
      return;
    }
    update({ questions: [...value.questions, q] });
  };

  const removeQuestion = (index: number) => {
    update({ questions: value.questions.filter((_, i) => i !== index) });
  };

  const updateCustom = (index: number, patch: Partial<CustomQuestion>) => {
    update({
      questions: value.questions.map((q, i) =>
        i === index && q.kind === "custom" ? { ...(q as CustomQuestion), ...patch } : q,
      ),
    });
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= value.questions.length) return;
    const next = [...value.questions];
    [next[index], next[target]] = [next[target], next[index]];
    update({ questions: next });
  };

  return (
    <div className="space-y-5">
      {/* === FORM TYPE — More Volume vs Higher Intent === */}
      <section className="rounded-2xl border bg-white p-5">
        <header className="mb-3">
          <h3 className="text-base font-semibold text-slate-950">Tipologia modulo</h3>
          <p className="text-xs text-slate-500">
            Questa è la prima scelta di Meta Lead Forms. Diversi tipi = diversa qualità lead.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormTypeCard
            active={value.formType === "MORE_VOLUME"}
            title="More Volume"
            description="3 step semplici. Più lead, qualità media. Per servizi dove serve volume di contatti."
            timeToFill="~30 secondi"
            qualityHint="Volume alto · Qualità media"
            tone="blue"
            onClick={() => update({ formType: "MORE_VOLUME" })}
          />
          <FormTypeCard
            active={value.formType === "HIGHER_INTENT"}
            title="Higher Intent"
            description="4 step con review pre-invio. Meno lead, qualità alta. Consigliato per edilizia/preventivi."
            timeToFill="~60 secondi"
            qualityHint="Volume medio · Qualità alta"
            tone="emerald"
            badge="Consigliato"
            onClick={() => update({ formType: "HIGHER_INTENT" })}
          />
        </div>
      </section>

      {/* === SECTION TABS === */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            { v: "intro", label: "1. Introduzione", icon: ScrollText },
            { v: "fields", label: "2. Domande", icon: HelpCircle },
            { v: "privacy", label: "3. Privacy", icon: Shield },
            { v: "thanks", label: "4. Grazie", icon: Check },
          ] as const
        ).map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.v}
              type="button"
              onClick={() => setActiveSection(s.v)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
                activeSection === s.v ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:bg-white/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* === INTRO SECTION === */}
      {activeSection === "intro" && (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Schermata introduttiva</h3>
              <p className="text-xs text-slate-500">
                Il primo step che vede l'utente quando apre il form. Spiega cosa otterrà compilando.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Mostra intro</Label>
              <Switch checked={value.showIntro} onCheckedChange={(v) => update({ showIntro: v })} />
            </div>
          </header>
          {value.showIntro && (
            <>
              <div>
                <Label className="mb-1 block text-xs font-semibold">Titolo</Label>
                <Input
                  value={value.introHeadline}
                  onChange={(e) => update({ introHeadline: e.target.value.slice(0, 60) })}
                  maxLength={60}
                  placeholder="Vuoi un preventivo chiaro?"
                />
                <p className="mt-0.5 text-[10px] text-slate-500 max-md:text-[11px]">{value.introHeadline.length}/60</p>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-semibold">Descrizione</Label>
                <Textarea
                  value={value.introBody}
                  onChange={(e) => update({ introBody: e.target.value.slice(0, 600) })}
                  maxLength={600}
                  placeholder="Compila il modulo: ti contattiamo entro 24h con una proposta su misura."
                  className="min-h-20"
                />
                <p className="mt-0.5 text-[10px] text-slate-500 max-md:text-[11px]">{value.introBody.length}/600</p>
              </div>
            </>
          )}
        </section>
      )}

      {/* === FIELDS SECTION === */}
      {activeSection === "fields" && (
        <section className="space-y-4">
          {/* PREFILLED FIELDS — Meta-populated */}
          <div className="rounded-2xl border bg-white p-5">
            <header className="mb-3">
              <h3 className="text-base font-semibold text-slate-950">
                Campi pre-compilati da Meta
              </h3>
              <p className="text-xs text-slate-500">
                Meta inserisce automaticamente questi dati dal profilo dell'utente. L'utente
                conferma solo. <strong>Maggiore il numero, minore la qualità del lead</strong> —
                stai sul minimo necessario (nome, telefono, email + 1-2).
              </p>
            </header>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PREFILLED_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const checked = prefilledKeys.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => togglePrefilled(opt.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs",
                      checked
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", checked ? "text-blue-600" : "text-slate-400")} />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.recommended && !checked && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[9px] text-emerald-700 max-md:text-[11px]">★</Badge>
                    )}
                    {checked && <Check className="h-3.5 w-3.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CUSTOM QUESTIONS — Templates */}
          <div className="rounded-2xl border bg-white p-5">
            <header className="mb-3">
              <h3 className="text-base font-semibold text-slate-950">
                Domande di qualificazione
              </h3>
              <p className="text-xs text-slate-500">
                Domande personalizzate per filtrare lead bassa qualità. Click su un template per aggiungerlo,
                poi personalizza.
              </p>
            </header>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUALIFYING_TEMPLATES.map((tpl) => {
                const already = value.questions.some(
                  (q) => q.kind === "custom" && (q as CustomQuestion).key === tpl.question.key,
                );
                return (
                  <button
                    key={tpl.question.key}
                    type="button"
                    onClick={() => addCustomQuestion({ ...tpl.question, key: `${tpl.question.key}_${Date.now()}` })}
                    disabled={already}
                    className={cn(
                      "rounded-lg border p-2 text-left text-xs",
                      already
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50",
                    )}
                  >
                    {tpl.label} {already && "✓"}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => addCustomQuestion({
                  kind: "custom",
                  key: `custom_${Date.now()}`,
                  type: "short_answer",
                  label: "Nuova domanda...",
                })}
                className="rounded-lg border border-dashed border-slate-300 p-2 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                <Plus className="mr-1 inline h-3 w-3" /> Domanda custom
              </button>
            </div>

            {/* QUESTIONS LIST */}
            {value.questions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                Nessuna domanda. Aggiungi almeno nome+telefono+email per partire.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase text-slate-500 max-md:text-[11px]">
                  Ordine domande nel form
                </p>
                {value.questions.map((q, idx) => (
                  <QuestionRow
                    key={`${q.kind}-${idx}-${q.kind === "prefilled" ? (q as PrefilledField).key : (q as CustomQuestion).key}`}
                    question={q}
                    index={idx}
                    total={value.questions.length}
                    onRemove={() => removeQuestion(idx)}
                    onMoveUp={() => moveQuestion(idx, "up")}
                    onMoveDown={() => moveQuestion(idx, "down")}
                    onUpdateCustom={(patch) => updateCustom(idx, patch)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* === PRIVACY SECTION === */}
      {activeSection === "privacy" && (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <header>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Privacy Policy
            </h3>
            <p className="text-xs text-slate-500">
              <strong>OBBLIGATORIA per Meta.</strong> URL pubblico HTTPS della tua policy privacy aziendale (GDPR-compliant).
            </p>
          </header>
          <div>
            <Label className="mb-1 block text-xs font-semibold">URL Privacy Policy *</Label>
            <Input
              value={value.privacyPolicyUrl}
              onChange={(e) => update({ privacyPolicyUrl: e.target.value.trim() })}
              placeholder="https://www.tuaazienda.it/privacy-policy"
              type="url"
            />
            {value.privacyPolicyUrl && !value.privacyPolicyUrl.startsWith("https://") && (
              <p className="mt-1 text-xs text-rose-600">⚠ Meta richiede HTTPS</p>
            )}
            {value.privacyPolicyUrl && value.privacyPolicyUrl.startsWith("https://") && (
              <p className="mt-1 text-xs text-emerald-600">✓ URL valida</p>
            )}
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold">Disclaimer custom (opzionale)</Label>
            <Textarea
              value={value.customPrivacyDisclaimer ?? ""}
              onChange={(e) => update({ customPrivacyDisclaimer: e.target.value.slice(0, 500) })}
              placeholder="Es. Trattiamo i tuoi dati solo per inviarti il preventivo. Niente spam, niente terze parti."
              maxLength={500}
              className="min-h-16"
            />
          </div>
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTitle className="text-xs">Tip GDPR</AlertTitle>
            <AlertDescription className="text-[11px]">
              La policy deve specificare: finalità (lead/preventivo), base giuridica (consenso), durata
              conservazione, diritti dell'utente (cancellazione/portabilità), eventuale trasferimento dati
              (es. CRM).
            </AlertDescription>
          </Alert>
        </section>
      )}

      {/* === THANK YOU SECTION === */}
      {activeSection === "thanks" && (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <header>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <Sparkles className="h-4 w-4 text-fuchsia-600" />
              Schermata "Grazie"
            </h3>
            <p className="text-xs text-slate-500">
              Ultimo passo: cosa l'utente vede dopo aver inviato. È il momento per "agganciarlo" subito (call,
              WhatsApp, sito).
            </p>
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-semibold">Titolo</Label>
              <Input
                value={value.thankYouHeadline}
                onChange={(e) => update({ thankYouHeadline: e.target.value.slice(0, 60) })}
                maxLength={60}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs font-semibold">Testo CTA bottone</Label>
              <Input
                value={value.thankYouButtonText}
                onChange={(e) => update({ thankYouButtonText: e.target.value.slice(0, 30) })}
                maxLength={30}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold">Testo schermata</Label>
            <Textarea
              value={value.thankYouBody}
              onChange={(e) => update({ thankYouBody: e.target.value.slice(0, 500) })}
              maxLength={500}
              className="min-h-20"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-semibold">Tipo bottone CTA</Label>
              <Select
                value={value.thankYouButtonType}
                onValueChange={(v: MetaLeadFormState["thankYouButtonType"]) => update({ thankYouButtonType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEW_WEBSITE">Apri sito web</SelectItem>
                  <SelectItem value="CALL_BUSINESS">Chiama azienda</SelectItem>
                  <SelectItem value="MESSAGE_BUSINESS">Scrivi su Messenger/WhatsApp</SelectItem>
                  <SelectItem value="DOWNLOAD">Scarica file</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs font-semibold">
                {value.thankYouButtonType === "CALL_BUSINESS" ? "Numero telefono *" : "URL destinazione *"}
              </Label>
              <Input
                value={value.thankYouButtonType === "CALL_BUSINESS" ? (value.thankYouBusinessPhone ?? "") : (value.thankYouButtonUrl ?? "")}
                onChange={(e) => {
                  if (value.thankYouButtonType === "CALL_BUSINESS") {
                    update({ thankYouBusinessPhone: e.target.value });
                  } else {
                    update({ thankYouButtonUrl: e.target.value });
                  }
                }}
                placeholder={value.thankYouButtonType === "CALL_BUSINESS" ? defaultCompanyPhone ?? "+39 ..." : "https://..."}
              />
            </div>
          </div>
        </section>
      )}

      {/* === LIVE SUMMARY === */}
      <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-3">
        <p className="text-xs font-semibold text-slate-700">📋 Riepilogo modulo</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <Badge variant="outline">{value.formType === "MORE_VOLUME" ? "Volume" : "Higher Intent"}</Badge>
          <Badge variant="outline">{value.questions.length} domande</Badge>
          <Badge variant="outline">{value.questions.filter((q) => q.kind === "prefilled").length} prefilled</Badge>
          <Badge variant="outline">{value.questions.filter((q) => q.kind === "custom").length} custom</Badge>
          {value.privacyPolicyUrl?.startsWith("https://") ? (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">✓ Privacy ok</Badge>
          ) : (
            <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">⚠ Privacy URL mancante</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════

function FormTypeCard({
  active,
  title,
  description,
  timeToFill,
  qualityHint,
  tone,
  badge,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  timeToFill: string;
  qualityHint: string;
  tone: "blue" | "emerald";
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition",
        active
          ? tone === "emerald"
            ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200"
            : "border-blue-300 bg-blue-50 ring-2 ring-blue-200"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-950">{title}</p>
          {badge && (
            <Badge className={cn("text-[9px]", tone === "emerald" ? "bg-emerald-600" : "bg-blue-600", "text-white")}>
              {badge}
            </Badge>
          )}
        </div>
        {active && (
          <span className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-white",
            tone === "emerald" ? "bg-emerald-600" : "bg-blue-600",
          )}>
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
      <p className="text-xs text-slate-600">{description}</p>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] max-md:text-[11px]">
        <Badge variant="outline">⏱ {timeToFill}</Badge>
        <Badge variant="outline">{qualityHint}</Badge>
      </div>
    </button>
  );
}

function QuestionRow({
  question,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdateCustom,
}: {
  question: FormQuestion;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateCustom: (patch: Partial<CustomQuestion>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPrefilled = question.kind === "prefilled";
  const prefilledLabel = isPrefilled
    ? PREFILLED_OPTIONS.find((o) => o.key === (question as PrefilledField).key)?.label ?? (question as PrefilledField).key
    : null;
  const custom = !isPrefilled ? (question as CustomQuestion) : null;

  return (
    <div className={cn(
      "rounded-lg border p-3",
      isPrefilled ? "border-blue-200 bg-blue-50/30" : "border-violet-200 bg-violet-50/30",
    )}>
      <div className="flex items-center gap-2">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Badge variant="outline" className="shrink-0 text-[9px] max-md:text-[11px]">
          {isPrefilled ? "Meta" : "Custom"}
        </Badge>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
          {isPrefilled ? prefilledLabel : custom?.label}
        </p>
        {custom?.required && <Badge className="bg-rose-500 text-[9px] text-white max-md:text-[11px]">obbligatoria</Badge>}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={index === 0}>
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={index === total - 1}>
          <ChevronDown className="h-3 w-3" />
        </Button>
        {custom && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Chiudi" : "Modifica"}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
        </Button>
      </div>
      {expanded && custom && (
        <div className="mt-3 space-y-2 border-t border-violet-200 pt-3">
          <div>
            <Label className="mb-1 block text-[10px] font-semibold max-md:text-[11px]">Domanda</Label>
            <Input
              value={custom.label}
              onChange={(e) => onUpdateCustom({ label: e.target.value.slice(0, 200) })}
              maxLength={200}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-[10px] font-semibold max-md:text-[11px]">Tipo risposta</Label>
              <Select
                value={custom.type}
                onValueChange={(v: CustomQuestionType) => onUpdateCustom({ type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="short_answer">Testo libero corto</SelectItem>
                  <SelectItem value="multiple_choice">Scelta multipla</SelectItem>
                  <SelectItem value="conditional" disabled>Condizionale (V2)</SelectItem>
                  <SelectItem value="appointment_request" disabled>Appuntamento (V2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox
                checked={custom.required ?? false}
                onCheckedChange={(v) => onUpdateCustom({ required: !!v })}
              />
              <Label className="text-xs">Domanda obbligatoria</Label>
            </div>
          </div>
          {custom.type === "multiple_choice" && (
            <div>
              <Label className="mb-1 block text-[10px] font-semibold max-md:text-[11px]">Opzioni di risposta (una per riga)</Label>
              <Textarea
                value={(custom.options ?? []).join("\n")}
                onChange={(e) => onUpdateCustom({ options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10) })}
                placeholder="Opzione 1&#10;Opzione 2&#10;Opzione 3"
                className="min-h-20 font-mono text-xs"
              />
              <p className="mt-0.5 text-[10px] text-slate-500 max-md:text-[11px]">Max 10 opzioni</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MetaLeadFormBuilder;
