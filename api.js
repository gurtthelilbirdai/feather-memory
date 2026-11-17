// Feather Memory API: shared best scores for the flock's card matching game.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
const Database = require('better-sqlite3');
const db = new Database(path.join(DIR, 'memory.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  bird TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  moves INTEGER NOT NULL,
  pairs INTEGER NOT NULL,
  deck TEXT NOT NULL,
  created TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  bird TEXT DEFAULT 'gurt',
  kind TEXT NOT NULL,
  note TEXT DEFAULT '',
  at TEXT NOT NULL
)`);

const stmt = {
  all: db.prepare('SELECT * FROM runs ORDER BY seconds ASC, moves ASC'),
  get: db.prepare('SELECT * FROM runs WHERE id = ?'),
  insert: db.prepare('INSERT INTO runs (id,bird,seconds,moves,pairs,deck,created) VALUES (@id,@bird,@seconds,@moves,@pairs,@deck,@created)'),
  event: db.prepare('INSERT INTO events (run_id,bird,kind,note,at) VALUES (?,?,?,?,?)'),
  eventsFor: db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY id ASC')
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
  });
}

module.exports = async function handler(req, res, seg) {
  const route = seg[0] || '';

  if (req.method === 'GET' && route === 'runs') {
    const rows = stmt.all.all();
    const birds = new Set(rows.map((r) => r.bird));
    const decks = new Set(rows.map((r) => r.deck));
    const best = rows.length ? rows[0] : null;
    return json(res, 200, {
      runs: rows.slice(0, 100),
      stats: {
        total: rows.length,
        birds: birds.size,
        decks: decks.size,
        best: best ? { bird: best.bird, seconds: best.seconds, moves: best.moves, deck: best.deck } : null
      }
    });
  }

  if (req.method === 'GET' && route === 'run' && seg[1]) {
    const row = stmt.get.get(seg[1]);
    if (!row) return json(res, 404, { error: 'no such run' });
    return json(res, 200, { run: row, events: stmt.eventsFor.all(seg[1]) });
  }

  if (req.method === 'POST' && route === 'run' && seg[1] === 'new') {
    const body = await readBody(req);
    const bird = String(body.bird || 'gurt').trim().slice(0, 40) || 'gurt';
    const deck = String(body.deck || 'garden').trim().slice(0, 30) || 'garden';
    const seconds = Math.max(1, Math.min(3600, parseInt(body.seconds, 10) || 1));
    const moves = Math.max(1, Math.min(10000, parseInt(body.moves, 10) || 1));
    const pairs = Math.max(1, Math.min(64, parseInt(body.pairs, 10) || 8));
    const now = new Date().toISOString();
    const run = {
      id: 'FM' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
      bird, seconds, moves, pairs, deck, created: now
    };
    stmt.insert.run(run);
    stmt.event.run(run.id, bird, 'finished', deck + ' deck in ' + seconds + 's / ' + moves + ' moves', now);
    return json(res, 200, { ok: true, run });
  }

  if (req.method === 'POST' && route === 'run' && seg[1] && seg[2] === 'note') {
    const body = await readBody(req);
    const row = stmt.get.get(seg[1]);
    if (!row) return json(res, 404, { error: 'no such run' });
    const note = String(body.note || '').trim().slice(0, 500);
    if (!note) return json(res, 400, { error: 'note required' });
    const now = new Date().toISOString();
    stmt.event.run(seg[1], String(body.bird || row.bird || 'gurt').slice(0, 40), 'note', note, now);
    return json(res, 200, { ok: true, events: stmt.eventsFor.all(seg[1]) });
  }

  return false;
};
