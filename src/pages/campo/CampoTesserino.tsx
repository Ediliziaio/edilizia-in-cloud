/**
 * Tesserino digitale — card con dati operaio + QR code (user ID).
 * Il QR viene generato client-side con la lib qrcode.
 */
import { useEffect, useRef, useState } from "react";
import { HardHat, Building2, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function CampoTesserino() {
  const { user, profile, role } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);
  const [qrError, setQrError] = useState(false);

  const p = profile as any;
  const nome = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || user?.email || "—";
  const initials = [p?.first_name?.[0], p?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const companyName = p?.company?.name ?? p?.company_name ?? "Edilizia in Cloud";
  const isSubappaltatore = role === "subcontractor";

  useEffect(() => {
    if (!user?.id || !canvasRef.current) return;

    import("qrcode")
      .then(QRCode => {
        QRCode.toCanvas(canvasRef.current!, user.id, {
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

    // Role
    ctx.fillStyle = "#f59e0b";
    ctx.font = "16px Arial";
    ctx.fillText(isSubappaltatore ? "Subappaltatore" : "Operaio", 30, 100);

    // Company
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px Arial";
    ctx.fillText(companyName, 30, 130);

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
    <div className="flex flex-col h-full items-center justify-center px-4 py-6 gap-6">

      {/* Card tesserino */}
      <div className="w-full max-w-sm bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
        {/* Amber top bar */}
        <div className="h-2 bg-amber-500" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-2 mb-6">
            <HardHat className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-amber-400 font-semibold uppercase tracking-widest">
              Edilizia in Cloud
            </span>
          </div>

          <div className="flex gap-4">
            {/* Left: dati */}
            <div className="flex-1">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center mb-3">
                <span className="text-2xl font-bold text-black">{initials}</span>
              </div>

              <p className="text-xl font-bold text-white leading-tight">{nome}</p>
              <div className="flex items-center gap-1 mt-1">
                {isSubappaltatore ? (
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <HardHat className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span className="text-sm text-amber-400">
                  {isSubappaltatore ? "Subappaltatore" : "Operaio"}
                </span>
              </div>

              <p className="text-xs text-slate-400 mt-2">{companyName}</p>

              {user?.email && (
                <p className="text-xs text-slate-500 mt-1 break-all">{user.email}</p>
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
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                )}
                {qrError && (
                  <div className="w-[90px] h-[90px] flex items-center justify-center">
                    <p className="text-[10px] text-slate-500 text-center">QR non disponibile</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-600 mt-1">Scansiona per verifica</p>
            </div>
          </div>

          {/* ID footer */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <p className="text-[10px] text-slate-600 font-mono">
              ID: {user?.id?.slice(0, 16)}...
            </p>
          </div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!qrReady}
        className="flex items-center gap-2 bg-slate-800 text-white font-medium px-6 py-3 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-transform"
      >
        <Download className="w-4 h-4" />
        Salva immagine
      </button>

      <p className="text-xs text-slate-500 text-center max-w-xs">
        Il codice QR può essere scansionato in cantiere per verificare la tua identità.
      </p>
    </div>
  );
}
