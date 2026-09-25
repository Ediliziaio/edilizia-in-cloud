/** Concurrent previews must not replace each other's optimized dependency files. */
export function viteLocalCacheKey(
  command: string,
  mode: string,
  args: string[],
  env: { PORT?: string; VITE_APP_MODE?: string },
): string {
  const portIndex = args.indexOf("--port");
  const cliPort = portIndex >= 0 ? args[portIndex + 1] : args.find(arg => arg.startsWith("--port="))?.slice(7);
  const parsed = Number(cliPort || env.PORT || 8080);
  const port = Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 8080;
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safe(command)}-${safe(mode)}-${safe(env.VITE_APP_MODE || "full")}${command === "serve" ? `-${port}` : ""}`;
}
