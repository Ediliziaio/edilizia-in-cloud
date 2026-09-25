import { useEffect, useState } from "react";
import { campoWorkDay } from "@/lib/campo/workDay";

/** Revalidate after midnight and after bringing a suspended phone app back. */
export function useCampoWorkDay() {
  const [day, setDay] = useState(() => campoWorkDay());
  useEffect(() => {
    const refresh = () => setDay(campoWorkDay());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return day;
}
