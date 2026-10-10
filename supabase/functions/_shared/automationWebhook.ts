/** Never follow a redirect into an internal address or send URL credentials. */
export function automationWebhookUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Il webhook richiede un URL HTTP/HTTPS senza credenziali nell’indirizzo");
  const internalName = host === "localhost" || !host.includes(".") || [".localhost", ".local", ".internal"].some(suffix => host.endsWith(suffix));
  // IPv6 literals (including IPv4-mapped addresses) are deliberately not accepted.
  const ipv6 = host.includes(":");
  const parts = /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host.split(".").map(Number) : null;
  const privateIPv4 = parts && (
    [0, 10, 127].includes(parts[0]) || parts[0] >= 224 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  );
  if (internalName || ipv6 || privateIPv4) throw new Error("Il webhook non può chiamare indirizzi locali o reti private");
  return url;
}
