/**
 * A tiny static server for the browser checks: it serves the built site
 * (dist/web) with the response headers vercel.json gives the public site
 * (the security policy and the rest), so a page that breaks under those
 * headers fails here, before a deploy. Only vercel.json's "/(.*)"-style
 * sources are understood, which is all it uses.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export async function serve(root, configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rules = (config.headers ?? []).map((h) => ({ re: new RegExp(`^${h.source}$`), headers: h.headers }));
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    let file = path.resolve(base, `.${decodeURIComponent(pathname)}`);
    if (pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(base) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    for (const r of rules) if (r.re.test(pathname)) for (const h of r.headers) res.setHeader(h.key, h.value);
    res.setHeader("Content-Type", file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((resolve) => server.close(resolve)) };
}
