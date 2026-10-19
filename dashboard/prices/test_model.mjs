import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate, baseForSeller, estimatePlatformDiscount, createSeed,
  loadStore, saveStore, previewChanges, commitChanges, rollbackChanges, canRollback,
} from './model.js';
import { PRODUCTS } from '../data.js';

const fixture = (extra = {}) => ({
  ...createSeed(PRODUCTS).products[0], base: 1000, discount: 0, club: 0, spp: 20,
  commission: 20, options: 2, acquiring: 1, tax: 6,
  cost: 400, packaging: 20, logistics: 100, reverseLogistics: 50,
  buyout: 50, storage: 10, ads: 50, other: 20, target: 15, floor: 0,
  ...extra,
});
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const memory = () => ({ value: null, getItem() { return this.value; }, setItem(key, value) { this.value = value; } });

test('seller discounts apply sequentially; platform discount does not change profit', () => {
  const p = fixture({ base: 2000, discount: 20, club: 10 });
  const r = calculate(p);
  assert.equal(r.afterDiscount, 1600);
  assert.equal(r.seller, 1440);
  assert.equal(r.buyer, 1152);
  assert.equal(r.profit, calculate({ ...p, spp: 0 }).profit);
  assert.equal(r.safe, calculate({ ...p, spp: 50 }).safe);
});

test('failed orders add outbound and reverse shipping to a completed sale', () => {
  const r = calculate(fixture());
  assert.equal(r.expectedLogistics, 250); // Two shipments at 100, one return at 50.
  assert.equal(r.costs, 750);
  approx(r.profit, -40);
  approx(r.margin, -4);
  assert.equal(r.status, 'loss');
  assert.equal(r.breakEven, 1057);
  assert.equal(r.safe, 1340);
  assert.equal(calculate(fixture({ buyout: 100 })).expectedLogistics, 100);
});

test('target is margin on revenue, not markup on cost, with stable rounding', () => {
  const r = calculate(fixture({ base: 500, commission: 30, options: 0, acquiring: 0, tax: 10, cost: 100, packaging: 0, logistics: 0, reverseLogistics: 0, storage: 0, ads: 0, other: 0, target: 20 }));
  assert.equal(r.safe, 250);
  approx(r.profit, 200);
});

test('unreachable targets never produce negative or infinite recommended prices', () => {
  const r = calculate(fixture({ commission: 80, tax: 10, target: 20 }));
  assert.equal(r.valid, true);
  assert.equal(r.safe, null);
  const impossible = calculate(fixture({ commission: 80, options: 25 }));
  assert.equal(impossible.breakEven, null);
  assert.equal(impossible.safe, null);
});

test('manual minimum and target price remain distinct', () => {
  const r = calculate(fixture({ floor: 1800, base: 1600 }));
  assert.equal(r.safe, 1340);
  assert.equal(r.threshold, 1800);
  assert.equal(r.status, 'risk');
});

test('bad inputs, unknown tariffs, invalid club rates and overflow are rejected', () => {
  for (const patch of [{ base: 0 }, { cost: -1 }, { spp: 100 }, { buyout: 0 }, { buyout: 101 }, { commission: '' }, { cost: NaN }, { model: 'unknown' }, { club: 2 }, { club: 32 }, { floor: 10.5 }, { cost: Number.MAX_VALUE, packaging: Number.MAX_VALUE }]) {
    assert.equal(calculate(fixture(patch)).valid, false, JSON.stringify(patch));
  }
});

test('base recommendation respects both seller discounts and the target floor', () => {
  for (const discount of [0, 17, 30, 90]) for (const club of [0, 3, 10, 31]) {
    const p = fixture({ discount, club });
    const base = baseForSeller(1340, p);
    assert.ok(calculate({ ...p, base }).seller >= 1340);
    assert.ok(calculate({ ...p, base: base - 1 }).seller < 1340);
  }
});

test('SPP estimation rejects incomparable numeric prices and accepts a zero discount', () => {
  approx(estimatePlatformDiscount(2000, 1500), 25);
  assert.equal(estimatePlatformDiscount(1000, 1000), 0);
  for (const [seller, buyer] of [[0, 100], [100, 0], [100, 101], [NaN, 1], [100, '50']]) assert.equal(estimatePlatformDiscount(seller, buyer), null);
});

test('bulk saves are atomic, revision checked and immutable', () => {
  const store = createSeed(PRODUCTS);
  const original = JSON.stringify(store);
  const first = store.products[0], second = store.products[1];
  const changes = [{ id: first.id, revision: first.revision, patch: { base: 9000 } }, { id: second.id, revision: second.revision, patch: { base: -1 } }];
  assert.throws(() => commitChanges(store, changes, 'bulk', true));
  assert.equal(JSON.stringify(store), original);
  assert.throws(() => previewChanges(store, [{ id: first.id, revision: 0, patch: { base: 9000 } }]));
  assert.throws(() => previewChanges(store, [changes[0], changes[0]]));
  const saved = commitChanges(store, changes.slice(0, 1), 'one', true);
  assert.equal(saved.products[0].base, 9000);
  assert.equal(saved.products[0].revision, 2);
  assert.equal(JSON.stringify(store), original);
});

test('risky prices require deliberate acknowledgement', () => {
  const store = createSeed(PRODUCTS), p = store.products[0];
  const changes = [{ id: p.id, revision: p.revision, patch: { base: 100 } }];
  assert.throws(() => commitChanges(store, changes, 'loss'));
  const saved = commitChanges(store, changes, 'loss', true);
  assert.equal(calculate(saved.products[0]).status, 'loss');
});

test('history restores full parameters; a stale rollback cannot overwrite newer edits', () => {
  const store = createSeed(PRODUCTS), p = store.products[0];
  const saved = commitChanges(store, [{ id: p.id, revision: 1, patch: { base: 10000, tax: 8, spp: 25, floor: 7000, blockAuto: false } }], 'change', true);
  const entry = saved.history[0];
  assert.equal(canRollback(saved, entry), true);
  const restored = rollbackChanges(saved, entry.id);
  for (const key of ['base', 'tax', 'spp', 'floor', 'blockAuto']) assert.equal(restored.products[0][key], p[key]);
  assert.equal(restored.products[0].revision, 3);
  assert.equal(restored.history[0].kind, 'rollback');
  assert.equal(restored.history[1].rolledBack, true);
  assert.throws(() => rollbackChanges(restored, entry.id));
  const newer = commitChanges(saved, [{ id: p.id, revision: 2, patch: { base: 11000 } }], 'newer', true);
  assert.equal(canRollback(newer, entry), false);
  assert.throws(() => rollbackChanges(newer, entry.id));
});

test('saved state survives reload; corrupt state and storage failures stay explicit', () => {
  const seed = createSeed(PRODUCTS), storage = memory();
  const saved = commitChanges(seed, [{ id: seed.products[0].id, revision: 1, patch: { base: 9000 } }], 'persist', true);
  saveStore(saved, storage);
  const loaded = loadStore(seed, storage);
  assert.equal(loaded.data.products[0].base, 9000);
  assert.equal(loaded.data.history.length, 1);
  storage.value = '{broken';
  assert.ok(loadStore(seed, storage).warning);
  assert.equal(loadStore(seed, storage).data.products[0].base, seed.products[0].base);
  assert.throws(() => saveStore(saved, { setItem() { throw new Error('quota'); } }), /не сохранил/);
  assert.ok(loadStore(seed, null).warning);
});
