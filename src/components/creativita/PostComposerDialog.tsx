/**
 * PostComposerDialog — da immagine AI a post pubblicabile.
 *
 * L'AI consegna una foto; qui l'utente aggiunge titolo, richiamo e logo e
 * scarica il post nel formato social ESATTO (l'immagine generata non è mai
 * 9:16 nativo: senza questo passaggio è Instagram a decidere dove tagliare).
 *
 * Tutto nel browser: nessun costo, anteprima immediata.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Download, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { composePost } from "@/lib/creativita/composePost";
import type { CreativeAspect } from "../../../supabase/functions/_shared/brandCreativeRules";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Immagine generata dall'AI (bucket pubblico). */
  imageUrl: string;
  /** Formato scelto in fase di generazione. */
  aspect: CreativeAspect;
}

export function PostComposerDialog({ open, onOpenChange, imageUrl, aspect }: Props) {
  const companyId = useEffectiveCompanyId();
  const [headline, setHeadline] = useState("");
  const [cta, setCta] = useState("");
  const [inAlto, setInAlto] = useState(false);
  const [conLogo, setConLogo] = useState(true);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);

  const { data: brand } = useQuery({
    queryKey: ["company-brand", companyId],
    enabled: !!companyId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("logo_url, brand_primary_color")
        .eq("id", companyId!)
        .maybeSingle();
      return data ?? null;
    },
  });

  const overlay = useMemo(
    () => ({
      headline,
      cta,
      posizione: inAlto ? ("alto" as const) : ("basso" as const),
      logoUrl: conLogo ? brand?.logo_url ?? null : null,
      colorePrimario: brand?.brand_primary_color ?? null,
    }),
    [headline, cta, inAlto, conLogo, brand],
  );

  // Ricompone a ogni modifica, con un piccolo debounce: digitare il titolo
  // non deve ridisegnare il canvas a ogni tasto.
  useEffect(() => {
    if (!open || !imageUrl) return;
    let annullato = false;
    const t = window.setTimeout(async () => {
      setInCorso(true);
      try {
        const res = await composePost(imageUrl, aspect, overlay);
        if (annullato) {
          URL.revokeObjectURL(res.previewUrl);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = res.previewUrl;
        blobRef.current = res.blob;
        setAnteprima(res.previewUrl);
      } catch (e) {
        if (!annullato) {
          toast.error("Anteprima non disponibile", {
            description: e instanceof Error ? e.message : "Riprova tra poco.",
          });
        }
      } finally {
        if (!annullato) setInCorso(false);
      }
    }, 250);
    return () => {
      annullato = true;
      window.clearTimeout(t);
    };
  }, [open, imageUrl, aspect, overlay]);

  // Rilascia l'object URL quando il dialog si chiude (niente memory leak)
  useEffect(() => {
    if (open) return;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setAnteprima(null);
  }, [open]);

  const scarica = () => {
    if (!blobRef.current) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blobRef.current);
    a.download = `post-${aspect.replace(":", "x")}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Post scaricato");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Prepara il post
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="relative rounded-lg overflow-hidden bg-slate-100 min-h-[220px] flex items-center justify-center">
            {anteprima ? (
              <img src={anteprima} alt="Anteprima del post" className="w-full h-auto" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
            {inCorso && anteprima && (
              <div className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="headline" className="text-sm">Titolo</Label>
              <Input
                id="headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Es. Bagno chiavi in mano"
                maxLength={60}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Poche parole: al telefono si legge in un secondo.</p>
            </div>
            <div>
              <Label htmlFor="cta" className="text-sm">Richiamo</Label>
              <Input
                id="cta"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Es. Preventivo gratuito"
                maxLength={40}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="posizione" className="text-sm font-normal">Testo in alto</Label>
              <Switch id="posizione" checked={inAlto} onCheckedChange={setInAlto} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="logo" className="text-sm font-normal">
                Mostra il logo
                {!brand?.logo_url && <span className="block text-[11px] text-muted-foreground">Nessun logo caricato</span>}
              </Label>
              <Switch id="logo" checked={conLogo} onCheckedChange={setConLogo} disabled={!brand?.logo_url} />
            </div>
            <Button onClick={scarica} disabled={!blobRef.current} className="w-full">
              <Download className="h-4 w-4 mr-1.5" /> Scarica il post
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Formato pronto per la pubblicazione: l'immagine viene adattata alla misura esatta del social.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PostComposerDialog;
