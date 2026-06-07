import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortaleAccessoScaduto() {
  return (
    <div
      className="min-h-[100dvh] bg-[#1E3A5F] flex flex-col items-center justify-center px-6 text-center"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
          <Lock className="w-10 h-10 text-white" strokeWidth={1.5} />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Accesso Scaduto</h1>
          <p className="text-blue-200 text-sm leading-relaxed">
            Il link che hai usato non è più valido o è scaduto. Contatta l'azienda per ricevere un
            nuovo link.
          </p>
        </div>

        {/* Action */}
        <Button
          asChild
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold h-12 text-base rounded-xl"
        >
          <a href="mailto:supporto@ediliziaincloud.com">Contatta supporto</a>
        </Button>
      </div>
    </div>
  );
}
