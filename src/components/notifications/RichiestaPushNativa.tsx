import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PushConsentBanner } from "@/components/hr/PushConsentBanner";
import { Capacitor } from "@capacitor/core";

function RichiestaPerAccesso() {
  const [chiusa, setChiusa] = useState(false);
  if (chiusa) return null;
  return <PushConsentBanner onDismiss={() => setChiusa(true)} />;
}

/** Il consenso si chiede dopo l'accesso, sia in ufficio sia nell'area operaio. */
export function RichiestaPushNativa() {
  const { user, isLoading } = useAuth();
  if (!Capacitor.isNativePlatform() || !user?.id || isLoading) return null;
  return <RichiestaPerAccesso key={user.id} />;
}
