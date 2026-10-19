import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate, baseForSeller, estimatePlatformDiscount, createSeed,
  loadStore, saveStore, previewChanges, commitChanges, rollbackChanges, canRollback, priceScenario, reconcile,
} from './model.js';
import { SUBJECTS, COMMISSION_SNAPSHOT, tariffFor, withTariff, volumeTariff } from './tariffs.js';
import { PRODUCTS } from '../data.js';
import { readFileSync } from 'node:fs';

const fixture = (extra = {}) => ({
  ...createSeed(PRODUCTS).products[0], base: 1000, discount: 0, club: 0, spp: 20,
  commission: 20, commissionSource: 'manual', options: 2, acquiring: 1, tax: 6, packagingUnit: 'retained',
  cost: 400, packaging: 20, logistics: 100, reverseLogistics: 50,
  buyout: 50, storage: 10, ads: 50, other: 20, target: 15, floor: 0,
  ...extra,
});
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const memory = () => ({ value: null, getItem() { return this.value; }, setItem(key, value) { this.value = value; } });
const clean = extra => fixture({ base: 2000, discount: 0, club: 0, spp: 0, commission: 25, options: 0, acquiring: 2, tax: 6, cost: 700, packaging: 0, logistics: 0, reverseLogistics: 0, returnLogistics: 0, storage: 0, ads: 0, other: 0, buyout: 100, ...extra });

test('seller discounts apply sequentially; SPP does not change seller-based deductions', () => {
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

test('official subject/model rates match the independently extracted, dated PDF evidence', () => {
  const evidence = JSON.parse(readFileSync(new URL('./research-evidence.json', import.meta.url), 'utf8')).commission_snapshot;
  assert.equal(COMMISSION_SNAPSHOT.sha256, evidence.sha256);
  assert.equal(COMMISSION_SNAPSHOT.effectiveFrom, evidence.effectiveFromPrinted);
  assert.equal(SUBJECTS.length, 14);
  for (const row of SUBJECTS) {
    const source = evidence.rows.find(item => item.subject === row.subject && item.parent === row.parent);
    assert.ok(source, row.subject);
    for (const model of ['FBW', 'FBS', 'DBS']) assert.equal(row[model], source[model === 'DBS' ? 'DBS_DBW' : model]);
    assert.equal(row.page, source.page);
  }
  const seed = createSeed(PRODUCTS);
  assert.equal(seed.products[0].commission, 43.5);
  assert.equal(seed.products.find(p => p.id === 'p12').commission, 41.5);
  assert.equal(seed.products.find(p => p.id === 'p11').subject, 'Топы');
  assert.equal(withTariff(seed.products[0], { model: 'FBS' }).commission, 48);
  assert.equal(tariffFor('Неизвестный предмет', 'FBW'), null);
  assert.equal(calculate({ ...seed.products[0], commission: 20 }).valid, false);
  assert.ok(calculate(seed.products[0]).profit < 0);
});

test('SPP affects only deductions whose declared basis is buyer price; report rubles bypass rates', () => {
  approx(calculate(clean()).profit, 640);
  approx(calculate(clean({ spp: 20 })).profit, 640);
  approx(calculate(clean({ spp: 20, taxBasis: 'buyer' })).profit, 664);
  const split = calculate(clean({ spp: 20, commissionBasis: 'buyer', acquiringBasis: 'buyer' }));
  approx(split.commissionCost, 400);
  approx(split.acquiringCost, 32);
  approx(split.taxCost, 120);
  approx(split.profit, 748);
  const fixed = clean({ commissionBasis: 'fixed', commissionFixed: 300, optionsBasis: 'fixed', optionsFixed: 20, acquiringBasis: 'fixed', acquiringFixed: 40, taxProfile: 'manual', taxFixed: 100 });
  approx(calculate(fixed).profit, 840);
  approx(calculate({ ...fixed, spp: 40 }).profit, 840);
});

test('cancellations, non-buyout and post-buyout returns allocate different events without repurchasing stock', () => {
  const p = clean({ buyout: 50, returnRate: 20, cancelRate: 20, cost: 400, packaging: 20, packagingUnit: 'dispatch', logistics: 100, reverseLogistics: 50, returnLogistics: 50, returnLoss: 80, ads: 10, adsUnit: 'order', storage: 2, storageUnit: 'day', storageDays: 5, other: 100, otherUnit: 'period', periodSales: 20 });
  const r = calculate(p);
  approx(r.dispatches, 2.5);
  approx(r.orders, 3.125);
  approx(r.failedReturns, 1.25);
  approx(r.postReturns, 0.25);
  approx(r.packagingCost, 50);
  approx(r.expectedLogistics, 325);
  approx(r.returnLossCost, 20);
  approx(r.costs, 841.25);
  approx(calculate({ ...p, cancelRate: 0 }).expectedLogistics, r.expectedLogistics);
  approx(calculate({ ...p, returnLoss: 0 }).costs, r.costs - 20);
  assert.equal(calculate({ ...p, returnRate: 100 }).valid, false);
});

test('period costs divide once; volume condition compares contribution before fixed period costs', () => {
  const p = clean({ commission: 30, acquiring: 0, tax: 0, other: 10000, otherUnit: 'period', periodSales: 100 });
  const r = calculate(p), scenario = priceScenario(p, -10);
  approx(r.otherCost, 100);
  approx(r.profit, 600);
  approx(r.contribution, 700);
  approx(scenario.result.profit, 460);
  approx(scenario.requiredVolume, 1.25);
  assert.equal(priceScenario(p, -100), null);
  assert.equal(calculate({ ...p, periodSales: 0 }).valid, false);
});

test('new-supply logistics uses fractional volume and applies 170% only to the forward tariff', () => {
  for (const [liters, value] of [[0.00001, 23], [0.2, 23], [0.201, 26], [0.4, 26], [0.6, 29], [0.8, 30], [1, 32], [1.8, 57.2]]) assert.equal(volumeTariff(liters), value);
  const p = clean({ logisticsSource: 'newFbw', liters: 1.8, supplyDate: '2026-10-19', buyout: 50 });
  const r = calculate(p);
  approx(r.forward, 97.24);
  approx(r.reverse, 57.2);
  approx(r.expectedLogistics, 251.68);
  assert.equal(calculate({ ...p, supplyDate: '2026-08-14' }).valid, false);
  assert.equal(calculate({ ...p, supplyDate: '2026-02-30' }).valid, false);
  assert.equal(calculate({ ...p, model: 'FBS' }).valid, false);
});

test('VAT is extracted from gross price; input deduction and income tax are separate', () => {
  const p = clean({ base: 1220, cost: 610, commission: 0, acquiring: 0, vatRate: 22, vatDeductible: true, inputVat: 110 });
  const r = calculate(p);
  approx(r.outputVat, 220);
  approx(r.netRevenue, 1000);
  approx(r.vatCost, 110);
  approx(r.taxCost, 60);
  approx(r.profit, 440);
  approx(calculate({ ...p, inputVat: 0, vatDeductible: false }).profit, 330);
  approx(calculate({ ...p, inputVat: 0, vatDeductible: false, taxProfile: 'profit', tax: 15, deductibleCosts: 500 }).profit, 315);
  assert.equal(calculate({ ...p, vatRate: 5 }).valid, false);
  assert.equal(calculate({ ...p, vatDeductible: false }).valid, false);
  assert.equal(calculate({ ...p, inputVat: 611 }).valid, false);
});

test('target solver handles distinct bases, VAT, tax kinks and incompatible manual minimums', () => {
  const variants = [clean({ spp: 25, commissionBasis: 'buyer', taxBasis: 'buyer', target: 17 }), clean({ vatRate: 22, vatDeductible: true, inputVat: 100, target: 20 }), clean({ taxProfile: 'profit', tax: 15, deductibleCosts: 500, target: 15 })];
  for (const p of variants) {
    const r = calculate(p);
    assert.ok(r.safe > 1);
    assert.ok(calculate({ ...p, base: r.safe }).margin >= p.target - 1e-7);
    assert.ok(calculate({ ...p, base: r.safe - 1 }).margin < p.target);
  }
  const peaked = clean({ commission: 20, acquiring: 0, cost: 100, taxProfile: 'profit', tax: 90, deductibleCosts: 10000, target: 50 });
  assert.equal(calculate(peaked).safe, 334);
  assert.equal(calculate({ ...peaked, floor: 20000 }).threshold, null);
  assert.throws(() => baseForSeller(1e9, { ...peaked, discount: 50 }), /1 млрд/);
});

test('manual reconciliation uses totals for one completed cohort, before WB deductions', () => {
  const p = clean();
  const actual = { from: '2026-09-01', to: '2026-09-30', source: 'Отчёт 123 + затраты', units: 10, closed: true, revenue: 20000, commission: 5000, acquiring: 400, logistics: 0, storage: 0, ads: 0, tax: 1200, vat: 0, costs: 7000 };
  const r = reconcile(p, actual);
  assert.equal(r.valid, true);
  approx(r.profit, 640);
  approx(r.delta, 0);
  assert.ok(r.rows.every(row => Math.abs(row.delta) < 1e-7));
  approx(reconcile(p, { ...actual, commission: 5100 }).delta, -10);
  approx(reconcile(p, { ...actual, vat: -100 }).profit, 650);
  for (const patch of [{ closed: false }, { units: 0 }, { source: '' }, { from: '2026-02-30' }, { to: '2026-08-01' }, { revenue: '' }]) assert.equal(reconcile(p, { ...actual, ...patch }).valid, false);
});

test('schema 1 migration preserves legacy commissions, unit assumptions, revisions and rollback history', () => {
  const seed = createSeed(PRODUCTS), storage = memory();
  const oldKeys = ['id', 'revision', 'base', 'discount', 'club', 'spp', 'commission', 'options', 'acquiring', 'tax', 'cost', 'packaging', 'logistics', 'reverseLogistics', 'buyout', 'storage', 'ads', 'other', 'target', 'floor', 'model', 'blockAuto'];
  const products = seed.products.map(p => Object.fromEntries(oldKeys.map(key => [key, p[key]])));
  products[0].commission = 24.5;
  const before = { ...products[0] };
  products[0] = { ...before, base: 9000, revision: 2 };
  storage.value = JSON.stringify({ schema: 1, products, history: [{ id: 'old', title: 'Старая цена', at: '2026-10-18T12:00:00Z', kind: 'change', changes: [{ id: before.id, before, after: products[0] }] }] });
  const loaded = loadStore(seed, storage);
  assert.ok(loaded.warning.includes('перенесён'));
  assert.equal(loaded.data.schema, 2);
  assert.equal(loaded.data.products[0].commissionSource, 'manual');
  assert.equal(loaded.data.products[0].commission, 24.5);
  assert.equal(loaded.data.products[0].packagingUnit, 'retained');
  assert.equal(loaded.data.history.length, 1);
  const restored = rollbackChanges(loaded.data, 'old');
  assert.equal(restored.products[0].base, 4130);
  approx(calculate(restored.products[0]).profit, 2891 * 0.68 - (940 + 25 + (92 + 0.66 * 50) / 0.34 + 18 + 105));
  saveStore(restored, storage);
  assert.equal(loadStore(seed, storage).warning, '');
});
