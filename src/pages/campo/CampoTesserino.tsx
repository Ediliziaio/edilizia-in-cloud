/**
 * Tesserino digitale — card con dati operaio + QR code (user ID).
 * Il QR viene generato client-side con la lib qrcode.
 */
import { useEffect, useRef, useState } from "react";
import { HardHat, Building2, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyHrProfilo } from "@/hooks/useTimbratura";

export default function CampoTesserino() {
  const { user, profile, role, company, effectiveCompany } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);
  const [qrError, setQrError] = useState(false);

  const p = profile as any;
  const nome = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || user?.email || "—";
  const initials = [p?.first_name?.[0], p?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  // La ragione sociale vive su useAuth().company: AuthContext RIMUOVE `company`
  // dall'oggetto profile, quindi p?.company?.name era sempre undefined e il
  // tesserino mostrava "Edilizia in Cloud" al posto dell'azienda vera.
  const companyName = (effectiveCompany ?? company)?.name ?? "Edilizia in Cloud";
  const isSubappaltatore = role === "subcontractor";
  // Il tesserino lo EMETTE l'ufficio: i dati (matricola, mansione, foto,
  // assunzione) vengono dalla scheda HR compilata dall'admin nel modulo
  // Personale. Qui si mostrano soltanto.
  const { data: hrProfilo } = useMyHrProfilo();
  const hr = hrProfilo as {
    matricola?: string | null;
    mansione?: string | null;
    foto_url?: string | null;
    data_assunzione?: string | null;
    tipo_contratto?: string | null;
  } | null;
  const mansione = hr?.mansione ?? (isSubappaltatore ? "Subappaltatore" : "Operaio");
  const assuntoIl = hr?.data_assunzione
    ? new Date(hr.data_assunzione).toLocaleDateString("it-IT", { month: "2-digit", year: "numeric" })
    : null;


  useEffect(() => {
    if (!user?.id || !canvasRef.current) return;

    import("qrcode")
      .then(QRCode => {
        // Payload strutturato con versione schema e scadenza 24h
        const qrPayload = JSON.stringify({
          v: 1,
          uid: user.id,
          cid: profile?.company_id,
          nome: `${profile?.first_name} ${profile?.last_name}`,
          ruolo: isSubappaltatore ? "subcontractor" : "employee",
          exp: Date.now() + 24 * 60 * 60 * 1000,
        });
        QRCode.toCanvas(canvasRef.current!, qrPayload, {
          width: 180,
          margin: 1,
          color: { dark: "#0f172a", light: "#f1f5f9" },
        }, (err) => {
          if (err) { setQrError(true); return; }
          setQrReady(true);
        });
      })
      .catch(() => setQrError(true));
  }, [user?.id]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a larger canvas with the card design
    const out = document.createElement("canvas");
    out.width = 600;
    out.height = 380;
    const ctx = out.getContext("2d")!;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(0, 0, 600, 380, 20);
    ctx.fill();

    // Amber accent bar
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.roundRect(0, 0, 600, 8, [20, 20, 0, 0]);
    ctx.fill();

    // Name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.fillText(nome, 30, 70);

    // Mansione (dalla scheda HR)
    ctx.fillStyle = "#f59e0b";
    ctx.font = "16px Arial";
    ctx.fillText(mansione, 30, 100);

    // Company
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px Arial";
    ctx.fillText(companyName, 30, 130);
    if (hr?.matricola) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "13px monospace";
      ctx.fillText(`Matricola ${hr.matricola}`, 30, 156);
    }

    // QR code
    ctx.drawImage(canvas, 390, 80, 180, 180);

    // ID
    ctx.fillStyle = "#64748b";
    ctx.font = "10px monospace";
    ctx.fillText(`ID: ${user?.id?.slice(0, 8)}`, 30, 340);

    const url = out.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `tesserino-${nome.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  };

  return (
    // min-h-full (non h-full): con h-full + justify-center il contenuto più
    // alto del viewport veniva centrato sbordando anche SOPRA l'area
    // scrollabile — la parte alta della card era irraggiungibile.
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-6 gap-6">

      {/* Card tesserino */}
      <div className="w-full max-w-sm bg-muted rounded-3xl overflow-hidden border border-border shadow-2xl">
        {/* Amber top bar */}
        <div className="h-2 bg-primary" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-2 mb-6">
            <HardHat className="w-5 h-5 text-primary" />
            <span className="truncate text-xs text-primary font-semibold uppercase tracking-widest">
              {companyName}
            </span>
          </div>

          <div className="flex gap-4">
            {/* Left: dati */}
            <div className="flex-1">
              {/* Avatar */}
              {hr?.foto_url ? (
                <img
                  src={hr.foto_url}
                  alt={`Foto di ${nome}`}
                  className="mb-3 h-16 w-16 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-3">
                  <span className="text-2xl font-bold text-primary-foreground">{initials}</span>
                </div>
              )}

              <p className="text-xl font-bold text-foreground leading-tight">{nome}</p>
              <div className="flex items-center gap-1 mt-1">
                {isSubappaltatore ? (
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <HardHat className="w-3.5 h-3.5 text-primary" />
                )}
                <span className="text-sm text-primary">{mansione}</span>
              </div>

              <p className="text-xs text-muted-foreground mt-2">{companyName}</p>

              {hr?.matricola && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Matricola <span className="font-mono font-semibold text-foreground">{hr.matricola}</span>
                </p>
              )}
              {assuntoIl && (
                <p className="mt-0.5 text-xs text-muted-foreground">In forza dal {assuntoIl}</p>
              )}

              {user?.email && (
                <p className="text-xs text-muted-foreground mt-1 break-all">{user.email}</p>
              )}
            </div>

            {/* Right: QR code */}
            <div className="flex flex-col items-center justify-center">
              <div className="bg-slate-100 rounded-xl p-1.5">
                <canvas
                  ref={canvasRef}
                  className={qrReady ? "block" : "hidden"}
                  style={{ width: 90, height: 90 }}
                />
                {!qrReady && !qrError && (
                  <div className="w-[90px] h-[90px] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {qrError && (
                  <div className="w-[90px] h-[90px] flex items-center justify-center">
                    <p className="text-[10px] text-muted-foreground text-center">QR non disponibile</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Scansiona per verifica</p>
            </div>
          </div>

          {/* ID footer */}
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground font-mono">
              ID: {user?.id?.slice(0, 16)}...
            </p>
          </div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!qrReady}
        className="flex items-center gap-2 bg-muted text-foreground font-medium px-6 py-3 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-transform"
      >
        <Download className="w-4 h-4" />
        Salva immagine
      </button>

      {!hr && (
        <p className="max-w-xs rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          Matricola, mansione e foto compaiono quando l'ufficio completa la tua
          scheda nel modulo Personale.
        </p>
      )}

      <p className="text-xs text-muted-foreground text-center max-w-xs">
        Il codice QR può essere scansionato in cantiere per verificare la tua identità.
      </p>
    </div>
  );
}
