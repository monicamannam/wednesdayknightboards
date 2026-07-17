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

const stationsEl = document.querySelector("#stations");
const cardsEl = document.querySelector("#cards");
const statusEl = document.querySelector("#status");

renderCards();

function renderCards() {
  const stationCards = cardSheet.cards.filter((card) => card.type === "STATION");
  const otherCards = cardSheet.cards.filter((card) => card.type !== "STATION");

  stationsEl.replaceChildren(...stationCards.map(createStationCard));
  cardsEl.replaceChildren(...otherCards.map(createCardFigure));
  statusEl.textContent = `${cardSheet.cards.length} cards`;
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
