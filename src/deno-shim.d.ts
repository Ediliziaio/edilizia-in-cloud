/**
 * Tipi minimi di Deno per il controllo dei tipi dell'app.
 *
 * Le edge function girano su Deno, ma alcuni test sotto `src/test/` le
 * importano di proposito — cosi' quello che gira sul server e quello che i
 * test verificano sono lo stesso identico modulo, non due copie destinate a
 * divergere. Il rovescio della medaglia e' che `tsc -p tsconfig.app.json`,
 * che conosce solo il DOM, si trova davanti il globale `Deno` e non sa cosa
 * sia: 49 errori "Cannot find name 'Deno'" che non riguardano l'app.
 *
 * Qui si dichiara solo la superficie davvero usata da quei moduli. NON e'
 * un rimpiazzo di `@types/deno`: serve al controllo dei tipi, non a far
 * girare codice Deno nel browser. Se una edge function comincia a usare
 * un'altra API di Deno e un test la importa, si aggiunge qui la firma.
 */

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    toObject(): Record<string, string>;
  }

  /** Socket TCP/TLS: li usa imapSmtpClient per parlare con i server di posta. */
  interface Conn {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    read(p: Uint8Array): Promise<number | null>;
    write(p: Uint8Array): Promise<number>;
    close(): void;
  }
  type TcpConn = Conn;
  type TlsConn = Conn;

  interface ServeHandlerInfo {
    remoteAddr: { hostname: string; port: number; transport: string };
  }
  type ServeHandler = (
    request: Request,
    info?: ServeHandlerInfo,
  ) => Response | Promise<Response>;
}

declare const Deno: {
  env: Deno.Env;
  serve(handler: Deno.ServeHandler): { finished: Promise<void> };
  serve(
    options: { port?: number; hostname?: string; signal?: AbortSignal },
    handler: Deno.ServeHandler,
  ): { finished: Promise<void> };
  connect(options: { hostname: string; port: number }): Promise<Deno.TcpConn>;
  connectTls(options: {
    hostname: string;
    port: number;
    caCerts?: string[];
  }): Promise<Deno.TlsConn>;
  startTls(
    conn: Deno.Conn,
    options?: { hostname?: string; caCerts?: string[] },
  ): Promise<Deno.TlsConn>;
  resolveDns(
    query: string,
    recordType: string,
    options?: { nameServer?: { ipAddr: string; port?: number } },
  ): Promise<unknown>;
};
