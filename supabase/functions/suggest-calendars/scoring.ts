// Pure functions extracted for testability — no external dependencies

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineEstimate(lat1: number, lng1: number, lat2: number, lng2: number) {
  const km = haversineKm(lat1, lng1, lat2, lng2) * 1.3;
  const minutes = (km / 50) * 60;
  return { km: Math.round(km * 10) / 10, minutes: Math.round(minutes), isEstimate: true };
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function calculateScore(
  travelMinutes: number,
  travelKm: number,
  maxTravelMinutes: number,
  simTotalKm: number,
  maxKm: number
): number {
  let score = travelMinutes * 2 + travelKm;
  if (travelMinutes > maxTravelMinutes) score += 1000;
  if (simTotalKm > maxKm) score += 500;
  return score;
}

export interface StatusResult {
  status: "OK" | "WARNING" | "BLOCKED";
  reason: string;
}

export function determineStatus(
  travelMinutes: number,
  maxTravelMinutes: number,
  simTotalKm: number,
  maxKm: number,
  hasSuggestedTimes: boolean
): StatusResult {
  if (travelMinutes > maxTravelMinutes) {
    return {
      status: "BLOCKED",
      reason: `Tempo di viaggio ${travelMinutes} min supera il limite di ${maxTravelMinutes} min`,
    };
  }
  if (simTotalKm > maxKm) {
    return {
      status: "BLOCKED",
      reason: `Km giornalieri previsti (${simTotalKm} km) superano il limite di ${maxKm} km`,
    };
  }
  if (!hasSuggestedTimes) {
    return { status: "BLOCKED", reason: "Nessuno slot orario disponibile" };
  }
  if (travelMinutes > maxTravelMinutes * 0.8) {
    return {
      status: "WARNING",
      reason: `Tempo di viaggio vicino al limite (${travelMinutes}/${maxTravelMinutes} min)`,
    };
  }
  if (simTotalKm > maxKm * 0.8) {
    return {
      status: "WARNING",
      reason: `Km giornalieri vicini al limite (${simTotalKm}/${maxKm} km)`,
    };
  }
  return { status: "OK", reason: "" };
}
