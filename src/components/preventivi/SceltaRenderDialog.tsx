/**
 * SceltaRenderDialog — scegli quale render allegare al preventivo.
 *
 * Finora un render finiva nel preventivo solo se ci si arrivava DAL wizard
 * render, con l'immagine passata nell'indirizzo. Chi apriva un preventivo
 * normale non aveva modo di attaccarci un render già fatto: i render dei dieci
 * verticali stavano nella loro galleria e la proposta al cliente restava un
 * foglio di numeri.
 *
 * Qui si vedono i render dell'azienda — tutti i verticali insieme — con la foto
 * di partenza accanto al risultato, che è il confronto che convince: "casa tua
 * adesso" e "casa tua dopo".
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ImageOff, Search, ArrowRight } from "lucide-react";

/** Etichette leggibili dei verticali render. */
const NOME_VERTICALE: Record<string, string> = {
  bagno: "Bagno",
  bagni: "Bagno",
  infissi: "Infissi",
  persiane: "Persiane",
  tetto: "Tetto",
  facciata: "Facciata",
  pavimenti: "Pavimenti",
  piscine: "Piscina",
  pergole: "Pergola",
  stanza: "Stanza",
  tecnico: "Tecnico",
};

export interface RenderScelto {
  url: string;
  sessionId: string | null;
  /** Foto di partenza, quando c'è: serve al confronto prima/dopo. */
  originalUrl: string | null;
  tipo: string | null;
}

interface RigaRender {
  id: string;
  render_type: string | null;
  result_url: string | null;
  result_urls: string[] | null;
  created_at: string | null;
  original_photo_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScegli: (scelto: RenderScelto) => void;
  /** Se il preventivo è legato a un contatto, i suoi render vengono per primi. */
  contactId?: string | null;
}

export function SceltaRenderDialog({ open, onOpenChange, onScegli, contactId }: Props) {
  const companyId = useEffectiveCompanyId();
  const [filtro, setFiltro] = useState("");

  const { data: render = [], isLoading } = useQuery<RigaRender[]>({
    queryKey: ["render-per-preventivo", companyId],
    enabled: open && !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      // La vista `company_renders_recent` è quella che alimenta le gallerie dei
      // verticali: stesso elenco, così non compaiono render che l'utente non
      // vede altrove.
      const { data, error } = await supabase
        .from("company_renders_recent")
        .select("id, render_type, result_url, result_urls, created_at")
        .eq("company_id", companyId!)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const righe = (data ?? []) as unknown as RigaRender[];

      // La foto di partenza vive su `render_sessions`: si prende in blocco per
      // i render mostrati, non uno alla volta.
      const ids = righe.map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return righe;
      const { data: sessioni } = await supabase
        .from("render_sessions")
        .select("id, original_photo_url")
        .in("id", ids);
      const perId = new Map(
        ((sessioni ?? []) as Array<{ id: string; original_photo_url: string | null }>)
          .map((s) => [s.id, s.original_photo_url]),
      );
      return righe.map((r) => ({ ...r, original_photo_url: perId.get(r.id) ?? null }));
    },
  });

  const q = filtro.trim().toLowerCase();
  const visibili = render
    .filter((r) => (r.result_url || (r.result_urls?.length ?? 0) > 0))
    .filter((r) => !q || (NOME_VERTICALE[r.render_type ?? ""] ?? r.render_type ?? "").toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Allega un render al preventivo</DialogTitle>
          <DialogDescription>
            I render già fatti, di tutti i verticali. Quello che scegli finisce
            nel PDF del preventivo.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtra per verticale (bagno, infissi, tetto…)"
            className="pl-8"
          />
        </div>

        <div className="max-h-[55dvh] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : visibili.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <ImageOff className="h-8 w-8 opacity-40" />
              {render.length === 0
                ? "Non ci sono ancora render completati per questa azienda."
                : "Nessun render corrisponde al filtro."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibili.map((r) => {
                const url = r.result_url ?? r.result_urls?.[0] ?? "";
                const tipo = NOME_VERTICALE[r.render_type ?? ""] ?? r.render_type ?? "Render";
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onScegli({
                        url,
                        sessionId: r.id,
                        originalUrl: r.original_photo_url,
                        tipo: r.render_type,
                      });
                      onOpenChange(false);
                    }}
                    className="group flex items-center gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-muted/50"
                  >
                    {/* Prima → dopo: il confronto è la cosa che convince. */}
                    {r.original_photo_url && (
                      <>
                        <img
                          src={r.original_photo_url}
                          alt="Foto di partenza"
                          loading="lazy"
                          className="h-16 w-20 shrink-0 rounded object-cover opacity-70"
                        />
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </>
                    )}
                    <img
                      src={url}
                      alt={`Render ${tipo}`}
                      loading="lazy"
                      className="h-16 w-20 shrink-0 rounded border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <Badge variant="secondary" className="text-[10px]">{tipo}</Badge>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("it-IT") : ""}
                        {!r.original_photo_url && " · senza foto di partenza"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
