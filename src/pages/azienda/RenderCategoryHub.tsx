import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  DoorOpen, Bath, Building2, Grid3X3, PanelLeftClose, Home, Sofa,
  Sparkles, Image, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const categories = [
  {
    id: "infissi",
    title: "Infissi",
    description: "Sostituisci finestre e porte con un click",
    icon: DoorOpen,
    color: "bg-blue-50 text-blue-600",
    path: "/azienda/render/infissi",
    active: true,
    badge: "Attivo",
  },
  {
    id: "bagno",
    title: "Bagno",
    description: "Rinnova il bagno scegliendo piastrelle, sanitari e arredi",
    icon: Bath,
    color: "bg-cyan-50 text-cyan-600",
    path: "/azienda/render/bagno",
    active: true,
    badge: "Attivo",
  },
  {
    id: "facciata",
    title: "Facciata",
    description: "Visualizza la nuova facciata del tuo edificio",
    icon: Building2,
    color: "bg-orange-50 text-orange-600",
    path: "/azienda/render/facciata",
    active: true,
    badge: "Attivo",
  },
  {
    id: "pavimento",
    title: "Pavimento",
    description: "Cambia pavimento mantenendo tutto il resto invariato",
    icon: Grid3X3,
    color: "bg-amber-50 text-amber-600",
    path: "/azienda/render/pavimento",
    active: true,
    badge: "Attivo",
  },
  {
    id: "persiane",
    title: "Persiane",
    description: "Aggiungi, sostituisci o rimuovi persiane e scuri",
    icon: PanelLeftClose,
    color: "bg-green-50 text-green-600",
    path: "/azienda/render/persiane",
    active: true,
    badge: "Attivo",
  },
  {
    id: "tetto",
    title: "Tetto",
    description: "Nuova copertura, gronde e lucernari in un render",
    icon: Home,
    color: "bg-red-50 text-red-600",
    path: "/azienda/render/tetto",
    active: true,
    badge: "Attivo",
  },
  {
    id: "stanza",
    title: "Stanza / Interni",
    description: "Trasforma qualsiasi ambiente: cucina, soggiorno, camera",
    icon: Sofa,
    color: "bg-purple-50 text-purple-600",
    path: "/azienda/render/stanza",
    active: true,
    badge: "Attivo",
  },
];

export default function RenderCategoryHub() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: recentSessions = [], isLoading } = useQuery({
    queryKey: ["render-sessions-all", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_sessions" as never)
        .select("id, status, original_photo_url, result_urls, config, created_at")
        .eq("company_id" as never, companyId as never)
        .order("created_at" as never, { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        status: string;
        original_photo_url: string | null;
        result_urls: string[] | null;
        config: Record<string, unknown> | null;
        created_at: string;
      }[];
    },
    enabled: !!companyId,
  });

  const handleCategoryClick = (cat: typeof categories[0]) => {
    if (cat.active) {
      navigate(cat.path);
    } else {
      toast("Questa funzionalità sarà disponibile a breve!");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Render AI
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">Render AI</h1>
          <p className="mt-1 text-muted-foreground text-sm max-w-md">
            Trasforma i tuoi progetti con l'intelligenza artificiale
          </p>
        </div>
        <div className="shrink-0">
          <RenderCreditsWidget />
        </div>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card
              key={cat.id}
              className={`transition-all duration-200 ${
                cat.active
                  ? "hover:shadow-lg hover:scale-[1.02] cursor-pointer"
                  : "opacity-60 cursor-not-allowed"
              }`}
              onClick={() => handleCategoryClick(cat)}
            >
              <CardContent className="p-6 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className={`w-12 h-12 rounded-xl ${cat.color} flex items-center justify-center`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <Badge
                    variant={cat.active ? "default" : "secondary"}
                    className={cat.active ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}
                  >
                    {cat.badge}
                  </Badge>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{cat.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{cat.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Renders */}
      {(recentSessions.length > 0 || isLoading) && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Ultimi render
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="aspect-video rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentSessions.map((s) => {
                const resultUrl = (s.result_urls as string[] | null)?.[0];
                return (
                  <div
                    key={s.id}
                    className="aspect-video rounded-xl overflow-hidden cursor-pointer hover:ring-2 ring-primary/40 transition-all group relative bg-muted"
                    onClick={() => navigate(`/azienda/render/infissi/gallery/${s.id}`)}
                  >
                    {resultUrl ? (
                      <img
                        src={resultUrl}
                        alt="Render"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 flex gap-1">
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1 py-0 bg-black/60 text-white border-0"
                      >
                        {s.status === "completed" ? "Completato" : s.status === "processing" ? "In corso..." : s.status}
                      </Badge>
                    </div>
                    <div className="absolute bottom-1 right-1">
                      <span className="text-[9px] text-white/80 bg-black/40 px-1 rounded">
                        {format(new Date(s.created_at), "d MMM", { locale: it })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
