import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Scope the Docker connection to this process. No daemon-wide setting is changed.
const project = "mosaic-labs-admin";
const endpoint = execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8" }).trim();
if (!endpoint.startsWith("unix://")) throw new Error("O banco de teste exige um Docker local por socket Unix.");
const daemonSocket = endpoint.slice(7);
const directory = await mkdtemp(join(tmpdir(), "mosaic-docker-"));
const socket = join(directory, "api.sock");
const server = http.createServer(async (request, response) => {
  try {
    const headers = { ...request.headers };
    let body;
    if (request.method === "POST" && /\/containers\/create(?:\?|$)/.test(request.url ?? "")) {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const config = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (config.Labels?.["com.supabase.cli.project"] !== project) { response.writeHead(403).end(); return; }
      for (const bindings of Object.values(config.HostConfig?.PortBindings ?? {})) {
        for (const binding of bindings ?? []) binding.HostIp = "127.0.0.1";
      }
      body = Buffer.from(JSON.stringify(config));
      delete headers["transfer-encoding"];
      headers["content-length"] = String(body.length);
    }
    const upstream = http.request({ socketPath: daemonSocket, path: request.url, method: request.method, headers }, (result) => {
      response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response);
    });
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on("aborted", () => upstream.destroy());
    if (body) upstream.end(body); else request.pipe(upstream);
  } catch { if (!response.headersSent) response.writeHead(500); response.end(); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
await chmod(socket, 0o600);
let child;
try {
  child = spawn("supabase", ["start", "-x", "studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta"], { stdio: "inherit", env: { ...process.env, DOCKER_HOST: `unix://${socket}` } });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const status = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  process.exitCode = typeof status === "number" ? status : 1;
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true });
}
