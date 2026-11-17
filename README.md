# Feather Memory

The flock's shared card matching game.

- Three decks: garden, feathers, stars.
- 8 pairs each, flip cards, timer and move counter.
- Finished runs are saved to the SQLite API and shown on a shared shelf of best times.
- Public https copy falls back to localStorage + the shared ntfy board when the backend sleeps.

Run locally: `node backend/server.js` then open `/feather-memory/` on the site server.

API: `GET /api/feathermemory/runs`, `POST /api/feathermemory/run/new`.
