/**
 * SilvioCanaliSettings — MP-SILVIO-07 · "molte bocche, un cervello"
 *
 * Collega il WhatsApp dell'utente a Silvio con verifica reverse-OTP: si genera
 * un codice, l'utente lo invia DAL proprio WhatsApp al numero aziendale, il
 * webhook inbound riconosce il codice e marca il canale verificato. Niente
 * dipende da template Meta e il possesso del numero è provato.
 */
import { useMemo, useState } from "react";
import { MessageCircle, CheckCircle2, Loader2, Smartphone, Unlink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  useSilvioCanali,
  useAvviaVerificaCanale,
  useScollegaCanale,
  type AvviaVerificaResult,
} from "@/lib/silvio/hooks";

export function SilvioCanaliSettings() {
  const { data: canali, isLoading } = useSilvioCanali();
  const avvia = useAvviaVerificaCanale();
  const scollega = useScollegaCanale();
  const [numero, setNumero] = useState("");
  const [esito, setEsito] = useState<AvviaVerificaResult | null>(null);

  const whatsapp = useMemo(
    () => (canali ?? []).find((c) => c.canale === "whatsapp"),
    [canali],
  );

  const onAvvia = () => {
    const n = numero.trim();
    if (!n) return;
    avvia.mutate({ numero: n }, { onSuccess: (r) => setEsito(r) });
  };

  const onScollega = (id: string) => {
    scollega.mutate(id, {
      onSuccess: () => {
        setEsito(null);
        setNumero("");
      },
    });
  };

  const codice = esito?.codice ?? whatsapp?.codice ?? null;
  const numeroAziendale = esito?.numero_aziendale ?? null;
  const waLink =
    codice && numeroAziendale
      ? `https://wa.me/${numeroAziendale.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(codice)}`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-xs text-emerald-900">
          Collega il tuo <b>WhatsApp</b> a Silvio: dopo la verifica scrivi le tue richieste
          direttamente su WhatsApp e Silvio prepara tutto — <b>le confermi sempre in app</b>,
          niente parte da solo.
        </p>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : whatsapp?.verificato ? (
        /* ── Collegato ── */
        <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-white px-3 py-2.5">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">WhatsApp collegato</p>
            <p className="text-[11px] text-muted-foreground">{whatsapp.identificativo}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5 text-rose-600"
            disabled={scollega.isPending}
            onClick={() => onScollega(whatsapp.id)}
          >
            <Unlink className="h-3.5 w-3.5" /> Scollega
          </Button>
        </div>
      ) : whatsapp ? (
        /* ── Verifica in corso ── */
        <div className="space-y-3">
          <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 space-y-2.5">
            <p className="text-xs text-violet-900">
              Per confermare che il numero <b>{whatsapp.identificativo}</b> è tuo,{" "}
              <b>invia questo codice dal tuo WhatsApp</b>
              {numeroAziendale ? (
                <> al numero <b>{numeroAziendale}</b>:</>
              ) : (
                <> al numero WhatsApp della tua azienda:</>
              )}
            </p>
            {codice ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded border bg-white px-2 py-1 text-base font-bold tracking-widest text-violet-700">
                  {codice}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => {
                    void navigator.clipboard?.writeText(codice);
                    toast.success("Codice copiato");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copia
                </Button>
                {waLink && (
                  <Button asChild size="sm" className="h-7 gap-1 px-2 text-[11px]">
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" /> Apri WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Codice non più visibile. Generane uno nuovo qui sotto.
              </p>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> In attesa del messaggio… la pagina si
              aggiorna da sola.
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-slate-500"
            disabled={scollega.isPending}
            onClick={() => onScollega(whatsapp.id)}
          >
            Annulla e usa un altro numero
          </Button>
        </div>
      ) : (
        /* ── Non collegato ── */
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 shrink-0 text-slate-400" />
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAvvia();
            }}
            inputMode="tel"
            placeholder="Il tuo numero WhatsApp (es. +39 333 1234567)"
            className="h-9 flex-1 text-sm"
            disabled={avvia.isPending}
          />
          <Button
            size="sm"
            className="h-9 gap-1.5"
            disabled={avvia.isPending || !numero.trim()}
            onClick={onAvvia}
          >
            {avvia.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Genera codice
          </Button>
        </div>
      )}
    </div>
  );
}
