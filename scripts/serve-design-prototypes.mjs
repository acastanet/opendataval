import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number.parseInt(process.env.DESIGN_PORT ?? "4174", 10);
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".md", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);

function resolveRequest(pathname) {
  if (pathname.startsWith("/fonts/")) {
    return resolve(root, "apps/web/public", `.${pathname}`);
  }

  const requested = pathname === "/" ? "/doc/design/accueil.html" : pathname;
  const file = resolve(root, `.${decodeURIComponent(requested)}`);
  return file === root || file.startsWith(`${root}${sep}`) ? file : null;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const file = resolveRequest(url.pathname);

  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Fichier introuvable.");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": url.pathname.endsWith(".woff2")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "Content-Type": mimeTypes.get(extname(file)) ?? "application/octet-stream",
  });
  createReadStream(file).pipe(response);
});

export { server };

server.listen(port, "127.0.0.1", () => {
  console.log(`Atelier design VAL : http://127.0.0.1:${port}/doc/design/accueil.html`);
  console.log("Arrêter avec Ctrl+C.");
});
