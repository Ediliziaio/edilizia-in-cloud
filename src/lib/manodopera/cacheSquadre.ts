import type { QueryClient } from "@tanstack/react-query";

/** Le stesse squadre sono lette da impostazioni, operai, commesse e calendario. */
export function invalidaSquadreCollegate(
  qc: Pick<QueryClient, "invalidateQueries">,
) {
  return Promise.all(
    [
      ["manodopera"],
      ["calendari-lavori", "squadre"],
      ["calendari-lavori", "squadre-google"],
      ["external-teams"],
      ["external-teams-filter"],
      ["external-teams-list"],
      ["external_teams_active"],
      ["gcal-busy-slots"],
    ].map((queryKey) => qc.invalidateQueries({ queryKey })),
  );
}
