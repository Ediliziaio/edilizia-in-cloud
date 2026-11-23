/**
 * Tesserino digitale — card con i dati dell'operaio e un QR che si può verificare.
 *
 * 23/11/2026: prima il QR conteneva un testo con l'id dell'account e il nome. Non portava a nessuna pagina e
 * chiunque poteva scriverne uno uguale. Ora contiene l'indirizzo /tesserino#<codice>: chi controlla in cantiere lo
 * inquadra con la fotocamera e vede se il lavoratore è in forza e se formazione e idoneità sono valide
 * (`verifica_tesserino`). Il codice lo dà il database (`campo_mio_tesserino`), legato alla scheda del personale:
 * senza scheda niente QR, e la pagina dice di chiedere all'ufficio.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Download, ExternalLink, HardHat, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { useLinguaCampo } from "@/lib/campo/lingua/LinguaCampo";
import { indirizzoVerificaTesserino } from "@/lib/campo/tesserino";

export default function CampoTesserino() {
  const { t, lingua } = useLinguaCampo();
  const { user, profile, role, company, effectiveCompany } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);
  const [qrError, setQrError] = useState(false);

  const p = profile as { first_name?: string | null; last_name?: string | null; avatar_url?: string | null } | null;
  const nome = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || user?.email || "—";
  const initials = [p?.first_name?.[0], p?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  // La ragione sociale vive su useAuth().company: AuthContext RIMUOVE `company` dall'oggetto profile.
  const companyName = (effectiveCompany ?? company)?.name ?? "Edilizia in Cloud";
  const isSubappaltatore = role === "subcontractor";
  // Il tesserino lo EMETTE l'ufficio: matricola, mansione, foto e assunzione vengono dalla scheda del personale.
  const { data: hrProfilo } = useMyHrProfilo();
  const hr = hrProfilo as {
    matricola?: string | null;
    mansione?: string | null;
    foto_url?: string | null;
    data_assunzione?: string | null;
  } | null;
  const foto = hr?.foto_url || p?.avatar_url || null;
  const mansione = hr?.mansione ?? t(isSubappaltatore ? "Subappaltatore" : "Operaio");
  const assuntoIl = hr?.data_assunzione
    ? new Date(hr.data_assunzione).toLocaleDateString(lingua.locale, { month: "2-digit", year: "numeric" })
    : null;

  const codice = useQuery({
    queryKey: ["campo-mio-tesserino", user?.id],
    enabled: !!user?.id,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_mio_tesserino");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
  const indirizzo = codice.data ? indirizzoVerificaTesserino(window.location.origin, codice.data) : null;

  useEffect(() => {
    if (!indirizzo || !canvasRef.current) return;
    setQrReady(false);
    import("qrcode")
      .then(QRCode => {
        QRCode.toCanvas(canvasRef.current!, indirizzo, {
          width: 180,
          margin: 1,
          color: { dark: "#0f172a", light: "#f1f5f9" },
        }, (err) => {
          if (err) { setQrError(true); return; }
          setQrReady(true);
        });
      })
      .catch(() => setQrError(true));
  }, [indirizzo]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = 600;
    out.height = 380;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(0, 0, 600, 380, 20);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.roundRect(0, 0, 600, 8, [20, 20, 0, 0]);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.fillText(nome, 30, 70);
    ctx.fillStyle = "#f59e0b";
    ctx.font = "16px Arial";
    ctx.fillText(mansione, 30, 100);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px Arial";
    ctx.fillText(companyName, 30, 130);
    if (hr?.matricola) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "13px monospace";
      ctx.fillText(`${t("Matricola")} ${hr.matricola}`, 30, 156);
    }
    ctx.drawImage(canvas, 390, 80, 180, 180);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px Arial";
    ctx.fillText(t("Inquadra il QR per verificare"), 390, 285);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `tesserino-${nome.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  };

  return (
    // min-h-full (non h-full): con h-full + justify-center la parte alta della card era irraggiungibile.
    <div className="flex min-h-full flex-col items-center justify-center gap-6 py-3 md:px-4 md:py-6">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-muted shadow-2xl">
        <div className="h-2 bg-primary" />
        <div className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <HardHat className="size-5 text-primary" aria-hidden="true" />
            <span dir="auto" className="truncate text-xs font-semibold uppercase tracking-widest text-primary">{companyName}</span>
          </div>

          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              {foto ? (
                <img src={foto} alt={t("Foto di {nome}", { nome })} className="mb-3 size-16 rounded-2xl object-cover" />
              ) : (
                <div className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-primary">
                  <span className="text-2xl font-bold text-primary-foreground">{initials}</span>
                </div>
              )}
              <p dir="auto" className="text-xl font-bold leading-tight text-foreground">{nome}</p>
              <div className="mt-1 flex items-center gap-1">
                {isSubappaltatore
                  ? <Building2 className="size-3.5 text-primary" aria-hidden="true" />
                  : <HardHat className="size-3.5 text-primary" aria-hidden="true" />}
                <span className="text-sm text-primary">{mansione}</span>
              </div>
              <p dir="auto" className="mt-2 text-xs text-muted-foreground">{companyName}</p>
              {hr?.matricola && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("Matricola")} <span className="font-mono font-semibold text-foreground">{hr.matricola}</span>
                </p>
              )}
              {assuntoIl && <p className="mt-0.5 text-xs text-muted-foreground">{t("In forza dal {data}", { data: assuntoIl })}</p>}
            </div>

            {indirizzo && (
              <div className="flex flex-col items-center justify-center">
                <div className="rounded-xl bg-slate-100 p-1.5">
                  <canvas ref={canvasRef} className={qrReady ? "block" : "hidden"} style={{ width: 90, height: 90 }}
                    aria-label={t("QR per verificare il tesserino")} role="img" />
                  {!qrReady && !qrError && (
                    <div className="flex size-[90px] items-center justify-center">
                      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                    </div>
                  )}
                  {qrError && (
                    <div className="flex size-[90px] items-center justify-center">
                      <p className="text-center text-[10px] text-muted-foreground">{t("QR non disponibile")}</p>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-center text-[10px] text-muted-foreground">{t("Scansiona per verificare")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {codice.isSuccess && !codice.data && (
        <p className="max-w-xs rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
          {t("Il QR per la verifica compare quando l'ufficio collega il tuo account alla tua scheda nel modulo Personale.")}
        </p>
      )}
      {codice.isError && (
        <button type="button" onClick={() => void codice.refetch()} className="min-h-11 rounded-xl border px-4 text-sm font-semibold">
          {t("QR non disponibile. Riprova")}
        </button>
      )}

      {indirizzo && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={handleDownload} disabled={!qrReady}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-muted px-5 font-medium text-foreground transition-transform active:scale-[0.98] disabled:opacity-40">
            <Download className="size-4" aria-hidden="true" /> {t("Salva immagine")}
          </button>
          <a href={indirizzo} target="_blank" rel="noreferrer"
            className="flex min-h-11 items-center gap-2 rounded-xl border px-5 font-medium text-foreground">
            <ExternalLink className="size-4" aria-hidden="true" /> {t("Vedi cosa vede chi controlla")}
          </a>
        </div>
      )}

      {!hr && (
        <p className="max-w-xs rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          {t("Matricola, mansione e foto compaiono quando l'ufficio completa la tua scheda nel modulo Personale.")}
        </p>
      )}

      {indirizzo && (
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          {t("Chi controlla in cantiere inquadra il QR con la fotocamera: vede se sei in regola con formazione e visita medica. Non vede i tuoi documenti.")}
        </p>
      )}
    </div>
  );
}
