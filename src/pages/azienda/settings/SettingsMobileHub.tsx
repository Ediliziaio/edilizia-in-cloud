/**
 * SettingsMobileHub — v8.6.70
 *
 * Hub mobile delle Impostazioni: griglia di card cliccabili con icone, una
 * per ogni sezione, raggruppate per categoria. Sostituisce il vecchio
 * dropdown "Vai a una sezione…" e il redirect automatico a "mio-profilo"
 * quando l'utente entra in /azienda/impostazioni da mobile.
 *
 * UX:
 *   - Tap sull'icona della rotellina nell'header → naviga qui
 *   - Mostra subito tutte le sezioni con icona+label
 *   - Tap su una card → naviga alla pagina specifica
 *   - Su tablet/desktop la rotta index ridirige a "mio-profilo"
 *     (questo componente è quindi mobile-first)
 */
import { Link } from "react-router-dom";
import {
  UserCircle, ShieldCheck, Building2, MapPin, Paintbrush, Wallet, Receipt,
  Users, ListOrdered, FolderOpen, FileText, FileSignature, Truck, ScrollText,
  Banknote, Sparkles, Briefcase, Plug, Calendar, Mail, Tag, Settings as SettingsIcon,
} from "lucide-react";

interface SectionItem {
  to: string;
  label: string;
  icon: typeof UserCircle;
  iconColor: string;
}

interface Section {
  label: string;
  items: SectionItem[];
}

const SECTIONS: Section[] = [
  {
    label: "Account",
    items: [
      { to: "/azienda/impostazioni/mio-profilo",        label: "Il mio profilo",      icon: UserCircle,  iconColor: "text-blue-600" },
      { to: "/azienda/impostazioni/sicurezza-privacy",  label: "Sicurezza & privacy", icon: ShieldCheck, iconColor: "text-emerald-600" },
    ],
  },
  {
    label: "La mia azienda",
    items: [
      { to: "/azienda/impostazioni/profilo",      label: "Profilo aziendale", icon: Building2, iconColor: "text-violet-600" },
      { to: "/azienda/impostazioni/sedi",         label: "Sedi",              icon: MapPin,    iconColor: "text-rose-600" },
      { to: "/azienda/impostazioni/branding",     label: "White-Label",       icon: Paintbrush, iconColor: "text-amber-600" },
      { to: "/azienda/impostazioni/abbonamento",  label: "Piano abbonamento", icon: Wallet,    iconColor: "text-indigo-600" },
      { to: "/azienda/impostazioni/fatturazione", label: "Fatturazione",      icon: Receipt,   iconColor: "text-orange-600" },
      { to: "/azienda/impostazioni/persone",      label: "Persone & accessi", icon: Users,     iconColor: "text-cyan-600" },
    ],
  },
  {
    label: "Cantieri & Costi",
    items: [
      { to: "/azienda/impostazioni/stati-ordine",    label: "Stati ordine",     icon: ListOrdered, iconColor: "text-blue-600" },
      { to: "/azienda/impostazioni/categorie-costi", label: "Categorie costi",  icon: FolderOpen,  iconColor: "text-emerald-600" },
      { to: "/azienda/impostazioni/fornitori",       label: "Fornitori",        icon: Truck,       iconColor: "text-amber-600" },
    ],
  },
  {
    label: "Vendite e operativo",
    items: [
      { to: "/azienda/impostazioni/listino",            label: "Listino prodotti", icon: Tag,            iconColor: "text-blue-600" },
      { to: "/azienda/impostazioni/template-preventivi", label: "Template offerte", icon: FileText,       iconColor: "text-violet-600" },
      { to: "/azienda/impostazioni/firma-elettronica",  label: "Firma elettronica", icon: FileSignature, iconColor: "text-rose-600" },
      { to: "/azienda/impostazioni/sopralluoghi",       label: "Sopralluoghi",     icon: ScrollText,    iconColor: "text-amber-600" },
      { to: "/azienda/impostazioni/finanziamenti",      label: "Finanziamenti",    icon: Banknote,      iconColor: "text-emerald-600" },
    ],
  },
  {
    label: "Marketing e integrazioni",
    items: [
      { to: "/azienda/impostazioni/calendari",     label: "Calendari marketing", icon: Calendar, iconColor: "text-blue-600" },
      { to: "/azienda/impostazioni/lead-forms",    label: "Lead Facebook",       icon: Mail,     iconColor: "text-cyan-600" },
      { to: "/azienda/impostazioni/integrazioni",  label: "Integrazioni",        icon: Plug,     iconColor: "text-violet-600" },
    ],
  },
];

export default function SettingsMobileHub() {
  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Tutte le impostazioni</h2>
          <p className="text-xs text-muted-foreground">
            Scegli la sezione che vuoi configurare.
          </p>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.label} className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            {section.label}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex flex-col items-start gap-2 rounded-xl border bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${item.iconColor}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium leading-tight">{item.label}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-center">
        <p className="text-xs text-muted-foreground">
          Cerchi qualcosa di specifico? Usa la <strong>ricerca</strong> in alto (🔍 cerca impostazioni).
        </p>
      </div>
    </div>
  );
}
