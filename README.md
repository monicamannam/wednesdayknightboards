# Wednesday Knight Boards

Tiny Vercel WebSocket app for playing private-link board games.

## Pages

- `/`: landing page that tells players to use their game link.
- `/create.html`: create a Tram Ride game and generate player links.
- `/tram-ride.html?game=...&token=...`: empty Tram Ride player page.
- `/test.html`: old shared-counter WebSocket test page.

## Host setup

Set a `GAME_KEY` environment variable in Vercel. The host page asks for that key
before it can create a game.

Game creation stores the game in this deployment's in-memory function state and
returns one unique link per player. Each link contains a player token, so players
can only see and act as themselves.

## Games

Tram Ride is the only game shell in this app right now. Its player page is empty
until the rules and interface are added.

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
