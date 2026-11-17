// Manette (téléphone) : affiche la main privée du joueur et envoie ses actions à l'hôte.
const $ = id => document.getElementById(id);
const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
// pas de crypto.randomUUID : indisponible en http sur le réseau local
const myId = store('hexalia-id') || (Math.random().toString(36).slice(2) + Date.now().toString(36));
store('hexalia-id', myId);
const T = H.T, ZERO = () => [0, 0, 0, 0, 0];
let s = null, conn = null, peer = null, mode = null, sheet = null, done = false;
let offer = { give: ZERO(), want: ZERO() }, bank = { give: -1, get: -1 };

if (!room) { $('join').hidden = true; $('fatal').textContent = 'Lien invalide : scanne le QR code affiché sur l’écran.'; }
$('name').value = store('hexalia-name') || '';
$('join').onsubmit = e => {
  e.preventDefault();
  store('hexalia-name', $('name').value.trim().slice(0, 16));
  $('join').hidden = true; $('game').hidden = false;
  $('status').textContent = 'Connexion…';
  peer = new Peer();
  peer.on('open', connect);
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  peer.on('error', e => { if (!done) { $('status').textContent = e.type === 'peer-unavailable' ? 'Salle introuvable, nouvel essai…' : 'Problème réseau, nouvel essai…'; setTimeout(connect, 2500); } });
  wake();
};

function wake() { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {}); }

function connect() {
  if (done || (conn && conn.open) || !peer || peer.disconnected) return;
  conn = peer.connect('hexalia-' + room, { reliable: true });
  conn.on('open', () => conn.send({ t: 'join', id: myId, name: store('hexalia-name') || $('name').value }));
  conn.on('data', m => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'state') { s = m.s; render(); }
    if (m.t === 'err') { $('err').textContent = m.msg; setTimeout(() => { $('err').textContent = ''; }, 2500); }
    if (m.t === 'bye') { done = true; $('game').hidden = true; $('fatal').textContent = m.msg; peer.destroy(); }
  });
  conn.on('close', () => { if (!done) { $('status').textContent = 'Reconnexion…'; setTimeout(connect, 1500); } });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !peer || done) return;
  wake();
  if (peer.disconnected) peer.reconnect(); else connect();
});

const send = m => { mode = null; sheet = null; if (conn && conn.open) conn.send(Object.assign({ t: 'act' }, m)); };

function render() {
  const me = s.players[s.me], mine = s.turn === s.me && s.phase !== 'lobby';
  $('me-dot').style.background = me.color;
  $('me-name').textContent = me.name;
  $('me-vp').textContent = '⭐ ' + me.vp + ' / ' + H.WIN;

  let pick = null;
  if (mine && s.phase === 'setup') pick = s.sub === 'settle' ? 'settle' : 'road';
  else if (mine && s.sub === 'robber') pick = 'robber';
  else if (mine && s.sub === 'build') pick = mode;
  H.renderBoard($('board'), s, pick && { kind: pick, list: H.options(s, s.me, pick) },
    (kind, i) => send(kind === 'robber' ? { a: 'robber', h: i } : kind === 'road' ? { a: 'road', e: i } : { a: kind, v: i }));

  $('hand').innerHTML = me.hand.map((n, i) => `<div class="card">${T.icons[i]}<b>${n}</b><small>${T.res[i]}</small></div>`).join('');

  const cur = s.players[s.turn];
  $('status').textContent = s.phase === 'lobby' ? "En attente du lancement par l'hôte…"
    : s.phase === 'over' ? `🏆 ${s.players[s.winner].name} gagne !`
    : !mine ? `Tour de ${cur.name}`
    : s.phase === 'setup' ? (s.sub === 'settle' ? 'Place ta colonie (gratuite)' : 'Place une route à côté')
    : s.sub === 'roll' ? 'À toi ! Lance les dés'
    : s.sub === 'robber' ? `Déplace ${T.robberName}`
    : s.sub === 'steal' ? 'Choisis qui voler'
    : mode ? 'Touche un emplacement qui clignote' : 'Construis, échange ou passe';
  $('status').classList.toggle('mine', mine);
  $('panel').innerHTML = panel(me, mine);
}

const row = (label, cell) => `<div class="counter"><span>${label}</span>${[0, 1, 2, 3, 4].map(cell).join('')}</div>`;
const sel = on => on ? ' class="on"' : '';

function panel(me, mine) {
  const t = s.trade;
  let h = '';
  if (t && t.from !== s.me && s.phase === 'main') {
    h += `<div class="panel"><b>${H.esc(s.players[t.from].name)}</b> donne ${H.fmt(t.give)} contre ${H.fmt(t.want)}
      <p><button class="primary full" data-a="accept" ${H.has(me.hand, t.want) ? '' : 'disabled'}>Accepter</button></p></div>`;
  }
  if (!mine || s.phase !== 'main') return h;
  if (s.sub === 'roll') return h + '<button class="primary full big" data-a="roll">🎲 Lancer les dés</button>';
  if (s.sub === 'steal') return h + '<div class="actions">' + H.victims(s, s.me).map(p =>
    `<button data-a="steal" data-p="${p}">${H.esc(s.players[p].name)}</button>`).join('') + '</div>';
  if (s.sub !== 'build') return h;

  if (sheet === 'bank') return h + `<div class="panel"><p>Banque : 4 identiques → 1 au choix</p>
    ${row('Je donne 4', i => `<button data-bank="give" data-r="${i}" ${me.hand[i] < 4 ? 'disabled' : ''}${sel(bank.give === i)}>${T.icons[i]}</button>`)}
    ${row('Je reçois 1', i => `<button data-bank="get" data-r="${i}"${sel(bank.get === i)}>${T.icons[i]}</button>`)}
    <div class="actions"><button data-sheet="">Annuler</button><button class="primary" data-a="bank" ${bank.give < 0 || bank.get < 0 || bank.give === bank.get ? 'disabled' : ''}>Échanger</button></div></div>`;

  if (sheet === 'offer') return h + `<div class="panel"><p>Proposer aux autres (touche = +1)</p>
    ${row('Je donne', i => `<button data-off="give" data-r="${i}" ${offer.give[i] >= me.hand[i] ? 'disabled' : ''}>${T.icons[i]} ${offer.give[i] || ''}</button>`)}
    ${row('Je veux', i => `<button data-off="want" data-r="${i}">${T.icons[i]} ${offer.want[i] || ''}</button>`)}
    <div class="actions"><button data-reset>↺ Remettre à zéro</button><button data-sheet="">Annuler</button>
    <button class="primary wide" data-a="offer" ${H.total(offer.give) && H.total(offer.want) ? '' : 'disabled'}>Proposer</button></div></div>`;

  const can = c => H.has(me.hand, H.COST[c]);
  const b = (c, label) => `<button data-mode="${c}" ${can(c) ? '' : 'disabled'}${sel(mode === c)}>${label}<br><small>${H.fmt(H.COST[c])}</small></button>`;
  return h + `<div class="actions">
    ${b('road', 'Route')}${b('settle', 'Colonie')}${b('city', 'Ville')}
    <button data-sheet="bank">Banque 4:1</button>
    ${t && t.from === s.me ? '<button data-a="cancel">Retirer mon offre</button>' : '<button data-sheet="offer">Proposer un échange</button>'}
    <button class="primary" data-a="end">Fin du tour</button></div>`;
}

$('panel').onclick = e => {
  const el = e.target.closest('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.mode) { mode = mode === d.mode ? null : d.mode; return render(); }
  if (d.sheet !== undefined) { sheet = d.sheet || null; mode = null; bank = { give: -1, get: -1 }; return render(); }
  if (d.bank) { bank[d.bank] = +d.r; return render(); }
  if (d.off) { offer[d.off][+d.r]++; return render(); }
  if ('reset' in d) { offer = { give: ZERO(), want: ZERO() }; return render(); }
  if (d.a === 'steal') return send({ a: 'steal', p: +d.p });
  if (d.a === 'bank') return send({ a: 'bank', give: bank.give, get: bank.get });
  if (d.a === 'offer') { const o = offer; offer = { give: ZERO(), want: ZERO() }; return send({ a: 'offer', give: o.give, want: o.want }); }
  if (d.a) send({ a: d.a });
};
