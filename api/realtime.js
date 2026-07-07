import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

let count = 0;
let version = 0;
const games = new Map();

const server = http.createServer(async (request, response) => {
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
    const adminError = getAdminError(request, body);
    if (adminError) {
      sendJson(response, adminError.status, { error: adminError.message });
      return;
    }

    const playerNames = normalizePlayerNames(body.players);
    if (playerNames.length < 2) {
      sendJson(response, 400, { error: "Create a game with at least two players." });
      return;
    }

    const game = createGame({
      title: body.title,
      playerNames,
    });
    games.set(game.id, game);
    broadcast({ type: "game-created", gameId: game.id, version: game.version });
    sendJson(response, 201, getAdminGameState(game));
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

  if (request.method === "POST" && action === "end-turn") {
    const body = await readJson(request);
    const game = games.get(body.gameId);
    if (!game) {
      sendJson(response, 404, { error: "Game not found." });
      return;
    }

    const playerIndex = game.players.findIndex((player) => player.token === body.playerToken);
    if (playerIndex === -1) {
      sendJson(response, 403, { error: "This player link is not valid for the game." });
      return;
    }

    if (playerIndex !== game.currentPlayerIndex) {
      sendJson(response, 409, { error: "It is not your turn yet." });
      return;
    }

    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    game.turnNumber += 1;
    game.version += 1;
    game.updatedAt = new Date().toISOString();

    broadcast({ type: "game-updated", gameId: game.id, version: game.version });
    sendJson(response, 200, getPlayerGameState(game, body.playerToken));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "connected" }));
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

function getAdminError(request, body) {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) {
    return {
      status: 503,
      message: "ADMIN_TOKEN is not set on this deployment.",
    };
  }

  const actualToken = request.headers["x-admin-token"] ?? body.adminToken;
  if (actualToken !== expectedToken) {
    return {
      status: 401,
      message: "Admin token is missing or incorrect.",
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
    .slice(0, 12);
}

function createGame({ title, playerNames }) {
  const now = new Date().toISOString();

  return {
    id: createToken(8),
    title: String(title || "Wednesday Knight Game").trim(),
    players: playerNames.map((name) => ({
      id: createToken(6),
      name,
      token: createToken(18),
    })),
    currentPlayerIndex: 0,
    turnNumber: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function getAdminGameState(game) {
  return {
    id: game.id,
    title: game.title,
    currentPlayerName: game.players[game.currentPlayerIndex].name,
    turnNumber: game.turnNumber,
    version: game.version,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      linkPath: `/player.html?game=${encodeURIComponent(game.id)}&token=${encodeURIComponent(player.token)}`,
    })),
  };
}

function getPlayerGameState(game, playerToken) {
  const playerIndex = game.players.findIndex((player) => player.token === playerToken);
  if (playerIndex === -1) {
    return null;
  }

  const currentPlayer = game.players[game.currentPlayerIndex];
  const you = game.players[playerIndex];

  return {
    id: game.id,
    title: game.title,
    turnNumber: game.turnNumber,
    version: game.version,
    currentPlayerName: currentPlayer.name,
    isYourTurn: playerIndex === game.currentPlayerIndex,
    you: {
      id: you.id,
      name: you.name,
    },
    players: game.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      isCurrent: index === game.currentPlayerIndex,
      isYou: index === playerIndex,
    })),
  };
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
