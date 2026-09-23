/**
 * Avanzamento lavori — l'operaio o il subappaltatore segna se ha fatto o meno
 * la SUA fase, allegando le foto.
 *
 * Sostituisce la vecchia pagina "SAL", che era costruita sugli IMPORTI
 * (importi/ritenute/percentuali di pagamento) — informazione che in cantiere
 * non serve e che comunque non ha mai funzionato: leggeva `subappaltatori`
 * mentre la FK di `sal_subappaltatori` punta a `subappaltatori_sicurezza`, e
 * scriveva 5 colonne inesistenti.
 *
 * Qui la fonte di verità è `order_work_phases`, già usata dall'ufficio:
 * niente doppioni, e la percentuale di commessa si aggiorna dal trigger DB
 * di rollup esistente.
 *
 * Permessi: la policy "Campo workers can update phases of assigned orders"
 * (USING + WITH CHECK su order_campo_assignments OR order_employees) copre
 * sia l'operaio sia il subappaltatore → nessun gate applicativo necessario.
 */
import { useMemo, useState } from "react";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Circle, Camera, Loader2, RefreshCcw, MapPin,
  ImageIcon, X, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Le foto restano indirizzate come prima nel database; in lettura passano da
// un link a scadenza (linkFileRiservato), cosi' funzionano anche quando il
// contenitore non e' piu' aperto a chiunque.
const PHOTO_BUCKET = "campo-rapportini";
const MAX_PHOTO_MB = 10;

interface Fase {
  id: string;
  order_id: string;
  name: string;
  position: number;
  status: string;
  percentuale: number;
  notes: string | null;
  foto_urls: unknown;
  completata_il: string | null;
}

interface Cantiere {
  id: string;
  order_code: string | null;
  description: string | null;
  indirizzo_lavori: string | null;
}

/** foto_urls è jsonb: normalizza qualunque forma in string[]. */
function toPhotoList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

async function compressImage(file: File, maxWidth = 1280, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Compressione fallita"))), "image/jpeg", quality),
  );
}

export default function CampoAvanzamento() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id;
  const queryClient = useQueryClient();
  const [uploadingFaseId, setUploadingFaseId] = useState<string | null>(null);

  // Le fasi dei MIEI cantieri. Non filtriamo per utente: ci pensa la RLS
  // ("Campo workers can view phases of assigned orders"), che copre sia il
  // subappaltatore (order_campo_assignments) sia l'operaio (order_employees).
  // Query separate invece dell'embed annidato: gli embed PostgREST su tabelle
  // con RLS pesanti fanno esplodere il planning.
  const fasiQuery = useQuery({
    queryKey: ["campo-avanzamento-fasi", companyId, user?.id],
    queryFn: async (): Promise<Fase[]> => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id, order_id, name, position, status, percentuale, notes, foto_urls, completata_il")
        // La chiave della query aveva già l'azienda, la query no.
        .eq("company_id", companyId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Fase[];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
  });

  const orderIds = useMemo(
    () => Array.from(new Set((fasiQuery.data ?? []).map((f) => f.order_id))),
    [fasiQuery.data],
  );

  const cantieriQuery = useQuery({
    queryKey: ["campo-avanzamento-cantieri", orderIds.join(",")],
    queryFn: async (): Promise<Cantiere[]> => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, indirizzo_lavori")
        .in("id", orderIds);
      if (error) throw error;
      return (data ?? []) as Cantiere[];
    },
    enabled: orderIds.length > 0,
    staleTime: 60_000,
  });

  const gruppi = useMemo(() => {
    const byOrder = new Map<string, Fase[]>();
    for (const fase of fasiQuery.data ?? []) {
      const list = byOrder.get(fase.order_id);
      if (list) list.push(fase);
      else byOrder.set(fase.order_id, [fase]);
    }
    return Array.from(byOrder.entries()).map(([orderId, fasi]) => ({
      cantiere: (cantieriQuery.data ?? []).find((c) => c.id === orderId) ?? null,
      orderId,
      fasi: [...fasi].sort((a, b) => a.position - b.position),
    }));
  }, [fasiQuery.data, cantieriQuery.data]);

  const toggleFase = useMutation({
    mutationFn: async (fase: Fase) => {
      const completata = fase.status === "completata";
      const { error } = await supabase
        .from("order_work_phases")
        .update(
          completata
            ? { status: "in_corso", percentuale: 50, completata_da: null, completata_il: null }
            : { status: "completata", percentuale: 100, completata_da: user!.id, completata_il: new Date().toISOString() },
        )
        .eq("id", fase.id);
      if (error) throw error;
      return !completata;
    },
    onSuccess: (nowDone) => {
      queryClient.invalidateQueries({ queryKey: ["campo-avanzamento-fasi"] });
      toast.success(nowDone ? "Fase segnata come completata" : "Fase riaperta");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Non riesco a salvare la fase"),
  });

  async function handlePhoto(fase: Fase, files: FileList | null) {
    if (!files?.length) return;
    if (!companyId) {
      toast.error("Profilo in caricamento, riprova tra un istante");
      return;
    }
    setUploadingFaseId(fase.id);
    const nuove: string[] = [];
    let falliti = 0;

    for (const file of Array.from(files)) {
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) { falliti++; continue; }
      try {
        const compressed = await compressImage(file).catch(() => null);
        const payload: Blob = compressed ?? file;
        const path = `${companyId}/${fase.order_id}/fasi/${fase.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { data: up, error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, payload, { contentType: "image/jpeg", upsert: false });
        if (upErr || !up?.path) throw upErr ?? new Error("Upload senza path");
        nuove.push(supabase.storage.from(PHOTO_BUCKET).getPublicUrl(up.path).data.publicUrl);
      } catch (err) {
        falliti++;
        console.error("[CampoAvanzamento] upload foto:", err);
      }
    }

    // Solo le foto REALMENTE caricate finiscono in lista: niente anteprime
    // fantasma che fanno credere di aver allegato una foto inesistente.
    if (nuove.length > 0) {
      const { error } = await supabase
        .from("order_work_phases")
        .update({ foto_urls: [...toPhotoList(fase.foto_urls), ...nuove] })
        .eq("id", fase.id);
      if (error) {
        toast.error("Foto caricate ma non collegate alla fase");
      } else {
        queryClient.invalidateQueries({ queryKey: ["campo-avanzamento-fasi"] });
        toast.success(nuove.length === 1 ? "Foto aggiunta" : `${nuove.length} foto aggiunte`);
      }
    }
    if (falliti > 0) toast.error(`${falliti} foto non caricate (max ${MAX_PHOTO_MB}MB)`);
    setUploadingFaseId(null);
  }

  async function removePhoto(fase: Fase, url: string) {
    const rimaste = toPhotoList(fase.foto_urls).filter((u) => u !== url);
    const { error } = await supabase
      .from("order_work_phases")
      .update({ foto_urls: rimaste })
      .eq("id", fase.id);
    if (error) toast.error("Non riesco a rimuovere la foto");
    else queryClient.invalidateQueries({ queryKey: ["campo-avanzamento-fasi"] });
  }

  const isLoading = fasiQuery.isLoading;
  const totali = fasiQuery.data?.length ?? 0;
  const fatte = (fasiQuery.data ?? []).filter((f) => f.status === "completata").length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 md:p-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Avanzamento lavori</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Segna le fasi che hai completato e allega le foto del lavoro fatto.
        </p>
        {!isLoading && totali > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round((fatte / totali) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {fatte}/{totali} fasi
            </span>
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : fasiQuery.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-10 text-center">
          <p className="text-sm font-medium">Non riesco a caricare le fasi</p>
          <p className="text-xs text-muted-foreground">Controlla la connessione e riprova.</p>
          <Button variant="outline" size="sm" onClick={() => fasiQuery.refetch()} disabled={fasiQuery.isFetching}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {fasiQuery.isFetching ? "Riprovo…" : "Riprova"}
          </Button>
        </div>
      ) : gruppi.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium">Nessuna fase da segnare</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Le fasi le prepara l'ufficio sui cantieri che ti vengono assegnati. Appena ci sono, le trovi qui.
          </p>
        </div>
      ) : (
        gruppi.map((g) => (
          <section key={g.orderId} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border bg-muted/40 px-3 py-2.5">
              <p className="text-sm font-semibold">{g.cantiere?.order_code ?? "Cantiere"}</p>
              {g.cantiere?.description && (
                <p className="line-clamp-1 text-xs text-muted-foreground">{g.cantiere.description}</p>
              )}
              {g.cantiere?.indirizzo_lavori && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{g.cantiere.indirizzo_lavori}</span>
                </p>
              )}
            </div>

            <ul className="divide-y divide-border">
              {g.fasi.map((fase) => {
                const done = fase.status === "completata";
                const foto = toPhotoList(fase.foto_urls);
                const busy = uploadingFaseId === fase.id;
                return (
                  <li key={fase.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleFase.mutate(fase)}
                        disabled={toggleFase.isPending}
                        aria-label={done ? `Riapri la fase ${fase.name}` : `Segna ${fase.name} come completata`}
                        className="mt-0.5 shrink-0"
                      >
                        {done ? (
                          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        ) : (
                          <Circle className="h-6 w-6 text-muted-foreground" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>
                          {fase.name}
                        </p>
                        {fase.notes && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{fase.notes}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              done
                                ? "bg-emerald-100 text-emerald-700"
                                : fase.status === "in_corso"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {done ? "Completata" : fase.status === "in_corso" ? "In corso" : "Da iniziare"}
                          </span>
                          {!done && fase.percentuale > 0 && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {fase.percentuale}%
                            </span>
                          )}
                          {done && fase.completata_il && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(fase.completata_il).toLocaleDateString("it-IT")}
                            </span>
                          )}
                        </div>

                        {foto.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {foto.map((url) => (
                              <div key={url} className="relative">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => {
                                    // Il link a scadenza si chiede al momento del clic.
                                    e.preventDefault();
                                    void linkFileRiservato(url).then((u) => window.open(u ?? url, "_blank", "noopener"));
                                  }}
                                >
                                  <ImgRiservata
                                    src={url}
                                    alt="Foto avanzamento fase"
                                    loading="lazy"
                                    className="h-14 w-14 rounded-md border border-border object-cover"
                                  />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removePhoto(fase, url)}
                                  aria-label="Rimuovi foto"
                                  className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow ring-1 ring-border"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                          {busy ? "Carico…" : foto.length > 0 ? "Aggiungi foto" : "Aggiungi foto"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            className="hidden"
                            disabled={busy}
                            onChange={(e) => {
                              void handlePhoto(fase, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>

                      {foto.length > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                          <ImageIcon className="h-3 w-3" />
                          {foto.length}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
