# Wednesday Knight Boards

Tiny Vercel WebSocket app for playing Court Courier, a Love Letter-style card
game with private player links.

## Pages

- `/`: landing page that tells players to use their game link.
- `/create.html`: create a Court Courier game and generate player links.
- `/player.html?game=...&token=...`: player turn page.
- `/test.html`: old shared-counter WebSocket test page.

## Host setup

Set a `GAME_KEY` environment variable in Vercel. The host page asks for that key
before it can create a game.

Game creation stores the game in this deployment's in-memory function state and
returns one unique link per player. Each link contains a player token, so players
can only see and act as themselves.

## Game flow

Court Courier uses a small deck of roles. On your turn you hold two cards, play
one, resolve its effect, and the next active player is notified over WebSockets.
Rounds end when one player remains or the deck runs out. First player to the
target score wins.

Card names are original to this app: Scout, Seer, Duelist, Shield, Envoy,
Regent, Advisor, and Crown.

## Run locally

```sh
npm install
npm run dev
```

Then open the local Vercel URL printed by the command.

## Important Vercel note

This intentionally keeps game state in memory so it is simple to test. That
means games can reset after a deploy or function restart, and different Vercel
Function instances can briefly disagree. If this becomes real game state, move
games and room updates to Redis or another shared store.
