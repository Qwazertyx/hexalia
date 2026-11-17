// Écran partagé (TV/PC) : héberge la partie et relaie l'état aux téléphones via PeerJS.
const $ = id => document.getElementById(id);
const SAVE = 'hexalia-host';
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; } };
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify({ code, s })); } catch (e) { /* stockage indisponible : la partie ne survivra pas à un rechargement */ } };

const saved = load();
let s = saved && saved.s && saved.s.players ? saved.s : H.newGame();
let code = saved && /^[A-Z]{5}$/.test(saved.code) ? saved.code : null;
let conns = new Map(); // index joueur -> connexion
let peer, retries = 0;

const newCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');

function openRoom() {
  code = code || newCode();
  peer = new Peer('hexalia-' + code);
  peer.on('open', () => {
    retries = 0;
    $('code').textContent = code;
    const url = new URL('play.html?room=' + code, location.href).href;
    $('qr').innerHTML = '';
    new QRCode($('qr'), { text: url, width: 220, height: 220 });
    $('url').textContent = url;
    $('lan').hidden = !/^(localhost|127\.|\[::1\])/.test(location.hostname);
    save();
  });
  peer.on('error', e => {
    if (e.type !== 'unavailable-id') return console.warn('PeerJS', e.type);
    peer.destroy();
    // après un rechargement, l'ancien identifiant reste réservé quelques secondes : on réessaie avant d'en changer
    if (++retries > 10) code = null;
    setTimeout(openRoom, code ? 3000 : 0);
  });
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  peer.on('connection', conn => {
    conn.budget = 30;
    const refill = setInterval(() => { conn.budget = 30; }, 1000);
    conn.on('data', m => onMsg(conn, m));
    conn.on('close', () => { clearInterval(refill); if (conns.get(conn.pi) === conn) conns.delete(conn.pi); render(); });
  });
}

function onMsg(conn, m) {
  if (--conn.budget < 0 || !m || typeof m !== 'object') return; // anti-flood : 30 messages/s par téléphone
  if (m.t === 'join' && conn.pi === undefined) {
    const id = String(m.id || '').slice(0, 40), name = String(m.name || '').trim().slice(0, 16) || 'Joueur';
    if (!id) return;
    let pi = s.players.findIndex(p => p.id === id);
    if (pi < 0) pi = H.addPlayer(s, id, name);
    if (pi < 0) return bye(conn, s.phase === 'lobby' ? 'La partie est pleine.' : 'La partie a déjà commencé.');
    const old = conns.get(pi);
    if (old && old !== conn) old.close();
    conns.set(pi, conn);
    conn.pi = pi;
    return sync();
  }
  if (m.t === 'act' && conn.pi !== undefined && conns.get(conn.pi) === conn) {
    const err = H.act(s, conn.pi, m);
    if (err) conn.send({ t: 'err', msg: err });
    sync();
  }
}

function bye(conn, msg) { conn.send({ t: 'bye', msg }); setTimeout(() => conn.close(), 300); }

function sync() {
  for (const [pi, c] of conns) if (c.open) c.send({ t: 'state', s: H.view(s, pi) });
  save();
  render();
}

function kick(k) {
  const c = conns.get(k);
  if (!H.removePlayer(s, k)) return;
  if (c) bye(c, "L'hôte t'a retiré de la partie.");
  const next = new Map();
  for (const [pi, cn] of conns) if (pi !== k) { cn.pi = pi > k ? pi - 1 : pi; next.set(cn.pi, cn); }
  conns = next;
  sync();
}

function shapeIcon(k) {
  const g = H.geo(k);
  return `<svg viewBox="${g.box.join(' ')}">${g.hexes.map(hx => `<polygon points="${hx.verts.map(v => g.verts[v].x.toFixed(0) + ',' + g.verts[v].y.toFixed(0)).join(' ')}"/>`).join('')}</svg>`;
}

function render() {
  H.renderBoard($('board'), s);
  const lobby = s.phase === 'lobby';
  $('lobby').hidden = !lobby;
  $('shapes').innerHTML = Object.entries(H.SHAPES).map(([k, sh]) =>
    `<button data-k="${k}" class="${k === s.shape ? 'on' : ''}">${shapeIcon(k)}
      <span><b>${sh.label}</b> <em class="tag ${sh.tag}">${sh.tag}</em><br><small>${sh.pitch} · ${sh.cells.length} cases</small></span></button>`).join('');
  const v = H.view(s, -1);
  $('players').innerHTML = v.players.length ? v.players.map((p, i) =>
    `<div class="player ${!lobby && i === s.turn ? 'turn' : ''} ${conns.has(i) ? '' : 'off'}">
      <span class="dot" style="background:${p.color}"></span>${H.esc(p.name)}
      <span class="muted push">🂠 ${p.cards} · ⭐ ${p.vp}</span>
      ${lobby ? `<button class="mini" data-kick="${i}" aria-label="Retirer ${H.esc(p.name)}">✕</button>` : ''}</div>`).join('')
    : '<span class="muted">En attente de joueurs…</span>';
  $('dice').hidden = !s.dice;
  if (s.dice) $('dice').textContent = '🎲 ' + s.dice[0] + ' + ' + s.dice[1] + ' = ' + (s.dice[0] + s.dice[1]);
  $('trade').hidden = !s.trade;
  if (s.trade) $('trade').innerHTML = `<b>${H.esc(s.players[s.trade.from].name)}</b> propose ${H.fmt(s.trade.give)} contre ${H.fmt(s.trade.want)}`;
  $('log').innerHTML = s.log.map(l => `<li>${H.esc(l)}</li>`).join('');
  $('newgame').hidden = lobby;
  $('finish').hidden = s.phase !== 'setup' && s.phase !== 'main';
}

$('shapes').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { H.setShape(s, b.dataset.k); sync(); } };
$('players').onclick = e => { const b = e.target.closest('[data-kick]'); if (b) kick(+b.dataset.kick); };
$('start').onclick = () => { const err = H.start(s); if (err) alert(err); sync(); };
$('finish').onclick = () => { if (confirm('Arrêter la partie ? Le meilleur score gagne.')) { H.finish(s); sync(); } };
$('newgame').onclick = () => {
  if (!confirm('Abandonner la partie en cours et revenir au lobby ?')) return;
  const players = s.players, shape = s.shape;
  s = H.newGame();
  s.shape = shape;
  players.forEach(p => H.addPlayer(s, p.id, p.name)); // on garde les mêmes joueurs, connexions comprises
  sync();
};

openRoom();
render();
