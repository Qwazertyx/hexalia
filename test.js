// node test.js — moteur de règles : géométrie, toutes les formes, parties simulées, entrées malveillantes.
const H = require('./game.js'), assert = require('assert');
const play = (shape, n) => {
  const s = H.newGame(); H.setShape(s, shape);
  for (let i = 0; i < n; i++) H.addPlayer(s, 'id' + i, 'J' + i);
  assert.strictEqual(H.start(s), undefined);
  return s;
};

// 1. géométrie et répartition de chaque forme
const g = H.geo('classique');
assert.deepStrictEqual([g.hexes.length, g.verts.length, g.edges.length], [19, 54, 72]);
for (const [k, sh] of Object.entries(H.SHAPES)) {
  const keys = sh.cells.map(c => c.join(','));
  assert.strictEqual(new Set(keys).size, keys.length, k + ' : cases en double');
  for (let run = 0; run < 20; run++) {
    const s = play(k, 2), t = s.tiles;
    assert.strictEqual(t.length, sh.cells.length);
    assert.ok(t.filter(x => x.res < 0).length >= 1 && s.tiles[s.robber].res < 0, k + ' : désert + brigand');
    assert.ok(t.every(x => (x.res < 0) === (x.num === 0)), k + ' : seul le désert est sans numéro');
    for (let r = 0; r < 5; r++) assert.ok(t.some(x => x.res === r), k + ' : chaque ressource existe');
    if (k === 'classique') assert.ok(t.every((x, i) => ![6, 8].includes(x.num) || H.geo(k).hexes[i].nb.every(j => ![6, 8].includes(t[j].num))), '6/8 voisins');
  }
}
assert.strictEqual(new Set(Array.from({ length: 10 }, () => JSON.stringify(play('classique', 2).tiles))).size > 1, true, 'carte aléatoire');

// 2. placement initial dans l'ordre serpent + mains cachées
const s = play('classique', 3);
const order = [];
while (s.phase === 'setup') {
  const pi = s.turn; order.push(pi);
  assert.strictEqual(H.act(s, pi, { a: 'settle', v: H.options(s, pi, 'settle')[0] }), undefined);
  assert.strictEqual(H.act(s, pi, { a: 'road', e: H.options(s, pi, 'road')[0] }), undefined);
}
assert.deepStrictEqual(order, [0, 1, 2, 2, 1, 0]);
const v0 = H.view(s, 0);
assert.ok(v0.players[0].hand && v0.players[1].hand === null && v0.players.every(p => p.id === undefined), 'vue privée');

// 3. entrées malveillantes : jamais d'exception, toujours un refus, état intact
s.sub = 'build';
s.players[0].hand = [5, 5, 5, 5, 5];
const before = JSON.stringify(s);
const evil = [null, undefined, 1, 'x', {}, { a: 1 }, { a: 'nope' }, { a: '__proto__' }, { a: 'constructor' },
  { a: 'road', e: -1 }, { a: 'road', e: 1.5 }, { a: 'road', e: '3' }, { a: 'road', e: 1e9 }, { a: 'settle', v: '__proto__' }, { a: 'city', v: +Object.keys(s.buildings).find(v => s.buildings[v].p === 1) },
  { a: 'bank', give: 0, get: 0 }, { a: 'bank', give: '0', get: 1 }, { a: 'bank', give: 9, get: 1 },
  { a: 'offer', give: [-1, 0, 0, 0, 0], want: [1, 0, 0, 0, 0] }, { a: 'offer', give: [1, 0, 0, 0], want: [1, 0, 0, 0, 0] },
  { a: 'offer', give: [0.5, 0, 0, 0, 0], want: [1, 0, 0, 0, 0] }, { a: 'offer', give: [99, 0, 0, 0, 0], want: [1, 0, 0, 0, 0] },
  { a: 'offer', give: { length: 5 }, want: [1, 0, 0, 0, 0] }, { a: 'robber', h: 0 }, { a: 'steal', p: 1 }, { a: 'roll' }, { a: 'accept' }];
for (const m of evil) assert.ok(H.act(s, 0, m), 'doit refuser ' + JSON.stringify(m));
for (const pi of [-1, 7, '0', 1]) assert.ok(H.act(s, pi, { a: 'end' }), 'joueur invalide ou hors tour : ' + pi);
assert.strictEqual(JSON.stringify(s), before, 'aucun refus ne modifie l’état');
assert.strictEqual(Object.prototype.polluted, undefined);
H.setShape(s, '__proto__'); H.setShape(s, 'toString'); assert.strictEqual(s.shape, 'classique');

// 4. échange entre joueurs (et offre modifiée après coup impossible)
s.players[0].hand = [2, 0, 0, 0, 0]; s.players[1].hand = [0, 3, 0, 0, 0];
const give = [1, 0, 0, 0, 0];
assert.strictEqual(H.act(s, 0, { a: 'offer', give, want: [0, 2, 0, 0, 0] }), undefined);
give[0] = 0;
assert.ok(H.act(s, 0, { a: 'accept' }), "on n'accepte pas sa propre offre");
assert.strictEqual(H.act(s, 1, { a: 'accept' }), undefined);
assert.deepStrictEqual([s.players[0].hand, s.players[1].hand], [[1, 2, 0, 0, 0], [1, 1, 0, 0, 0]]);
s.sub = 'roll';

// 5. lobby : expulsion, partie pleine, pas d'arrivée en cours de partie
const l = H.newGame();
['a', 'b', 'c', 'd'].forEach(id => H.addPlayer(l, id, id));
assert.strictEqual(H.addPlayer(l, 'e', 'e'), -1);
assert.ok(H.removePlayer(l, 1) && l.players.map(p => p.id).join('') === 'acd' && l.players[1].color === H.COLORS[1]);
H.start(l);
assert.strictEqual(H.addPlayer(l, 'z', 'z'), -1);
assert.ok(!H.removePlayer(l, 0));

// 6. parties complètes simulées sur chaque forme, 1 à 4 joueurs
for (const k of Object.keys(H.SHAPES)) for (let n = 1; n <= 4; n++) {
  const s = play(k, n);
  while (s.phase === 'setup') {
    const pi = s.turn;
    const o = H.options(s, pi, 'settle'); // placement aléatoire : tout prendre au même endroit peut saturer une petite île
    assert.strictEqual(H.act(s, pi, { a: 'settle', v: o[Math.floor(Math.random() * o.length)] }), undefined, k + ' setup');
    assert.strictEqual(H.act(s, pi, { a: 'road', e: H.options(s, pi, 'road')[0] }), undefined);
  }
  let turns = 0;
  while (s.phase === 'main' && turns++ < 2000) {
    const pi = s.turn, p = s.players[pi];
    assert.strictEqual(H.act(s, pi, { a: 'roll' }), undefined);
    if (s.sub === 'robber') H.act(s, pi, { a: 'robber', h: H.options(s, pi, 'robber')[0] });
    if (s.sub === 'steal') H.act(s, pi, { a: 'steal', p: H.victims(s, pi)[0] });
    assert.strictEqual(s.sub, 'build');
    p.hand = p.hand.map(x => x + 2);
    for (const c of ['city', 'settle', 'road']) {
      const o = H.options(s, pi, c);
      if (o.length && H.has(p.hand, H.COST[c])) assert.strictEqual(H.act(s, pi, { a: c, [c === 'road' ? 'e' : 'v']: o[0] }), undefined);
      if (s.phase === 'over') break;
    }
    if (s.phase === 'main') H.act(s, pi, { a: 'end' });
  }
  assert.strictEqual(s.phase, 'over', `${k} à ${n} : la partie doit finir`);
  assert.ok(H.vp(s, s.winner) >= H.WIN);
}
const f = play('classique', 2); H.finish(f); assert.strictEqual(f.phase, 'over'); assert.ok(f.winner === 0);
console.log('ok — toutes les formes, 1 à 4 joueurs, entrées malveillantes refusées');
