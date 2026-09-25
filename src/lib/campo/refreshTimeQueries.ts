import type { QueryClient } from "@tanstack/react-query";

/** In-session invalidation; other sessions use bounded foreground refetch. */
export function refreshCampoTimeQueries(client: QueryClient) {
  return Promise.all(["campo-time-day", "campo-timbrature-oggi", "campo-timbrature-storico", "campo-timbrature-oggi-rapportino", "campo-rapportini-da-compilare", "campo-squadra-oggi"]
    .map(key => client.invalidateQueries({ queryKey: [key] })));
}
