import http from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

let count = 0;
let version = 0;
const games = new Map();

const cards = [
  {
    key: "scout",
    name: "Scout",
    value: 1,
    count: 5,
    text: "Name a role. If your target has it, they are out.",
    target: "other",
    guess: true,
  },
  {
    key: "seer",
    name: "Seer",
    value: 2,
    count: 2,
    text: "Look at another player's hand.",
    target: "other",
  },
  {
    key: "duelist",
    name: "Duelist",
    value: 3,
    count: 2,
    text: "Compare hands with another player. Lower value is out.",
    target: "other",
  },
  {
    key: "shield",
    name: "Shield",
    value: 4,
    count: 2,
    text: "You cannot be targeted until your next turn.",
    target: "none",
  },
  {
    key: "envoy",
    name: "Envoy",
    value: 5,
    count: 2,
    text: "Choose any player. They discard their hand and draw a new card.",
    target: "any",
  },
  {
    key: "regent",
    name: "Regent",
    value: 6,
    count: 1,
    text: "Trade hands with another player.",
    target: "other",
  },
  {
    key: "advisor",
    name: "Advisor",
    value: 7,
    count: 1,
    text: "If you also hold Envoy or Regent, you must play Advisor.",
    target: "none",
  },
  {
    key: "crown",
    name: "Crown",
    value: 8,
    count: 1,
    text: "If you discard this, you are out.",
    target: "none",
  },
];

const cardByKey = new Map(cards.map((card) => [card.key, card]));

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

    const game =
      body.gameType === "industrial"
        ? createIndustrialGame({
            title: body.title,
            playerNames,
          })
        : createGame({
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
    if (!isCurrentGameShape(game)) {
      sendJson(response, 409, { error: "This link is for an older game. Create a fresh game." });
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

  if (request.method === "POST" && action === "play-card") {
    const body = await readJson(request);
    const result = playCard(body);
    if (result.error) {
      sendJson(response, result.status, { error: result.error });
      return;
    }

    broadcast({ type: "game-updated", gameId: result.game.id, version: result.game.version });
    sendJson(response, 200, getPlayerGameState(result.game, body.playerToken));
    return;
  }

  if (request.method === "POST" && action === "industrial-action") {
    const body = await readJson(request);
    const result = takeIndustrialAction(body);
    if (result.error) {
      sendJson(response, result.status, { error: result.error });
      return;
    }

    broadcast({ type: "game-updated", gameId: result.game.id, version: result.game.version });
    sendJson(response, 200, getPlayerGameState(result.game, body.playerToken));
    return;
  }

  if (request.method === "POST" && action === "start-round") {
    const body = await readJson(request);
    const game = games.get(body.gameId);
    if (!game) {
      sendJson(response, 404, { error: "Game not found." });
      return;
    }
    if (!isCurrentGameShape(game)) {
      sendJson(response, 409, { error: "This link is for an older game. Create a fresh game." });
      return;
    }

    const player = getPlayerByToken(game, body.playerToken);
    if (!player) {
      sendJson(response, 403, { error: "This player link is not valid for the game." });
      return;
    }

    if (game.status === "finished") {
      sendJson(response, 409, { error: "This game is already finished." });
      return;
    }

    if (game.round.status !== "over") {
      sendJson(response, 409, { error: "The current round is still active." });
      return;
    }

    const starterIndex =
      game.round.winnerIds.length === 1
        ? game.players.findIndex((candidate) => candidate.id === game.round.winnerIds[0])
        : game.round.currentPlayerIndex;
    startRound(game, Math.max(0, starterIndex));
    touchGame(game);
    broadcast({ type: "game-updated", gameId: game.id, version: game.version });
    sendJson(response, 200, getPlayerGameState(game, body.playerToken));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "connected" }));
});

function createGame({ title, playerNames }) {
  const now = new Date().toISOString();
  const game = {
    id: createToken(8),
    kind: "courier",
    title: String(title || "Court Courier").trim(),
    status: "active",
    targetScore: getTargetScore(playerNames.length),
    players: playerNames.map((name) => ({
      id: createToken(6),
      name,
      token: createToken(18),
      score: 0,
      hand: [],
      discard: [],
      eliminated: false,
      protected: false,
      privateLog: [],
    })),
    roundNumber: 0,
    round: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  startRound(game, 0);
  return game;
}

function startRound(game, starterIndex) {
  const deck = shuffle(createDeck());
  const burn = deck.pop();

  game.roundNumber += 1;
  game.round = {
    status: "active",
    deck,
    burn,
    currentPlayerIndex: starterIndex,
    turnNumber: 1,
    winnerIds: [],
    summary: "",
    log: [],
  };

  for (const player of game.players) {
    player.hand = [];
    player.discard = [];
    player.eliminated = false;
    player.protected = false;
    player.privateLog = [];
    drawCard(game, player);
  }

  drawForCurrentPlayer(game);
  addLog(game, `Round ${game.roundNumber} begins. ${getCurrentPlayer(game).name} has the first move.`);
}

function playCard(body) {
  const game = games.get(body.gameId);
  if (!game) {
    return { status: 404, error: "Game not found." };
  }
  if (!isCurrentGameShape(game)) {
    return {
      status: 409,
      error: "This link is for an older game. Create a fresh game.",
    };
  }
  if (game.kind === "industrial") {
    return { status: 409, error: "This is an Iron Ledger game, not a Court Courier game." };
  }

  const actorIndex = game.players.findIndex((player) => player.token === body.playerToken);
  const actor = game.players[actorIndex];
  if (!actor) {
    return { status: 403, error: "This player link is not valid for the game." };
  }

  if (game.status === "finished") {
    return { status: 409, error: "This game is already finished." };
  }

  if (game.round.status !== "active") {
    return { status: 409, error: "This round is over." };
  }

  if (actorIndex !== game.round.currentPlayerIndex || actor.eliminated) {
    return { status: 409, error: "It is not your turn." };
  }

  const cardIndex = actor.hand.findIndex((card) => card.id === body.cardId);
  const playedCard = actor.hand[cardIndex];
  if (!playedCard) {
    return { status: 400, error: "That card is not in your hand." };
  }

  if (!isPlayableCard(actor.hand, playedCard)) {
    return { status: 409, error: "Advisor must be played while you also hold Envoy or Regent." };
  }

  const targetResult = getActionTarget(game, actor, playedCard, body.targetId);
  if (targetResult.error) {
    return targetResult;
  }

  const guessResult = getGuess(playedCard, body.guessKey);
  if (guessResult.error) {
    return guessResult;
  }

  actor.hand.splice(cardIndex, 1);
  discardCard(actor, playedCard);
  addLog(game, `${actor.name} played ${playedCard.name}.`);

  resolveCard(game, actor, playedCard, targetResult.target, guessResult.guess);
  finishTurn(game);
  touchGame(game);

  return { game };
}

function resolveCard(game, actor, playedCard, target, guess) {
  if (playedCard.key === "crown") {
    eliminatePlayer(game, actor, "discarded the Crown");
    return;
  }

  if (playedCard.target !== "none" && !target) {
    addLog(game, `${playedCard.name} had no valid target.`);
    return;
  }

  if (playedCard.key === "scout") {
    const targetCard = target.hand[0];
    if (targetCard?.key === guess.key) {
      eliminatePlayer(game, target, `${actor.name} guessed ${guess.name}`);
    } else {
      addLog(game, `${actor.name} guessed ${guess.name}, but ${target.name} stayed in.`);
    }
    return;
  }

  if (playedCard.key === "seer") {
    const targetCard = target.hand[0];
    const message = targetCard
      ? `${target.name} is holding ${targetCard.name}.`
      : `${target.name} has no card in hand.`;
    addPrivateLog(actor, message);
    addLog(game, `${actor.name} looked at ${target.name}'s hand.`);
    return;
  }

  if (playedCard.key === "duelist") {
    const actorCard = actor.hand[0];
    const targetCard = target.hand[0];
    if (!actorCard || !targetCard) {
      addLog(game, "The duel fizzled because a hand was empty.");
      return;
    }

    if (actorCard.value === targetCard.value) {
      addLog(game, `${actor.name} and ${target.name} tied their duel.`);
      return;
    }

    const loser = actorCard.value < targetCard.value ? actor : target;
    eliminatePlayer(game, loser, "lost a duel");
    return;
  }

  if (playedCard.key === "shield") {
    actor.protected = true;
    addLog(game, `${actor.name} is protected until their next turn.`);
    return;
  }

  if (playedCard.key === "envoy") {
    const discarded = target.hand.splice(0);
    if (discarded.length === 0) {
      addLog(game, `${target.name} had no card to discard.`);
      return;
    }

    for (const card of discarded) {
      discardCard(target, card);
      addLog(game, `${target.name} discarded ${card.name}.`);
      if (card.key === "crown") {
        eliminatePlayer(game, target, "discarded the Crown");
        return;
      }
    }

    if (!target.eliminated) {
      drawCard(game, target);
      addLog(game, `${target.name} drew a new card.`);
    }
    return;
  }

  if (playedCard.key === "regent") {
    const actorHand = actor.hand;
    actor.hand = target.hand;
    target.hand = actorHand;
    addLog(game, `${actor.name} traded hands with ${target.name}.`);
  }
}

function finishTurn(game) {
  const activePlayers = getActivePlayers(game);
  if (activePlayers.length <= 1) {
    endRound(game, activePlayers);
    return;
  }

  if (game.round.deck.length === 0) {
    endRound(game, activePlayers);
    return;
  }

  const nextIndex = getNextActivePlayerIndex(game, game.round.currentPlayerIndex);
  game.round.currentPlayerIndex = nextIndex;
  game.round.turnNumber += 1;
  getCurrentPlayer(game).protected = false;
  drawForCurrentPlayer(game);
  addLog(game, `${getCurrentPlayer(game).name}'s turn begins.`);
}

function endRound(game, activePlayers) {
  let winners = activePlayers;

  if (activePlayers.length > 1) {
    const highestValue = Math.max(...activePlayers.map((player) => player.hand[0]?.value ?? 0));
    winners = activePlayers.filter((player) => (player.hand[0]?.value ?? 0) === highestValue);
  }

  for (const winner of winners) {
    winner.score += 1;
  }

  game.round.status = "over";
  game.round.winnerIds = winners.map((winner) => winner.id);
  game.round.summary =
    winners.length === 1
      ? `${winners[0].name} wins round ${game.roundNumber}.`
      : `${winners.map((winner) => winner.name).join(", ")} share round ${game.roundNumber}.`;
  addLog(game, game.round.summary);

  const gameWinners = game.players.filter((player) => player.score >= game.targetScore);
  if (gameWinners.length > 0) {
    game.status = "finished";
    addLog(game, `${gameWinners.map((winner) => winner.name).join(", ")} reached ${game.targetScore} points.`);
  }
}

function getHostGameState(game) {
  if (game.kind === "industrial") {
    return getIndustrialHostGameState(game);
  }

  return {
    id: game.id,
    kind: game.kind ?? "courier",
    title: game.title,
    targetScore: game.targetScore,
    roundNumber: game.roundNumber,
    version: game.version,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      linkPath: `/player.html?game=${encodeURIComponent(game.id)}&token=${encodeURIComponent(player.token)}`,
    })),
  };
}

function isCurrentGameShape(game) {
  if (game?.kind === "industrial") {
    return isIndustrialGameShape(game);
  }

  return (
    game &&
    game.round &&
    Array.isArray(game.round.deck) &&
    Array.isArray(game.round.winnerIds) &&
    Array.isArray(game.round.log) &&
    game.players.every(
      (player) =>
        Array.isArray(player.hand) &&
        Array.isArray(player.discard) &&
        Array.isArray(player.privateLog),
    )
  );
}

function getPlayerGameState(game, playerToken) {
  if (game.kind === "industrial") {
    return getIndustrialPlayerGameState(game, playerToken);
  }

  return getCourierPlayerGameState(game, playerToken);
}

function getCourierPlayerGameState(game, playerToken) {
  const playerIndex = game.players.findIndex((player) => player.token === playerToken);
  if (playerIndex === -1) {
    return null;
  }

  const you = game.players[playerIndex];
  const currentPlayer = getCurrentPlayer(game);
  const playableCards = new Set(getPlayableCards(you.hand).map((card) => card.id));
  const isYourTurn =
    game.status === "active" &&
    game.round.status === "active" &&
    playerIndex === game.round.currentPlayerIndex &&
    !you.eliminated;

  return {
    id: game.id,
    title: game.title,
    status: game.status,
    targetScore: game.targetScore,
    roundNumber: game.roundNumber,
    turnNumber: game.round.turnNumber,
    version: game.version,
    currentPlayerName: currentPlayer?.name ?? "",
    deckCount: game.round.deck.length,
    roundStatus: game.round.status,
    roundSummary: game.round.summary,
    winnerNames: game.players
      .filter((player) => game.round.winnerIds.includes(player.id))
      .map((player) => player.name),
    gameWinnerNames: game.players
      .filter((player) => player.score >= game.targetScore)
      .map((player) => player.name),
    isYourTurn,
    canStartRound: game.status === "active" && game.round.status === "over",
    you: {
      id: you.id,
      name: you.name,
      eliminated: you.eliminated,
      protected: you.protected,
      privateLog: you.privateLog.slice(-4).reverse(),
      hand: you.hand.map((card) => ({
        id: card.id,
        key: card.key,
        name: card.name,
        value: card.value,
        text: card.text,
        target: card.target,
        guess: Boolean(card.guess),
        playable: isYourTurn && playableCards.has(card.id),
      })),
    },
    players: game.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      handCount: player.hand.length,
      discard: player.discard.map((card) => ({
        name: card.name,
        value: card.value,
      })),
      eliminated: player.eliminated,
      protected: player.protected,
      isCurrent: index === game.round.currentPlayerIndex,
      isYou: index === playerIndex,
      targetable: isYourTurn && isTargetable(player, you),
    })),
    guessOptions: cards
      .filter((card) => card.key !== "scout")
      .map((card) => ({
        key: card.key,
        name: card.name,
        value: card.value,
      })),
    log: game.round.log.slice(-8).reverse(),
  };
}

const industrialLocations = [
  { id: "wolver", name: "Wolver Crossing", slots: ["mine", "iron", "cotton"] },
  { id: "blackmere", name: "Blackmere", slots: ["mine", "brewery"] },
  { id: "kingsford", name: "Kingsford", slots: ["iron", "cotton", "brewery"] },
  { id: "ashwick", name: "Ashwick", slots: ["cotton", "iron"] },
  { id: "canalport", name: "Canalport", slots: ["brewery", "cotton"] },
  { id: "northgate", name: "Northgate", slots: ["mine", "iron", "cotton"] },
];

const industrialEdges = [
  { id: "wolver-blackmere", a: "wolver", b: "blackmere", name: "Wolver Crossing - Blackmere" },
  { id: "blackmere-kingsford", a: "blackmere", b: "kingsford", name: "Blackmere - Kingsford" },
  { id: "kingsford-ashwick", a: "kingsford", b: "ashwick", name: "Kingsford - Ashwick" },
  { id: "ashwick-canalport", a: "ashwick", b: "canalport", name: "Ashwick - Canalport" },
  { id: "canalport-wolver", a: "canalport", b: "wolver", name: "Canalport - Wolver Crossing" },
  { id: "blackmere-northgate", a: "blackmere", b: "northgate", name: "Blackmere - Northgate" },
  { id: "northgate-ashwick", a: "northgate", b: "ashwick", name: "Northgate - Ashwick" },
];

const industrialTypes = {
  mine: {
    name: "Coal Mine",
    cost: 5,
    coal: 0,
    iron: 0,
    beer: 0,
    points: 3,
    income: 1,
    produces: { coal: 2 },
  },
  iron: {
    name: "Iron Works",
    cost: 5,
    coal: 1,
    iron: 0,
    beer: 0,
    points: 3,
    income: 1,
    produces: { iron: 2 },
  },
  brewery: {
    name: "Brewery",
    cost: 6,
    coal: 0,
    iron: 1,
    beer: 0,
    points: 4,
    income: 1,
    produces: { beer: 2 },
  },
  cotton: {
    name: "Cotton Mill",
    cost: 8,
    coal: 1,
    iron: 1,
    beer: 0,
    points: 0,
    income: 0,
    produces: {},
  },
};

function createIndustrialGame({ title, playerNames }) {
  const now = new Date().toISOString();

  return {
    id: createToken(8),
    kind: "industrial",
    title: String(title || "Iron Ledger").trim(),
    status: "active",
    turnNumber: 1,
    actionLimit: playerNames.length * 12,
    currentPlayerIndex: 0,
    passCount: 0,
    locations: industrialLocations,
    edges: industrialEdges.map((edge) => ({ ...edge, ownerId: null })),
    industries: [],
    log: ["The canal era begins."],
    players: playerNames.map((name) => ({
      id: createToken(6),
      name,
      token: createToken(18),
      money: 25,
      income: 0,
      score: 0,
      coal: 1,
      iron: 1,
      beer: 0,
      lastAction: "",
    })),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function takeIndustrialAction(body) {
  const game = games.get(body.gameId);
  if (!game) {
    return { status: 404, error: "Game not found." };
  }
  if (game.kind !== "industrial") {
    return { status: 409, error: "This is not an Iron Ledger game." };
  }
  if (!isIndustrialGameShape(game)) {
    return { status: 409, error: "This link is for an older game. Create a fresh game." };
  }
  if (game.status === "finished") {
    return { status: 409, error: "This game is already finished." };
  }

  const playerIndex = game.players.findIndex((player) => player.token === body.playerToken);
  const player = game.players[playerIndex];
  if (!player) {
    return { status: 403, error: "This player link is not valid for the game." };
  }
  if (playerIndex !== game.currentPlayerIndex) {
    return { status: 409, error: "It is not your turn." };
  }

  let result;
  if (body.industrialAction === "build-industry") {
    result = buildIndustry(game, player, body.locationId, body.industryType);
  } else if (body.industrialAction === "build-link") {
    result = buildLink(game, player, body.edgeId);
  } else if (body.industrialAction === "sell-cotton") {
    result = sellCotton(game, player, body.industryId);
  } else if (body.industrialAction === "loan") {
    result = takeLoan(game, player);
  } else if (body.industrialAction === "pass") {
    result = passIndustrialTurn(game, player);
  } else {
    result = { status: 400, error: "Choose a valid action." };
  }

  if (result.error) {
    return result;
  }

  finishIndustrialAction(game, player, result.summary);
  return { game };
}

function buildIndustry(game, player, locationId, industryType) {
  const location = industrialLocations.find((candidate) => candidate.id === locationId);
  const type = industrialTypes[industryType];
  if (!location || !type || !location.slots.includes(industryType)) {
    return { status: 400, error: "Choose a valid industry slot." };
  }
  if (!isIndustrialLocationReachable(game, player, location.id)) {
    return { status: 409, error: "Build within your network, or build anywhere as your first network action." };
  }
  if (
    game.industries.some(
      (industry) => industry.locationId === location.id && industry.type === industryType,
    )
  ) {
    return { status: 409, error: "That industry slot is already occupied." };
  }
  const spend = spendIndustrialCost(player, type);
  if (spend.error) {
    return spend;
  }

  const industry = {
    id: createToken(8),
    ownerId: player.id,
    locationId: location.id,
    type: industryType,
    flipped: industryType !== "cotton",
  };
  game.industries.push(industry);
  player.score += type.points;
  player.income += type.income;
  for (const [resource, amount] of Object.entries(type.produces)) {
    player[resource] += amount;
  }

  return { summary: `${player.name} built ${type.name} in ${location.name}.` };
}

function buildLink(game, player, edgeId) {
  const edge = game.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) {
    return { status: 400, error: "Choose a valid route." };
  }
  if (edge.ownerId) {
    return { status: 409, error: "That route is already built." };
  }
  if (!isIndustrialEdgeReachable(game, player, edge)) {
    return { status: 409, error: "Build routes from your existing network, or anywhere as your first link." };
  }
  const spend = spendIndustrialCost(player, { cost: 4, coal: 1, iron: 0, beer: 0 });
  if (spend.error) {
    return spend;
  }

  edge.ownerId = player.id;
  player.score += 2;
  player.income += 1;
  return { summary: `${player.name} built the ${edge.name} canal route.` };
}

function sellCotton(game, player, industryId) {
  const industry = game.industries.find(
    (candidate) => candidate.id === industryId && candidate.ownerId === player.id,
  );
  if (!industry || industry.type !== "cotton" || industry.flipped) {
    return { status: 400, error: "Choose one of your unsold cotton mills." };
  }
  if (player.beer < 1) {
    return { status: 409, error: "Selling cotton requires 1 beer." };
  }

  player.beer -= 1;
  industry.flipped = true;
  player.money += 8;
  player.income += 2;
  player.score += 5;
  return { summary: `${player.name} sold cotton from ${getIndustrialLocationName(industry.locationId)}.` };
}

function takeLoan(game, player) {
  player.money += 10;
  player.income -= 2;
  return { summary: `${player.name} took a loan.` };
}

function passIndustrialTurn(game, player) {
  game.passCount += 1;
  return { summary: `${player.name} passed.` };
}

function finishIndustrialAction(game, player, summary) {
  if (summary) {
    addIndustrialLog(game, summary);
    player.lastAction = summary;
  }
  player.money += Math.max(0, player.income);

  if (summary && !summary.endsWith("passed.")) {
    game.passCount = 0;
  }

  if (game.turnNumber >= game.actionLimit || game.passCount >= game.players.length) {
    finishIndustrialGame(game);
    touchGame(game);
    return;
  }

  game.turnNumber += 1;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  addIndustrialLog(game, `${game.players[game.currentPlayerIndex].name}'s turn begins.`);
  touchGame(game);
}

function finishIndustrialGame(game) {
  for (const player of game.players) {
    player.score += Math.floor(Math.max(0, player.money) / 5);
  }
  game.status = "finished";
  addIndustrialLog(game, "The canal era ends. Final cash bonuses were scored.");
}

function spendIndustrialCost(player, cost) {
  if (player.money < cost.cost) {
    return { status: 409, error: "Not enough money." };
  }
  if (player.coal < cost.coal) {
    return { status: 409, error: "Not enough coal." };
  }
  if (player.iron < cost.iron) {
    return { status: 409, error: "Not enough iron." };
  }
  if (player.beer < cost.beer) {
    return { status: 409, error: "Not enough beer." };
  }

  player.money -= cost.cost;
  player.coal -= cost.coal;
  player.iron -= cost.iron;
  player.beer -= cost.beer;
  return {};
}

function isIndustrialLocationReachable(game, player, locationId) {
  if (!hasIndustrialNetwork(game, player)) {
    return true;
  }
  if (game.industries.some((industry) => industry.ownerId === player.id && industry.locationId === locationId)) {
    return true;
  }
  return game.edges.some((edge) => edge.ownerId === player.id && (edge.a === locationId || edge.b === locationId));
}

function isIndustrialEdgeReachable(game, player, edge) {
  if (!hasIndustrialNetwork(game, player)) {
    return true;
  }
  return isIndustrialLocationReachable(game, player, edge.a) || isIndustrialLocationReachable(game, player, edge.b);
}

function hasIndustrialNetwork(game, player) {
  return (
    game.industries.some((industry) => industry.ownerId === player.id) ||
    game.edges.some((edge) => edge.ownerId === player.id)
  );
}

function getIndustrialHostGameState(game) {
  return {
    id: game.id,
    kind: game.kind,
    title: game.title,
    actionLimit: game.actionLimit,
    version: game.version,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      linkPath: `/industrial.html?game=${encodeURIComponent(game.id)}&token=${encodeURIComponent(player.token)}`,
    })),
  };
}

function getIndustrialPlayerGameState(game, playerToken) {
  const playerIndex = game.players.findIndex((player) => player.token === playerToken);
  if (playerIndex === -1) {
    return null;
  }

  const you = game.players[playerIndex];
  const isYourTurn = game.status === "active" && playerIndex === game.currentPlayerIndex;

  return {
    id: game.id,
    kind: game.kind,
    title: game.title,
    status: game.status,
    turnNumber: game.turnNumber,
    actionLimit: game.actionLimit,
    version: game.version,
    currentPlayerName: game.players[game.currentPlayerIndex]?.name ?? "",
    isYourTurn,
    you: {
      id: you.id,
      name: you.name,
      money: you.money,
      income: you.income,
      score: you.score,
      coal: you.coal,
      iron: you.iron,
      beer: you.beer,
    },
    players: game.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      money: player.money,
      income: player.income,
      score: player.score,
      coal: player.coal,
      iron: player.iron,
      beer: player.beer,
      isCurrent: index === game.currentPlayerIndex,
      isYou: index === playerIndex,
      lastAction: player.lastAction,
    })),
    locations: industrialLocations.map((location) => ({
      ...location,
      industries: game.industries
        .filter((industry) => industry.locationId === location.id)
        .map((industry) => ({
          ...industry,
          ownerName: getIndustrialPlayerName(game, industry.ownerId),
          typeName: industrialTypes[industry.type].name,
        })),
    })),
    edges: game.edges.map((edge) => ({
      ...edge,
      ownerName: edge.ownerId ? getIndustrialPlayerName(game, edge.ownerId) : "",
    })),
    industryTypes: Object.entries(industrialTypes).map(([id, type]) => ({ id, ...type })),
    sellableMills: game.industries
      .filter((industry) => industry.ownerId === you.id && industry.type === "cotton" && !industry.flipped)
      .map((industry) => ({
        id: industry.id,
        locationName: getIndustrialLocationName(industry.locationId),
      })),
    log: game.log.slice(-10).reverse(),
    winnerNames: getIndustrialWinners(game).map((player) => player.name),
  };
}

function isIndustrialGameShape(game) {
  return (
    game.kind === "industrial" &&
    Array.isArray(game.players) &&
    Array.isArray(game.industries) &&
    Array.isArray(game.edges) &&
    Array.isArray(game.log)
  );
}

function getIndustrialWinners(game) {
  if (game.status !== "finished") {
    return [];
  }

  const highScore = Math.max(...game.players.map((player) => player.score));
  return game.players.filter((player) => player.score === highScore);
}

function getIndustrialPlayerName(game, playerId) {
  return game.players.find((player) => player.id === playerId)?.name ?? "Unknown";
}

function getIndustrialLocationName(locationId) {
  return industrialLocations.find((location) => location.id === locationId)?.name ?? "Unknown";
}

function addIndustrialLog(game, message) {
  game.log.push(message);
  game.log = game.log.slice(-40);
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

function getActionTarget(game, actor, card, targetId) {
  if (card.target === "none") {
    return { target: null };
  }

  const validTargets = getValidTargets(game, actor, card);
  if (validTargets.length === 0) {
    return { target: null };
  }

  if (!targetId) {
    return { status: 400, error: "Choose a target." };
  }

  const target = game.players.find((player) => player.id === targetId);
  if (!target || !validTargets.some((validTarget) => validTarget.id === target.id)) {
    return { status: 400, error: "Choose a valid active target." };
  }

  return { target };
}

function getValidTargets(game, actor, card) {
  return game.players.filter((player) => {
    if (player.eliminated) {
      return false;
    }

    if (card.target === "other" && player.id === actor.id) {
      return false;
    }

    return player.id === actor.id || !player.protected;
  });
}

function getGuess(card, guessKey) {
  if (!card.guess) {
    return { guess: null };
  }

  const guess = cardByKey.get(guessKey);
  if (!guess || guess.key === "scout") {
    return { status: 400, error: "Scout must guess a role other than Scout." };
  }

  return { guess };
}

function getPlayableCards(hand) {
  const mustPlayAdvisor =
    hand.some((card) => card.key === "advisor") &&
    hand.some((card) => card.key === "envoy" || card.key === "regent");

  return mustPlayAdvisor ? hand.filter((card) => card.key === "advisor") : hand;
}

function isPlayableCard(hand, card) {
  return getPlayableCards(hand).some((playableCard) => playableCard.id === card.id);
}

function isTargetable(player, actor) {
  if (player.eliminated) {
    return false;
  }

  return player.id === actor.id || !player.protected;
}

function eliminatePlayer(game, player, reason) {
  player.eliminated = true;
  player.protected = false;
  for (const card of player.hand.splice(0)) {
    discardCard(player, card);
  }
  addLog(game, `${player.name} is out: ${reason}.`);
}

function drawForCurrentPlayer(game) {
  const player = getCurrentPlayer(game);
  if (player && !player.eliminated && player.hand.length < 2) {
    drawCard(game, player);
  }
}

function drawCard(game, player) {
  const card = game.round.deck.pop();
  if (card) {
    player.hand.push(card);
  }
}

function discardCard(player, card) {
  player.discard.push({
    key: card.key,
    name: card.name,
    value: card.value,
  });
}

function getCurrentPlayer(game) {
  return game.players[game.round.currentPlayerIndex];
}

function getPlayerByToken(game, playerToken) {
  return game.players.find((player) => player.token === playerToken);
}

function getActivePlayers(game) {
  return game.players.filter((player) => !player.eliminated);
}

function getNextActivePlayerIndex(game, currentIndex) {
  for (let offset = 1; offset <= game.players.length; offset += 1) {
    const index = (currentIndex + offset) % game.players.length;
    if (!game.players[index].eliminated) {
      return index;
    }
  }

  return currentIndex;
}

function addLog(game, message) {
  game.round.log.push(message);
  game.round.log = game.round.log.slice(-30);
}

function addPrivateLog(player, message) {
  player.privateLog.push(message);
  player.privateLog = player.privateLog.slice(-12);
}

function touchGame(game) {
  game.version += 1;
  game.updatedAt = new Date().toISOString();
}

function getTargetScore(playerCount) {
  if (playerCount <= 2) {
    return 7;
  }
  if (playerCount === 3) {
    return 5;
  }
  if (playerCount === 4) {
    return 4;
  }
  return 3;
}

function createDeck() {
  return cards.flatMap((card) =>
    Array.from({ length: card.count }, () => ({
      id: createToken(10),
      key: card.key,
      name: card.name,
      value: card.value,
      text: card.text,
      target: card.target,
      guess: card.guess,
    })),
  );
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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
