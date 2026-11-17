// Hexalia — moteur partagé (hôte + téléphones + tests node). L'hôte est l'autorité : il valide tout.
(function () {
const COST = { road: [1, 1, 0, 0, 0], settle: [1, 1, 1, 1, 0], city: [0, 0, 0, 2, 3] };
const COLORS = ['#e63946', '#1d7ed8', '#f4a300', '#8e44ad'];
const MAX_PLAYERS = COLORS.length;
const WIN = 10;
const T = { res: ['Bois', 'Brique', 'Laine', 'Paille', 'Caillou'], icons: ['🌲', '🧱', '🐑', '🌾', '🪨'], desert: '🏜️', robber: '🥷', robberName: 'le Brigand' };

// ---- formes de plateau (coordonnées axiales q,r) ----
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const dist = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const area = (R, keep = () => true) => {
  const out = [];
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (dist(q, r) <= R && keep(q, r)) out.push([q, r]);
  return out;
};
const at = (cells, dq, dr) => cells.map(([q, r]) => [q + dq, r + dr]);
const SHAPES = {
  classique: { label: 'Classique', tag: 'tryhard', pitch: 'Le plateau équilibré de référence', cells: area(2) },
  marathon: { label: 'Marathon', tag: 'tryhard', pitch: 'Grand plateau, longues parties à 4', cells: area(3) },
  duel: { label: 'Duel', tag: 'tryhard', pitch: 'Losange serré, idéal à 2', cells: area(3).filter(([q, r]) => q >= 0 && r >= -3 && r <= 0 && q <= 3) },
  anneau: { label: 'Anneau', tag: 'fun', pitch: 'Un lac au centre, on tourne autour', cells: area(2, (q, r) => dist(q, r) >= 1) },
  etoile: { label: 'Étoile', tag: 'fun', pitch: 'Six branches à conquérir', cells: [...area(1), ...DIRS.flatMap(([a, b]) => [[2 * a, 2 * b], [3 * a, 3 * b]])] },
  archipel: { label: 'Archipel', tag: 'fun', pitch: 'Trois îles : choisis bien où débarquer', cells: [[2, 0], [0, -2], [-2, 2]].flatMap(([q, r]) => at(area(1), q, r)) },
  isthme: { label: 'Isthme', tag: 'fun', pitch: 'Deux terres reliées par un pont étroit', cells: [...at(area(1), -3, 0), [-1, 0], [0, 0], [1, 0], ...at(area(1), 3, 0)] },
};

function build(cells) {
  const S = 60, hexes = [], verts = [], edges = [], vk = {}, ek = {}, ck = {};
  cells.forEach(([q, r], i) => { ck[q + ',' + r] = i; });
  cells.forEach(([q, r], hi) => {
    const x = S * Math.sqrt(3) * (q + r / 2), y = S * 1.5 * r;
    const h = { x, y, verts: [], nb: DIRS.map(([a, b]) => ck[(q + a) + ',' + (r + b)]).filter(n => n !== undefined) };
    hexes.push(h);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30), vx = x + S * Math.cos(a), vy = y + S * Math.sin(a);
      const k = Math.round(vx) + ',' + Math.round(vy);
      if (vk[k] === undefined) { vk[k] = verts.length; verts.push({ x: vx, y: vy, hexes: [], adj: [], edges: [] }); }
      verts[vk[k]].hexes.push(hi);
      h.verts.push(vk[k]);
    }
    for (let i = 0; i < 6; i++) {
      const a = h.verts[i], b = h.verts[(i + 1) % 6], k = Math.min(a, b) + '-' + Math.max(a, b);
      if (ek[k] !== undefined) continue;
      ek[k] = edges.length; edges.push({ a, b });
      verts[a].adj.push(b); verts[b].adj.push(a);
      verts[a].edges.push(ek[k]); verts[b].edges.push(ek[k]);
    }
  });
  const xs = verts.map(v => v.x), ys = verts.map(v => v.y), P = 40;
  const box = [Math.min(...xs) - P, Math.min(...ys) - P, Math.max(...xs) - Math.min(...xs) + 2 * P, Math.max(...ys) - Math.min(...ys) + 2 * P];
  return { hexes, verts, edges, box };
}
const cache = {};
const geo = shape => cache[shape] || (cache[shape] = build(SHAPES[shape].cells));

const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const total = h => h.reduce((a, b) => a + b, 0);
const has = (hand, c) => c.every((n, i) => hand[i] >= n);
const pay = (hand, c) => has(hand, c) && (c.forEach((n, i) => hand[i] -= n), true);
const isVec = x => Array.isArray(x) && x.length === 5 && x.every(n => Number.isInteger(n) && n >= 0 && n <= 30);
const idx = (n, len) => Number.isInteger(n) && n >= 0 && n < len;

// Répartition proportionnelle au plateau classique (4/3/4/4/3 + 1 désert pour 19 cases), quelle que soit la forme.
function deal(n) {
  const deserts = Math.max(1, Math.round(n / 19)), land = n - deserts, w = [4, 3, 4, 4, 3];
  const exact = w.map(x => x * land / 18), cnt = exact.map(Math.floor);
  exact.map((x, i) => [x - cnt[i], i]).sort((a, b) => b[0] - a[0]).slice(0, land - total(cnt)).forEach(([, i]) => cnt[i]++);
  const res = cnt.flatMap((c, i) => Array(c).fill(i)).concat(Array(deserts).fill(-1));
  // ordre "équilibré" : sur les petits plateaux on retire d'abord les 2 et 12
  const SEQ = [5, 9, 6, 8, 4, 10, 3, 11, 5, 9, 6, 8, 4, 10, 3, 11, 2, 12];
  return { res, nums: Array.from({ length: land }, (_, i) => SEQ[i % SEQ.length]) };
}

function newBoard(s) {
  const g = geo(s.shape), { res, nums } = deal(g.hexes.length);
  shuffle(res);
  const hot = n => n === 6 || n === 8;
  for (let tries = 0; tries < 500; tries++) { // les 6 et 8 ne se touchent jamais (si c'est possible)
    shuffle(nums);
    let k = 0;
    s.tiles = res.map(r => ({ res: r, num: r < 0 ? 0 : nums[k++] }));
    if (!s.tiles.some((t, i) => hot(t.num) && g.hexes[i].nb.some(j => hot(s.tiles[j].num)))) break;
  }
  s.robber = res.indexOf(-1);
}

function newGame() {
  return { phase: 'lobby', shape: 'classique', players: [], buildings: {}, roads: {}, log: [], trade: null, dice: null, tiles: [] };
}

function setShape(s, k) {
  if (s.phase === 'lobby' && Object.prototype.hasOwnProperty.call(SHAPES, k)) s.shape = k;
}

function addPlayer(s, id, name) {
  if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return -1;
  s.players.push({ id, name, color: COLORS[s.players.length], hand: [0, 0, 0, 0, 0] });
  return s.players.length - 1;
}

function removePlayer(s, k) {
  if (s.phase !== 'lobby' || !s.players[k]) return false;
  s.players.splice(k, 1);
  s.players.forEach((p, i) => { p.color = COLORS[i]; });
  return true;
}

function start(s) {
  if (s.phase !== 'lobby' || !s.players.length) return 'il faut au moins un joueur';
  newBoard(s); // carte tirée au hasard au lancement
  Object.assign(s, { phase: 'setup', step: 0, turn: 0, sub: 'settle' });
  log(s, `La partie commence sur « ${SHAPES[s.shape].label} » !`);
}

function vp(s, pi) {
  let n = 0;
  for (const v in s.buildings) if (s.buildings[v].p === pi) n += s.buildings[v].city ? 2 : 1;
  return n;
}

function canSettle(s, pi, v, needRoad) {
  const g = geo(s.shape);
  if (!idx(v, g.verts.length) || s.buildings[v] || g.verts[v].adj.some(a => s.buildings[a])) return false;
  return !needRoad || g.verts[v].edges.some(e => s.roads[e] === pi);
}

function canRoad(s, pi, e, from) {
  const g = geo(s.shape);
  if (!idx(e, g.edges.length) || s.roads[e] !== undefined) return false;
  const { a, b } = g.edges[e];
  if (from !== undefined) return a === from || b === from;
  return [a, b].some(v => {
    const bl = s.buildings[v];
    if (bl) return bl.p === pi; // un bâtiment adverse coupe le chemin
    return g.verts[v].edges.some(x => x !== e && s.roads[x] === pi);
  });
}

const canCity = (s, pi, v) => idx(v, geo(s.shape).verts.length) && !!s.buildings[v] && s.buildings[v].p === pi && !s.buildings[v].city;

function options(s, pi, kind) {
  const g = geo(s.shape), R = (n, f) => [...Array(n).keys()].filter(f), setup = s.phase === 'setup';
  if (kind === 'settle') return R(g.verts.length, v => canSettle(s, pi, v, !setup));
  if (kind === 'road') return R(g.edges.length, e => canRoad(s, pi, e, setup ? s.last : undefined));
  if (kind === 'city') return R(g.verts.length, v => canCity(s, pi, v));
  if (kind === 'robber') return R(g.hexes.length, h => h !== s.robber);
  return [];
}

function takeRandom(hand) {
  const pool = hand.flatMap((n, r) => Array(n).fill(r));
  if (!pool.length) return -1;
  const r = pool[rnd(pool.length)];
  hand[r]--;
  return r;
}

function victims(s, pi) {
  const out = new Set();
  for (const v of geo(s.shape).hexes[s.robber].verts) {
    const b = s.buildings[v];
    if (b && b.p !== pi && total(s.players[b.p].hand) > 0) out.add(b.p);
  }
  return [...out];
}

function log(s, msg) { s.log.unshift(msg); s.log.length = Math.min(s.log.length, 8); }

function roll(s) {
  const d = [1 + rnd(6), 1 + rnd(6)], sum = d[0] + d[1], g = geo(s.shape);
  s.dice = d;
  log(s, `${s.players[s.turn].name} lance ${sum}`);
  if (sum === 7) {
    for (const p of s.players) {
      const n = total(p.hand);
      // shortcut: défausse aléatoire au lieu d'un choix du joueur, à remplacer par un écran de défausse
      if (n > 7) { for (let k = 0; k < Math.floor(n / 2); k++) takeRandom(p.hand); log(s, `${p.name} perd ${Math.floor(n / 2)} cartes`); }
    }
    s.sub = 'robber';
    log(s, `Déplace ${T.robberName} !`);
    return;
  }
  s.tiles.forEach((t, h) => {
    if (t.num !== sum || h === s.robber) return;
    for (const v of g.hexes[h].verts) {
      const b = s.buildings[v];
      if (b) s.players[b.p].hand[t.res] += b.city ? 2 : 1;
    }
  });
  s.sub = 'build';
}

function steal(s, pi, victim) {
  const r = takeRandom(s.players[victim].hand);
  if (r >= 0) s.players[pi].hand[r]++;
  log(s, `${s.players[pi].name} vole une carte à ${s.players[victim].name}`);
  s.sub = 'build';
}

// Applique l'action m du joueur pi. Retourne un message d'erreur ou undefined.
function act(s, pi, m) {
  const p = s.players[pi], n = s.players.length, g = geo(s.shape);
  if (!p || !m || typeof m.a !== 'string') return 'action invalide';
  if (s.phase === 'lobby') return "la partie n'a pas commencé";
  if (s.phase === 'over') return 'partie terminée';

  if (m.a === 'accept') {
    const t = s.trade;
    if (!t || pi === t.from) return "pas d'offre";
    const from = s.players[t.from];
    if (!has(p.hand, t.want)) return "tu n'as pas les cartes demandées";
    if (!has(from.hand, t.give)) { s.trade = null; return "l'offre n'est plus valable"; }
    pay(from.hand, t.give); pay(p.hand, t.want);
    t.give.forEach((k, i) => p.hand[i] += k);
    t.want.forEach((k, i) => from.hand[i] += k);
    s.trade = null;
    return log(s, `${p.name} accepte l'échange de ${from.name}`);
  }

  if (pi !== s.turn) return "ce n'est pas ton tour";

  if (s.phase === 'setup') {
    if (s.sub === 'settle' && m.a === 'settle' && canSettle(s, pi, m.v, false)) {
      s.buildings[m.v] = { p: pi };
      s.last = m.v;
      s.sub = 'road';
      if (s.step >= n) for (const h of g.verts[m.v].hexes) { const t = s.tiles[h]; if (t.res >= 0) p.hand[t.res]++; }
      return log(s, `${p.name} fonde une colonie`);
    }
    if (s.sub === 'road' && m.a === 'road' && canRoad(s, pi, m.e, s.last)) {
      s.roads[m.e] = pi;
      s.step++;
      if (s.step === 2 * n) Object.assign(s, { phase: 'main', turn: 0, sub: 'roll' });
      else Object.assign(s, { turn: s.step < n ? s.step : 2 * n - 1 - s.step, sub: 'settle' });
      return;
    }
    return 'placement invalide';
  }

  if (m.a === 'roll') return s.sub === 'roll' ? roll(s) : 'dés déjà lancés';
  if (m.a === 'robber') {
    if (s.sub !== 'robber' || !idx(m.h, g.hexes.length) || m.h === s.robber) return 'case invalide';
    s.robber = m.h;
    const vs = victims(s, pi);
    if (vs.length === 1) steal(s, pi, vs[0]); else s.sub = vs.length ? 'steal' : 'build';
    return;
  }
  if (m.a === 'steal') return s.sub === 'steal' && victims(s, pi).includes(m.p) ? steal(s, pi, m.p) : 'cible invalide';
  if (s.sub !== 'build') return 'pas maintenant';

  switch (m.a) {
    case 'road':
      if (!canRoad(s, pi, m.e)) return 'route impossible ici';
      if (!pay(p.hand, COST.road)) return 'pas assez de ressources';
      s.roads[m.e] = pi; log(s, `${p.name} construit une route`); break;
    case 'settle':
      if (!canSettle(s, pi, m.v, true)) return 'colonie impossible ici';
      if (!pay(p.hand, COST.settle)) return 'pas assez de ressources';
      s.buildings[m.v] = { p: pi }; log(s, `${p.name} fonde une colonie`); break;
    case 'city':
      if (!canCity(s, pi, m.v)) return 'ville impossible ici';
      if (!pay(p.hand, COST.city)) return 'pas assez de ressources';
      s.buildings[m.v].city = true; log(s, `${p.name} bâtit une ville`); break;
    case 'bank':
      if (!idx(m.give, 5) || !idx(m.get, 5) || m.give === m.get || p.hand[m.give] < 4) return 'échange impossible';
      p.hand[m.give] -= 4; p.hand[m.get]++; log(s, `${p.name} échange avec la banque`); break;
    case 'offer':
      if (!isVec(m.give) || !isVec(m.want) || !total(m.give) || !total(m.want) || !has(p.hand, m.give)) return 'offre invalide';
      s.trade = { from: pi, give: m.give.slice(), want: m.want.slice() }; log(s, `${p.name} propose un échange`); break;
    case 'cancel': s.trade = null; break;
    case 'end':
      Object.assign(s, { trade: null, dice: null, turn: (s.turn + 1) % n, sub: 'roll' }); break;
    default: return 'action inconnue';
  }
  if (vp(s, pi) >= WIN) { s.phase = 'over'; s.winner = pi; log(s, `🏆 ${p.name} gagne !`); }
}

// Filet de sécurité si plus personne ne peut atteindre 10 points (plateau saturé) : le meilleur score gagne.
function finish(s) {
  if (s.phase !== 'setup' && s.phase !== 'main') return;
  s.winner = s.players.reduce((best, _, i) => vp(s, i) > vp(s, best) ? i : best, 0);
  s.phase = 'over';
  log(s, `🏆 Partie arrêtée : ${s.players[s.winner].name} gagne avec ${vp(s, s.winner)} points`);
}

// Ce que voit le joueur pi (-1 = écran partagé) : les mains adverses sont réduites à un nombre de cartes.
function view(s, pi) {
  const v = JSON.parse(JSON.stringify(s));
  v.players.forEach((p, i) => { p.cards = total(p.hand); p.vp = vp(s, i); delete p.id; if (i !== pi) p.hand = null; });
  v.me = pi;
  return v;
}

const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = vec => vec.map((n, i) => n ? n + T.icons[i] : '').filter(Boolean).join(' ');

// Dessine le plateau dans un <svg>. pick = { kind: 'settle'|'road'|'city'|'robber', list: [...] }
function renderBoard(svg, s, pick, onPick) {
  const g = geo(s.shape), f = n => n.toFixed(1), fog = s.phase === 'lobby';
  let h = '';
  g.hexes.forEach((hx, i) => {
    const t = s.tiles[i], pts = hx.verts.map(v => f(g.verts[v].x) + ',' + f(g.verts[v].y)).join(' ');
    if (fog || !t) { h += `<polygon class="hex fog" points="${pts}"/><text class="icon" x="${f(hx.x)}" y="${f(hx.y)}">?</text>`; return; }
    h += `<polygon class="hex ${t.res < 0 ? 'rd' : 'r' + t.res}" points="${pts}"/>`;
    h += `<text class="icon" x="${f(hx.x)}" y="${f(hx.y - 14)}">${t.res < 0 ? T.desert : T.icons[t.res]}</text>`;
    if (t.num) {
      h += `<circle class="tok" cx="${f(hx.x)}" cy="${f(hx.y + 20)}" r="15"/>`;
      h += `<text class="num${t.num === 6 || t.num === 8 ? ' hot' : ''}" x="${f(hx.x)}" y="${f(hx.y + 21)}">${t.num}</text>`;
    }
    if (i === s.robber) h += `<text class="robber" x="${f(hx.x + 26)}" y="${f(hx.y - 22)}">${T.robber}</text>`;
  });
  for (const e in s.roads) {
    const { a, b } = g.edges[e], A = g.verts[a], B = g.verts[b];
    h += `<line class="road" x1="${f(A.x)}" y1="${f(A.y)}" x2="${f(B.x)}" y2="${f(B.y)}" stroke="${s.players[s.roads[e]].color}"/>`;
  }
  for (const v in s.buildings) {
    const b = s.buildings[v], V = g.verts[v], c = s.players[b.p].color;
    h += `<path class="bld" fill="${c}" transform="translate(${f(V.x)},${f(V.y)})" d="${b.city ? 'M-13 10V-4L-5 -11L3 -4V-2H13V10Z' : 'M-8 8V-3L0 -10L8 -3V8Z'}"/>`;
  }
  if (pick) for (const i of pick.list) {
    if (pick.kind === 'road') {
      const { a, b } = g.edges[i], A = g.verts[a], B = g.verts[b], l = `x1="${f(A.x)}" y1="${f(A.y)}" x2="${f(B.x)}" y2="${f(B.y)}"`;
      h += `<g data-i="${i}"><line class="pick-hit" ${l}/><line class="pick" ${l}/></g>`;
    } else if (pick.kind === 'robber') {
      const hx = g.hexes[i];
      h += `<circle data-i="${i}" class="pick ring" cx="${f(hx.x)}" cy="${f(hx.y)}" r="34"/>`;
    } else {
      const V = g.verts[i];
      h += `<g data-i="${i}"><circle class="pick-hit" cx="${f(V.x)}" cy="${f(V.y)}" r="20"/><circle class="pick" cx="${f(V.x)}" cy="${f(V.y)}" r="10"/></g>`;
    }
  }
  svg.setAttribute('viewBox', g.box.map(f).join(' '));
  svg.innerHTML = h;
  svg.onclick = e => { const el = e.target.closest('[data-i]'); if (el && onPick && pick) onPick(pick.kind, +el.dataset.i); };
}

const H = { COST, COLORS, MAX_PLAYERS, WIN, T, SHAPES, geo, total, has, fmt, newGame, newBoard, setShape, addPlayer, removePlayer, start, finish, act, options, view, victims, vp, renderBoard, esc };
if (typeof module !== 'undefined') module.exports = H; else window.H = H;
})();
