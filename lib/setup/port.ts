import net from "node:net";

export function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

/** The wanted port when it is free, otherwise the next free one within 50 ports. */
export async function firstFreePort(wanted: number): Promise<number> {
  for (let port = wanted; port < wanted + 50; port++) {
    if (await portIsFree(port)) return port;
  }
  throw new Error(`no free port between ${wanted} and ${wanted + 49}`);
}
