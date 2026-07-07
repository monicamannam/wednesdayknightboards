# Wednesday Knight Boards

Tiny Vercel WebSocket test app for creating a game and giving each player a
private turn link.

## Pages

- `/`: landing page that tells players to use their game link.
- `/create.html`: create a game and generate player links.
- `/player.html?game=...&token=...`: player turn page.
- `/test.html`: old shared-counter WebSocket test page.

## Host setup

Set a `GAME_KEY` environment variable in Vercel. The host page asks for that key
before it can create a game.

Game creation stores the game in this deployment's in-memory function state and
returns one unique link per player. Each link contains a player token, so players
can only act as themselves.

## Turn flow

When the current player ends their turn:

1. `POST /api/realtime?action=end-turn` validates the player token.
2. The server advances to the next player.
3. The WebSocket endpoint broadcasts a `game-updated` message.
4. Other connected browsers reload and show the latest turn.

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
