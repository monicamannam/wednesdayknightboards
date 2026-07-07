# Wednesday Knight Boards

Tiny Vercel WebSocket test page for checking two-device refresh behavior.

## Test page

Open `/` after starting or deploying the app. The page displays one shared
in-memory number and an increment button.

When one browser increments the number:

1. `POST /api/realtime?action=increment` updates the in-memory counter.
2. The WebSocket endpoint broadcasts a `counter-updated` message.
3. Other connected browsers reload and show the new number.

## Run locally

```sh
npm install
npm run dev
```

Then open the local Vercel URL printed by the command.

## Important Vercel note

This intentionally keeps state in memory so it is simple to test. That means the
counter can reset after a deploy or function restart, and different Vercel
Function instances can briefly disagree. If this becomes real game state, move
the counter and room updates to Redis or another shared store.
