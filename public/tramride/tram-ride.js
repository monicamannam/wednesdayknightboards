const cardSheet = {
  width: 6163,
  height: 3387,
  cards: [
    {
      id: "card_01",
      type: "PASSENGER",
      color: "PURPLE",
      x: 94,
      y: 32,
      width: 1446,
      height: 1087,
      rotationAppliedDegrees: -90,
    },
    {
      id: "card_02",
      type: "STATION",
      color: "BLUE",
      x: 1572,
      y: 32,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: 0,
    },
    {
      id: "card_03",
      type: "STATION",
      color: "PURPLE",
      x: 3052,
      y: 63,
      width: 1536,
      height: 1024,
      rotationAppliedDegrees: 0,
    },
    {
      id: "card_04",
      type: "PASSENGER",
      color: "RED",
      x: 4620,
      y: 32,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: -90,
    },
    {
      id: "card_05",
      type: "TRAM",
      cost: 5,
      multiplier: 2,
      x: 32,
      y: 1220,
      width: 1659,
      height: 948,
      rotationAppliedDegrees: 0,
    },
    {
      id: "card_06",
      type: "PASSENGER",
      color: "*",
      x: 1723,
      y: 1151,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: -90,
    },
    {
      id: "card_07",
      type: "TRAM",
      cost: 15,
      multiplier: 4,
      x: 3203,
      y: 1151,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: 0,
    },
    {
      id: "card_08",
      type: "PASSENGER",
      color: "BLUE",
      x: 4683,
      y: 1151,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: -90,
    },
    {
      id: "card_09",
      type: "PASSENGER",
      color: "GREEN",
      x: 93,
      y: 2300,
      width: 1536,
      height: 1024,
      rotationAppliedDegrees: -90,
    },
    {
      id: "card_10",
      type: "STATION",
      color: "GREEN",
      x: 1661,
      y: 2269,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: 0,
    },
    {
      id: "card_11",
      type: "STATION",
      color: "RED",
      x: 3141,
      y: 2269,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: 0,
    },
    {
      id: "card_12",
      type: "TRAM",
      cost: 10,
      multiplier: 3,
      x: 4621,
      y: 2269,
      width: 1448,
      height: 1086,
      rotationAppliedDegrees: 0,
    },
  ],
};

const tramDeckEl = document.querySelector("#tram-deck");
const buyTramButton = document.querySelector("#buy-tram");
const player1MoneyEl = document.querySelector("#player-1-money");
const player1ScoreEl = document.querySelector("#player-1-score");
const player2MoneyEl = document.querySelector("#player-2-money");
const player2ScoreEl = document.querySelector("#player-2-score");
const passengerDeckCountEl = document.querySelector("#passenger-deck-count");
const passengerDiscardCountEl = document.querySelector("#passenger-discard-count");
const tourCountEl = document.querySelector("#tour-count");
const horseTramCountEl = document.querySelector("#horse-tram-count");
const steamTramCountEl = document.querySelector("#steam-tram-count");
const electricTramCountEl = document.querySelector("#electric-tram-count");
const stationsEl = document.querySelector("#stations");
const cardsEl = document.querySelector("#cards");
const statusEl = document.querySelector("#status");
const cardSizes = {
  PASSENGER: { width: 1086, height: 1448 },
  STATION: { width: 1086, height: 724 },
  TRAM: { width: 1086, height: 724 },
};
const passengerColors = ["PURPLE", "BLUE", "GREEN", "RED"];
const passengerDistribution = [
  { number: 1, points: 1, count: 2 },
  { number: 2, points: 1, count: 3 },
  { number: 3, points: 1, count: 3 },
  { number: 4, points: 1, count: 3 },
  { number: 5, points: 1, count: 3 },
  { number: 6, points: 1, count: 3 },
  { number: 7, points: 2, count: 3 },
  { number: 8, points: 2, count: 3 },
  { number: 9, points: 2, count: 3 },
  { number: 10, points: 3, count: 2 },
];
const tramCards = {
  horse: cardSheet.cards.find((card) => card.type === "TRAM" && card.cost === 5),
  steam: cardSheet.cards.find((card) => card.type === "TRAM" && card.cost === 10),
  electric: cardSheet.cards.find((card) => card.type === "TRAM" && card.cost === 15),
};
const gameState = {
  players: [
    { name: "Player 1", money: 9999, score: 0 },
    { name: "Player 2", money: 9999, score: 0 },
  ],
  tours: 0,
  passengerDeck: shuffle(createPassengerDeck()),
  passengerDiscard: [],
  tramDeck: [
    ...Array.from({ length: 5 }, () => tramCards.horse),
    ...Array.from({ length: 4 }, () => tramCards.steam),
    ...Array.from({ length: 7 }, () => tramCards.electric),
  ].filter(Boolean),
};

renderCards();
buyTramButton.addEventListener("click", buyTopTram);

function renderCards() {
  const stationCards = cardSheet.cards.filter((card) => card.type === "STATION");
  const passengerCards = cardSheet.cards.filter((card) => card.type === "PASSENGER");

  stationsEl.replaceChildren(...stationCards.map(createStationCard));
  cardsEl.replaceChildren(...passengerCards.map(createCardFigure));
  renderMoney();
  renderPassengerPiles();
  renderTramCounts();
  renderTramDeck();
  statusEl.textContent = `${gameState.tramDeck.length} trams in deck`;
}

function renderMoney() {
  player1MoneyEl.textContent = formatMoney(gameState.players[0].money);
  player1ScoreEl.textContent = formatScore(gameState.players[0].score);
  player2MoneyEl.textContent = formatMoney(gameState.players[1].money);
  player2ScoreEl.textContent = formatScore(gameState.players[1].score);
}

function renderPassengerPiles() {
  passengerDeckCountEl.textContent = String(gameState.passengerDeck.length);
  passengerDiscardCountEl.textContent = String(gameState.passengerDiscard.length);
}

function renderTramCounts() {
  tourCountEl.textContent = String(gameState.tours);
  horseTramCountEl.textContent = String(countTramsByCost(5));
  steamTramCountEl.textContent = String(countTramsByCost(10));
  electricTramCountEl.textContent = String(countTramsByCost(15));
}

function renderTramDeck() {
  const previewCards = gameState.tramDeck.slice(0, 3);
  tramDeckEl.replaceChildren(...previewCards.map(createCardFigure));

  const topCard = gameState.tramDeck[0];
  if (topCard) {
    buyTramButton.disabled = gameState.players[0].money < topCard.cost;
    buyTramButton.textContent = `Buy top tram - ${formatMoney(topCard.cost)}`;
  } else {
    buyTramButton.disabled = true;
    buyTramButton.textContent = "No trams left";
  }
}

function buyTopTram() {
  const topCard = gameState.tramDeck[0];
  if (!topCard || gameState.players[0].money < topCard.cost) {
    return;
  }

  gameState.players[0].money -= topCard.cost;
  gameState.tramDeck.shift();
  renderMoney();
  renderTramCounts();
  renderTramDeck();
  statusEl.textContent = `Player 1 bought a ${getTramName(topCard)} for ${formatMoney(topCard.cost)}.`;
}

function createStationCard(card) {
  const wrapper = document.createElement("div");
  const counter = document.createElement("div");
  const label = document.createElement("span");
  const count = document.createElement("strong");

  counter.className = "passenger-counter";
  label.textContent = "Passengers";
  count.textContent = "0";

  counter.append(label, count);
  wrapper.append(createCardFigure(card), counter);
  return wrapper;
}

function createCardFigure(card) {
  const figure = document.createElement("figure");
  const frame = document.createElement("div");
  const crop = document.createElement("div");

  figure.className = "card-figure";
  frame.className = "card-frame";
  frame.style.setProperty("--frame-width", cardSizes[card.type].width);
  frame.style.setProperty("--frame-height", cardSizes[card.type].height);

  crop.className = "card-crop";
  crop.style.setProperty("--x", card.x);
  crop.style.setProperty("--y", card.y);
  crop.style.setProperty("--crop-w", card.width);
  crop.style.setProperty("--crop-h", card.height);
  crop.style.setProperty("--rotation", `${card.rotationAppliedDegrees}deg`);
  crop.dataset.rotated = String(card.rotationAppliedDegrees !== 0);
  crop.setAttribute("role", "img");
  crop.setAttribute("aria-label", getCardLabel(card));

  frame.append(crop);
  figure.append(frame);
  return figure;
}

function getCardLabel(card) {
  if (card.type === "TRAM") {
    return `Tram card, cost ${card.cost}, multiplier ${card.multiplier}`;
  }

  const color = card.color === "*" ? "wild" : card.color.toLowerCase();
  return `${color} ${card.type.toLowerCase()} card`;
}

function getTramName(card) {
  if (card.cost === 5) return "horse tram";
  if (card.cost === 10) return "steam tram";
  if (card.cost === 15) return "electric tram";
  return "tram";
}

function formatMoney(amount) {
  return `$${amount}`;
}

function formatScore(score) {
  return `${score} VP`;
}

function countTramsByCost(cost) {
  return gameState.tramDeck.filter((card) => card.cost === cost).length;
}

function createPassengerDeck() {
  const deck = [];

  for (const color of passengerColors) {
    for (const entry of passengerDistribution) {
      for (let copy = 1; copy <= entry.count; copy += 1) {
        deck.push({
          id: `${color.toLowerCase()}-${entry.number}-${copy}`,
          type: "PASSENGER",
          color,
          number: entry.number,
          points: entry.points,
        });
      }
    }
  }

  for (let copy = 1; copy <= 8; copy += 1) {
    deck.push({
      id: `wild-${copy}`,
      type: "PASSENGER",
      color: "*",
      number: null,
      points: 0,
    });
  }

  return deck;
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
