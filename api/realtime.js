import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

let count = 0;
let version = 0;
const games = new Map();

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Server error. Try creating a fresh game." });
    } else {
      response.end();
    }
  });
});

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const action = url.searchParams.get("action");

  if (request.method === "GET" && action === "state") {
    sendJson(response, 200, { count, version });
    return;
  }

  if (request.method === "POST" && action === "increment") {
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

  if (request.method === "POST" && action === "create-game") {
    const body = await readJson(request);
    const keyError = getGameKeyError(request, body);
    if (keyError) {
      sendJson(response, keyError.status, { error: keyError.message });
      return;
    }

    const playerNames = normalizePlayerNames(body.players);
    if (playerNames.length < 2) {
      sendJson(response, 400, { error: "Create a game with at least two players." });
      return;
    }

    const game = createTramRideGame({
      title: body.title,
      playerNames,
    });

    games.set(game.id, game);
    broadcast({ type: "game-created", gameId: game.id, version: game.version });
    sendJson(response, 201, getHostGameState(game));
    return;
  }

  if (request.method === "GET" && action === "game") {
    const game = games.get(url.searchParams.get("gameId"));
    if (!game) {
      sendJson(response, 404, { error: "Game not found." });
      return;
    }

    const playerState = getPlayerGameState(game, url.searchParams.get("playerToken"));
    if (!playerState) {
      sendJson(response, 403, { error: "This player link is not valid for the game." });
      return;
    }

    sendJson(response, 200, playerState);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "connected" }));
});

function createTramRideGame({ title, playerNames }) {
  const now = new Date().toISOString();

  return {
    id: createToken(8),
    kind: "tram-ride",
    title: String(title || "Tram Ride").trim(),
    status: "setup",
    players: playerNames.map((name) => ({
      id: createToken(6),
      name,
      token: createToken(18),
    })),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function getHostGameState(game) {
  return {
    id: game.id,
    kind: game.kind,
    title: game.title,
    status: game.status,
    version: game.version,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      linkPath: `/tram-ride.html?game=${encodeURIComponent(game.id)}&token=${encodeURIComponent(player.token)}`,
    })),
  };
}

function getPlayerGameState(game, playerToken) {
  const playerIndex = game.players.findIndex((player) => player.token === playerToken);
  if (playerIndex === -1) {
    return null;
  }

  const you = game.players[playerIndex];
  return {
    id: game.id,
    kind: game.kind,
    title: game.title,
    status: game.status,
    version: game.version,
    you: {
      id: you.id,
      name: you.name,
    },
    players: game.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      isYou: index === playerIndex,
    })),
  };
}

function getGameKeyError(request, body) {
  const expectedKey = process.env.GAME_KEY;
  if (!expectedKey) {
    return {
      status: 503,
      message: "GAME_KEY is not set on this deployment.",
    };
  }

  const actualKey = request.headers["x-game-key"] ?? body.gameKey;
  if (actualKey !== expectedKey) {
    return {
      status: 401,
      message: "Game key is missing or incorrect.",
    };
  }

  return null;
}

function normalizePlayerNames(players) {
  if (!Array.isArray(players)) {
    return [];
  }

  return players
    .map((name) => String(name).trim())
    .filter(Boolean)
    .slice(0, 5);
}

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

function createToken(length) {
  return randomUUID().replaceAll("-", "").slice(0, length);
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
