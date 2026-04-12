/**
 * Menu App — griglia categorizzata di tutte le sezioni cliente.
 * Ispirato a design mobile-first con sezioni raggruppate per categoria.
 * Sostituisce la sidebar su mobile.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  FileText,
  PenTool,
  CreditCard,
  CalendarDays,
  HeadphonesIcon,
  Plus,
  User,
  Search,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  url: string;
  color: string;
}

interface AppSection {
  title: string;
  items: AppItem[];
}

const sections: AppSection[] = [
  {
    title: "Ordini e Pagamenti",
    items: [
      { icon: ClipboardList, label: "I Miei Ordini", url: "/cliente", color: "text-blue-600 bg-blue-50" },
      { icon: CreditCard, label: "Pagamenti", url: "/cliente/rate", color: "text-orange-600 bg-orange-50" },
      { icon: CalendarDays, label: "Appuntamenti", url: "/cliente/appuntamenti", color: "text-indigo-600 bg-indigo-50" },
    ],
  },
  {
    title: "Documenti",
    items: [
      { icon: FileText, label: "Documenti", url: "/cliente/documenti", color: "text-slate-600 bg-slate-50" },
      { icon: PenTool, label: "Firma", url: "/cliente/firma", color: "text-emerald-600 bg-emerald-50" },
    ],
  },
  {
    title: "Assistenza",
    items: [
      { icon: HeadphonesIcon, label: "I Miei Ticket", url: "/cliente/assistenza", color: "text-violet-600 bg-violet-50" },
      { icon: Plus, label: "Nuovo Ticket", url: "/cliente/assistenza/nuovo", color: "text-emerald-600 bg-emerald-50" },
    ],
  },
  {
    title: "Account",
    items: [
      { icon: User, label: "Profilo", url: "/cliente/profilo", color: "text-gray-600 bg-gray-50" },
    ],
  },
];

export default function CustomerMenu() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [search, setSearch] = useState("");

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");

  // Filtra per ricerca
  const filteredSections = search.trim()
    ? sections
        .map((s) => ({
          ...s,
          items: s.items.filter((i) =>
            i.label.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter((s) => s.items.length > 0)
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
          <p className="text-xs text-muted-foreground">Cliente</p>
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
          placeholder="Cerca sezione"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-muted/80 border border-border/60 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
        />
      </div>

      {/* Sezioni categorizzate */}
      {filteredSections.map((section) => (
        <div
          key={section.title}
          className="bg-background border border-border/60 rounded-2xl p-4"
        >
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
                  <div
                    className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                      bgColor
                    )}
                  >
                    <item.icon className={cn("w-6 h-6", textColor)} />
                  </div>
                  <span className="text-[11px] font-medium text-foreground text-center leading-tight line-clamp-2 max-w-[72px]">
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
          <p className="text-sm text-muted-foreground">
            Nessuna sezione trovata per &quot;{search}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
