/**
 * Menu App — griglia categorizzata di tutte le sezioni campo.
 * Ispirato a design mobile-first con sezioni raggruppate per categoria.
 * Sostituisce la sidebar su mobile.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, Calendar, Clock, CalendarDays, Receipt, Mic, MessageSquare,
  ShieldCheck, CreditCard, FileText, Ticket, Settings, LogOut,
  ClipboardCheck, Search, CheckSquare, Package, ListChecks, Truck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useMieiMezzi } from "@/hooks/useMezzi";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  url: string;
  color: string; // tailwind bg + text classes
}

interface AppSection {
  title: string;
  items: AppItem[];
}

export default function CampoMenu() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { isOperaio, isSubappaltatore } = useIsCampo();
  const [search, setSearch] = useState("");
  // «Il mio mezzo» compare solo a chi ha un mezzo in carico: sul telefono il meno è meglio.
  const { data: mieiMezzi = [] } = useMieiMezzi(isOperaio);

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");
  const roleLabel = isOperaio ? "Operaio" : "Subappaltatore";

  // Sezioni per operaio
  const operaioSections: AppSection[] = [
    {
      title: "Lavoro e Produttività",
      items: [
        { icon: Home, label: "Dashboard", url: "/campo", color: "text-blue-600 bg-blue-50" },
        { icon: Calendar, label: "Calendario", url: "/campo/calendario", color: "text-indigo-600 bg-indigo-50" },
        { icon: CheckSquare, label: "Attività", url: "/campo/attivita", color: "text-teal-600 bg-teal-50" },
        { icon: Mic, label: "Rapportino vocale", url: "/campo/rapportino-vocale", color: "text-violet-600 bg-violet-50" },
        { icon: ShieldCheck, label: "Sicurezza", url: "/campo/sicurezza", color: "text-emerald-600 bg-emerald-50" },
        { icon: ListChecks, label: "Avanzamento", url: "/campo/avanzamento", color: "text-cyan-600 bg-cyan-50" },
        { icon: Clock, label: "Timbratura", url: "/campo/timbratura", color: "text-lime-600 bg-lime-50" },
        { icon: Package, label: "Magazzino", url: "/campo/magazzino", color: "text-amber-700 bg-amber-50" },
        ...(mieiMezzi.length > 0
          ? [{ icon: Truck, label: mieiMezzi.length > 1 ? "I miei mezzi" : "Il mio mezzo", url: "/campo/mezzi", color: "text-slate-700 bg-slate-100" }]
          : []),
      ],
    },
    {
      title: "Comunicazione",
      items: [
        { icon: MessageSquare, label: "Chat", url: "/campo/chat", color: "text-blue-600 bg-blue-50" },
        { icon: Ticket, label: "Apri Ticket", url: "/campo/ticket/nuovo", color: "text-amber-600 bg-amber-50" },
      ],
    },
    {
      title: "HR e Personale",
      items: [
        { icon: Clock, label: "Presenze", url: "/campo/presenze", color: "text-teal-600 bg-teal-50" },
        { icon: CalendarDays, label: "Ferie", url: "/campo/ferie", color: "text-orange-600 bg-orange-50" },
        { icon: Receipt, label: "Cedolini", url: "/campo/cedolini", color: "text-pink-600 bg-pink-50" },
        { icon: CreditCard, label: "Tesserino", url: "/campo/tesserino", color: "text-cyan-600 bg-cyan-50" },
      ],
    },
    {
      title: "Documenti e Altro",
      items: [
        { icon: FileText, label: "Documenti", url: "/campo/documenti", color: "text-slate-600 bg-slate-50" },
        { icon: Settings, label: "Impostazioni", url: "/campo/impostazioni", color: "text-gray-600 bg-gray-50" },
      ],
    },
  ];

  // Sezioni per subappaltatore
  const subSections: AppSection[] = [
    {
      title: "Lavoro e Produttività",
      items: [
        { icon: Home, label: "Dashboard", url: "/campo", color: "text-blue-600 bg-blue-50" },
        { icon: Calendar, label: "Calendario", url: "/campo/calendario", color: "text-indigo-600 bg-indigo-50" },
        { icon: CheckSquare, label: "Attività", url: "/campo/attivita", color: "text-teal-600 bg-teal-50" },
        { icon: Mic, label: "Rapportino vocale", url: "/campo/rapportino-vocale", color: "text-violet-600 bg-violet-50" },
        { icon: ShieldCheck, label: "Sicurezza", url: "/campo/sicurezza", color: "text-emerald-600 bg-emerald-50" },
        { icon: ClipboardCheck, label: "Avanzamento", url: "/campo/avanzamento", color: "text-cyan-600 bg-cyan-50" },
      ],
    },
    {
      title: "Comunicazione",
      items: [
        { icon: MessageSquare, label: "Chat", url: "/campo/chat", color: "text-blue-600 bg-blue-50" },
        { icon: Ticket, label: "Apri Ticket", url: "/campo/ticket/nuovo", color: "text-amber-600 bg-amber-50" },
      ],
    },
    {
      title: "Documenti e Altro",
      items: [
        { icon: FileText, label: "Documenti", url: "/campo/sub/documenti", color: "text-slate-600 bg-slate-50" },
        { icon: Settings, label: "Impostazioni", url: "/campo/impostazioni", color: "text-gray-600 bg-gray-50" },
      ],
    },
  ];

  const sections = isOperaio ? operaioSections : subSections;

  // Filtra per ricerca
  const filteredSections = search.trim()
    ? sections.map(s => ({
        ...s,
        items: s.items.filter(i =>
          i.label.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(s => s.items.length > 0)
    : sections;

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-8">
      {/* Header con profilo */}
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground truncate">
            {profile?.first_name} {profile?.last_name}
          </p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center active:scale-95 transition-all"
          title="Esci"
        >
          <LogOut className="w-5 h-5 text-red-500" />
        </button>
      </div>

      {/* Barra ricerca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Cerca app"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-muted/80 border border-border/60 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
        />
      </div>

      {/* Sezioni categorizzate */}
      {filteredSections.map((section) => (
        <div key={section.title} className="bg-background border border-border/60 rounded-2xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {section.title}
          </p>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {section.items.map((item) => {
              const [textColor, bgColor] = item.color.split(" ");
              return (
                <button
                  key={item.url + item.label}
                  onClick={() => navigate(item.url)}
                  className="flex flex-col items-center gap-2 py-1 rounded-xl transition-all active:scale-95"
                >
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                    bgColor
                  )}>
                    <item.icon className={cn("w-6 h-6", textColor)} />
                  </div>
                  <span className="text-[11px] font-medium text-foreground text-center leading-tight line-clamp-2 max-w-[80px]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Nessun risultato */}
      {filteredSections.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nessuna app trovata per "{search}"</p>
        </div>
      )}
    </div>
  );
}
