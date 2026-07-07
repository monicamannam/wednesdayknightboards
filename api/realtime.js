import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

let count = 0;
let version = 0;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.searchParams.get("action") === "state") {
    sendJson(response, 200, { count, version });
    return;
  }

  if (request.method === "POST" && url.searchParams.get("action") === "increment") {
    const body = await readJson(request);
    count += 1;
    version += 1;
    broadcast({
      type: "counter-updated",
      count,
      version,
      senderId: body.senderId ?? null,
    });
    sendJson(response, 200, { count, version });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "counter-updated", count, version }));
});

function broadcast(message) {
  const payload = JSON.stringify(message);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        resolve({});
      }
    });

    request.on("error", () => {
      resolve({});
    });
  });
}

export default server;
