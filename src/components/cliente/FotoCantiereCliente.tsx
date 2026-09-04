/**
 * Le foto del cantiere, per il committente.
 *
 * L'impresa le scatta già: ogni rapportino del giornale lavori può avere foto, e
 * il rapportino ha un interruttore "Visibile nel portale cliente". Finora quello
 * che scattava il capocantiere restava dentro l'app dell'impresa, e il cliente
 * chiedeva per telefono "a che punto siamo".
 *
 * Raggruppate per giornata, che nel giornale lavori è l'unità reale di
 * avanzamento: una giornata = una fase di lavoro documentata.
 *
 * SOLO i rapportini marcati visibili, e solo quelli del cantiere che si sta
 * guardando. Il filtro è qui, ma non deve restare solo qui: vedi la nota sulla
 * RLS nel commento della query.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera, ImageOff } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface FotoRiga {
  id: string;
  url: string;
  caption: string | null;
}

interface GiornataConFoto {
  id: string;
  data_lavori: string | null;
  lavorazioni_eseguite: string | null;
  avanzamento_percentuale: number | null;
  foto: FotoRiga[];
}

export function FotoCantiereCliente({ orderId }: { orderId: string }) {
  const [ingrandita, setIngrandita] = useState<FotoRiga | null>(null);

  const { data: giornate = [], isLoading } = useQuery<GiornataConFoto[]>({
    queryKey: ["cliente-foto-cantiere", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async () => {
      // Doppio filtro: l'ordine che si sta guardando E solo i rapportini che
      // l'impresa ha marcato visibili al cliente.
      //
      // ATTENZIONE: oggi la RLS di `giornale_lavori`/`giornale_foto` è
      // `company_id = get_my_company_id()`, e il profilo di un cliente porta il
      // company_id DELL'IMPRESA: significa che il filtro qui sotto è l'unica
      // cosa che limita quello che il cliente vede, e un filtro
      // nell'interfaccia non è una protezione. Serve una policy per cliente
      // come quella già usata su `orders` (`customer_id = auth.uid()` via
      // join): richiesta girata all'altra traccia.
      const { data, error } = await supabase
        .from("giornale_lavori")
        .select("id, data_lavori, lavorazioni_eseguite, avanzamento_percentuale, visibile_cliente, giornale_foto(id, url, caption)")
        .eq("order_id", orderId)
        .eq("visibile_cliente", true)
        .order("data_lavori", { ascending: false })
        .limit(60);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<GiornataConFoto & { giornale_foto: FotoRiga[] }>)
        .map((r) => ({ ...r, foto: r.giornale_foto ?? [] }))
        .filter((r) => r.foto.length > 0);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5" /> Foto del cantiere
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-28 w-full" /></CardContent>
      </Card>
    );
  }

  if (giornate.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5" /> Foto del cantiere
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <ImageOff className="h-4 w-4 shrink-0" />
          Non ci sono ancora foto condivise per questo cantiere.
        </CardContent>
      </Card>
    );
  }

  const totaleFoto = giornate.reduce((n, g) => n + g.foto.length, 0);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5" /> Foto del cantiere
            <span className="text-sm font-normal text-muted-foreground">
              · {totaleFoto} {totaleFoto === 1 ? "foto" : "foto"} in {giornate.length}{" "}
              {giornate.length === 1 ? "giornata" : "giornate"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {giornate.map((g) => (
            <div key={g.id} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm font-medium">
                  {g.data_lavori
                    ? format(parseISO(g.data_lavori), "d MMMM yyyy", { locale: it })
                    : "Data non indicata"}
                </p>
                {g.avanzamento_percentuale != null && g.avanzamento_percentuale > 0 && (
                  <span className="text-xs text-muted-foreground">
                    avanzamento {g.avanzamento_percentuale}%
                  </span>
                )}
              </div>
              {g.lavorazioni_eseguite && (
                <p className="text-xs leading-4 text-muted-foreground">{g.lavorazioni_eseguite}</p>
              )}
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                {g.foto.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setIngrandita(f)}
                    className="overflow-hidden rounded-lg border transition-opacity hover:opacity-90"
                  >
                    <img
                      src={f.url}
                      alt={f.caption || "Foto del cantiere"}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!ingrandita} onOpenChange={(v) => { if (!v) setIngrandita(null); }}>
        <DialogContent className="max-w-3xl p-2">
          {ingrandita && (
            <figure className="space-y-2">
              <img
                src={ingrandita.url}
                alt={ingrandita.caption || "Foto del cantiere"}
                className="max-h-[75dvh] w-full rounded-lg object-contain"
              />
              {ingrandita.caption && (
                <figcaption className="px-2 pb-1 text-center text-sm text-muted-foreground">
                  {ingrandita.caption}
                </figcaption>
              )}
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
