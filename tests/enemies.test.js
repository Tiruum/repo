const test = require("node:test");
const assert = require("node:assert/strict");
const { ENEMIES, SETUPS, enemyPool, setupLabel } = require("../enemies.js");

test("every enemy is complete", () => {
  assert.equal(Object.keys(ENEMIES).length, 29);
  for (const [id, e] of Object.entries(ENEMIES)) {
    assert.ok(e.name && [1, 2, 3].includes(e.tier) && e.hp > 0, id);
    assert.ok(Array.isArray(e.dmg) && typeof e.desc === "string", id);
    assert.ok(e.icon.includes("<"), id);
  }
});

test("setups reference known enemies with the right tier", () => {
  const ids = new Set();
  for (const s of SETUPS) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`); ids.add(s.id);
    for (const [id, n] of s.members) { assert.ok(ENEMIES[id], `${s.id}: ${id}`); assert.ok(n >= 1); }
    if (!s.group) assert.equal(ENEMIES[s.members[0][0]].tier, s.tier, s.id);
  }
});

test("pools per tier and level", () => {
  assert.equal(enemyPool(1, 1, false).length, 9);
  assert.equal(enemyPool(2, 1, false).length, 12);
  assert.equal(enemyPool(3, 1, false).length, 7);       // no Loom before level 3
  assert.equal(enemyPool(3, 3, false).length, 8);
  assert.equal(enemyPool(3, 3, true).length, 29);       // + 21 groups on levels 1-3
  assert.equal(enemyPool(3, 4, true).length, 8);
  assert.equal(enemyPool(1, 1, true).length, 9);
});

test("gnomes and bangers come in packs", () => {
  assert.deepEqual(SETUPS.find(s => s.id === "gnome").members, [["gnome", 4]]);
  assert.deepEqual(SETUPS.find(s => s.id === "banger").members, [["banger", 3]]);
  assert.equal(setupLabel(SETUPS.find(s => s.id === "gnome")), "Gnome ×4");
  assert.equal(setupLabel(SETUPS.find(s => s.id === "g-gnome")), "Группа: 10 × Gnome");
  assert.equal(setupLabel(SETUPS.find(s => s.id === "robe")), "Robe");
});

