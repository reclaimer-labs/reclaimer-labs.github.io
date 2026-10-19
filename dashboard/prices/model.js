import { COMMISSION_SNAPSHOT, SUBJECTS, tariffFor, withTariff, LOGISTICS_SNAPSHOT, volumeTariff } from './tariffs.js';

export const STORAGE_KEY = 'marginpilot.prices.v1'; // Stable key; schema 1 is migrated explicitly.
export const CHECKED_ON = '19.10.2026';
export const SOURCES = [
  { title: 'Цены и скидки продавца', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/how-to-set-price-and-discount', text: 'Основная скидка и скидка Клуба последовательно уменьшают цену продавца.' },
  { title: 'Скидка WB (СПП)', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/wb-discount', text: 'WB финансирует скидку. Базы отдельных удержаний сверяют с отчётом; второй раз вычитать СПП нельзя.' },
  { title: 'Официальный снимок комиссий', url: COMMISSION_SNAPSHOT.url, text: 'PDF с датой действия 24.08.2026. Предмет, модель и индивидуальные условия проверяют отдельно.' },
  { title: 'Скидка WB Клуба', url: 'https://seller.wildberries.ru/instructions/en/ru/material/wb-club-discount', text: 'Скидка за счёт продавца: 0 для отключения или целое число от 3 до 31%.' },
  { title: 'Минимальная цена и автоакции', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/how-to-set-minimal-price-and-block-auto-promotions', text: 'Минимум и блокировка ограничивают автоматическое снижение в автоакциях.' },
  { title: 'Детализация отчёта реализации', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/how-to-read-fimancial-reports-detalization', text: 'Для сверки нужны суммы фактических удержаний и компенсаций, а не только проценты.' },
  { title: 'Логистика и объём', url: LOGISTICS_SNAPSHOT.url, text: 'Новая поставка FBW: прямой тариф и обратная доставка имеют разные коэффициенты.' },
  { title: 'НДС при УСН · ФНС', url: 'https://www.nalog.gov.ru/rn77/taxation/taxes/nds_usn/', text: 'УСН сама по себе не означает освобождение от НДС. Ставка и право на вычеты зависят от условий.' },
];
export const BASE_LABELS = { seller: 'Цена продавца', buyer: 'Цена покупателя', fixed: 'Сумма в рублях' };
export const UNIT_LABELS = { retained: 'На сохранённую продажу', dispatch: 'На отправку', order: 'На заказ до отмен', day: 'За день хранения', period: 'За весь период' };
export const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const clone = value => JSON.parse(JSON.stringify(value));
const MAX_PRICE = 1e9;
const numberFields = ['base', 'discount', 'club', 'spp', 'commission', 'options', 'acquiring', 'tax', 'cost', 'packaging', 'logistics', 'reverseLogistics', 'buyout', 'storage', 'ads', 'other', 'target', 'floor', 'commissionFixed', 'optionsFixed', 'acquiringFixed', 'taxFixed', 'vatRate', 'inputVat', 'deductibleCosts', 'returnRate', 'cancelRate', 'returnLogistics', 'returnLoss', 'storageDays', 'periodSales', 'liters'];
const stringFields = ['model', 'subject', 'commissionSource', 'commissionBasis', 'optionsBasis', 'acquiringBasis', 'taxProfile', 'taxBasis', 'packagingUnit', 'storageUnit', 'adsUnit', 'otherUnit', 'logisticsSource', 'supplyDate'];
const editable = [...numberFields, ...stringFields, 'blockAuto', 'vatDeductible', 'actual'];
const rateFields = ['discount', 'club', 'spp', 'commission', 'options', 'acquiring', 'tax', 'target', 'returnRate', 'cancelRate'];
const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validateProduct(p) {
  const errors = [];
  if (numberFields.some(field => typeof p[field] !== 'number' || !Number.isFinite(p[field]) || p[field] < 0)) errors.push('Заполните все суммы и проценты неотрицательными числами.');
  if (!(p.base > 0 && p.base <= MAX_PRICE)) errors.push('Базовая цена должна быть больше нуля и не больше 1 млрд ₽.');
  if (rateFields.some(field => p[field] >= 100)) errors.push('Скидки, ставки, отмены и возвраты должны быть меньше 100%.');
  if (p.club !== 0 && (p.club < 3 || p.club > 31 || !Number.isInteger(p.club))) errors.push('Скидка WB Клуба: 0 для отключения или целое число от 3 до 31%.');
  if (!Number.isInteger(p.floor)) errors.push('Минимум для автоакций должен быть целым числом рублей.');
  if (!(p.buyout > 0 && p.buyout <= 100)) errors.push('Выкуп должен быть больше 0 и не больше 100%.');
  if (!['FBW', 'FBS', 'DBS'].includes(p.model)) errors.push('Выберите модель продаж.');
  if (typeof p.blockAuto !== 'boolean' || typeof p.vatDeductible !== 'boolean') errors.push('Укажите настройки автоакций и вычета НДС.');
  for (const key of ['commissionBasis', 'optionsBasis', 'acquiringBasis']) if (!Object.hasOwn(BASE_LABELS, p[key])) errors.push('Выберите базу каждого удержания.');
  if (!['seller', 'buyer'].includes(p.taxBasis) || !['income', 'profit', 'manual'].includes(p.taxProfile)) errors.push('Выберите налоговый сценарий и базу дохода.');
  if (![0, 5, 7, 10, 22].includes(p.vatRate)) errors.push('Выберите ставку НДС.');
  if ((p.vatRate === 0 || [5, 7].includes(p.vatRate)) && (p.vatDeductible || p.inputVat > 0)) errors.push('Вычет в этой модели доступен только при НДС 10% или 22%.');
  if (!p.vatDeductible && p.inputVat > 0) errors.push('Подтвердите право на вычет или обнулите входной НДС.');
  for (const [key, units] of Object.entries({ packagingUnit: ['retained', 'dispatch'], storageUnit: ['retained', 'day', 'period'], adsUnit: ['retained', 'order', 'period'], otherUnit: ['retained', 'dispatch', 'order', 'period'] })) if (!units.includes(p[key])) errors.push('Выберите единицы затрат.');
  if (!(p.periodSales > 0) || !(p.liters > 0)) errors.push('Объём и число сохранённых продаж за период должны быть больше нуля.');
  if (!['manual', 'newFbw'].includes(p.logisticsSource)) errors.push('Выберите источник логистики.');
  if (p.logisticsSource === 'newFbw' && (p.model !== 'FBW' || !dateValid(p.supplyDate) || p.supplyDate < LOGISTICS_SNAPSHOT.newSupplyFrom)) errors.push('Снимок логистики: новая поставка FBW с 15.08.2026. Для других условий введите свои тарифы.');
  if (typeof p.commissionSource !== 'string' || typeof p.subject !== 'string') errors.push('Укажите источник комиссии и предмет.');
  if (p.commissionSource !== 'manual' && (p.commissionSource !== COMMISSION_SNAPSHOT.id || tariffFor(p.subject, p.model) !== p.commission)) errors.push('Ставка не совпадает со снимком. Примените тариф заново или отметьте ручную ставку.');
  if (p.actual != null && (typeof p.actual !== 'object' || Array.isArray(p.actual))) errors.push('Некорректная ручная сверка.');
  return [...new Set(errors)];
}

function prices(p) {
  const afterDiscount = money(p.base * (1 - p.discount / 100));
  const seller = money(afterDiscount * (1 - p.club / 100));
  return { afterDiscount, seller, buyer: money(seller * (1 - p.spp / 100)) };
}
function allocatedCosts(p) {
  const q = p.buyout / 100, returns = p.returnRate / 100, sent = 1 - p.cancelRate / 100;
  const retained = q * (1 - returns);
  const dispatches = 1 / retained, orders = dispatches / sent;
  const failedReturns = (1 - q) / retained, postReturns = q * returns / retained;
  const baseLogistics = p.logisticsSource === 'newFbw' ? volumeTariff(p.liters) : null;
  const forward = baseLogistics == null ? p.logistics : money(baseLogistics * LOGISTICS_SNAPSHOT.coefficient);
  const reverse = baseLogistics ?? p.reverseLogistics, postReverse = baseLogistics ?? p.returnLogistics;
  const expectedLogistics = forward * dispatches + reverse * failedReturns + postReverse * postReturns;
  const unit = (amount, basis) => amount * ({ retained: 1, dispatch: dispatches, order: orders, day: p.storageDays, period: 1 / p.periodSales }[basis]);
  const packagingCost = unit(p.packaging, p.packagingUnit), storageCost = unit(p.storage, p.storageUnit);
  const adsCost = unit(p.ads, p.adsUnit), otherCost = unit(p.other, p.otherUnit), returnLossCost = p.returnLoss * postReturns;
  const periodCosts = (p.storageUnit === 'period' ? storageCost : 0) + (p.adsUnit === 'period' ? adsCost : 0) + (p.otherUnit === 'period' ? otherCost : 0);
  const costs = p.cost + packagingCost + expectedLogistics + storageCost + adsCost + otherCost + returnLossCost;
  return { costs, periodCosts, dispatches, orders, failedReturns, postReturns, expectedLogistics, packagingCost, storageCost, adsCost, otherCost, returnLossCost, forward, reverse, postReverse };
}
function economics(seller, p, allocated) {
  const buyer = seller * (1 - p.spp / 100);
  const fee = key => p[key + 'Basis'] === 'fixed' ? p[key + 'Fixed'] : (p[key + 'Basis'] === 'buyer' ? buyer : seller) * p[key] / 100;
  const commissionOnly = fee('commission'), optionsCost = fee('options'), acquiringCost = fee('acquiring');
  const outputVat = seller * p.vatRate / (100 + p.vatRate);
  const vatCost = outputVat - (p.vatDeductible ? p.inputVat : 0);
  const taxBase = (p.taxBasis === 'buyer' ? buyer : seller) / (1 + p.vatRate / 100);
  const taxCost = p.taxProfile === 'manual' ? p.taxFixed : (p.taxProfile === 'profit' ? Math.max(0, taxBase - p.deductibleCosts) : taxBase) * p.tax / 100;
  const commissionCost = commissionOnly + optionsCost;
  const profit = seller - allocated.costs - commissionCost - acquiringCost - taxCost - vatCost;
  return { profit, commissionCost, commissionOnly, optionsCost, acquiringCost, taxCost, taxBase, outputVat, vatCost, netRevenue: seller - outputVat,
    marketplacePayout: seller - commissionCost - acquiringCost - allocated.expectedLogistics - allocated.storageCost };
}
// Each segment is affine; income-minus-expense tax introduces a single kink.
function solvePrice(p, allocated, target, minimum = 1) {
  if (minimum > MAX_PRICE) return null;
  const basis = (p.taxBasis === 'buyer' ? 1 - p.spp / 100 : 1) / (1 + p.vatRate / 100);
  const kink = p.taxProfile === 'profit' ? p.deductibleCosts / basis : 0;
  const points = [minimum, ...(kink > minimum && kink < MAX_PRICE ? [kink] : []), MAX_PRICE];
  if (minimum === MAX_PRICE) return economics(minimum, p, allocated).profit >= minimum * target / 100 ? minimum : null;
  const value = price => economics(price, p, allocated).profit - price * target / 100;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], va = value(a), vb = value(b), slope = (vb - va) / (b - a);
    const candidate = va >= -1e-8 ? Math.ceil(a) : slope > 0 ? Math.ceil(a - va / slope - 1e-8) : null;
    if (candidate != null && candidate >= a && candidate <= b && candidate <= MAX_PRICE && value(candidate) >= -1e-6) return candidate;
  }
  return null;
}
export function calculate(p) {
  const errors = validateProduct(p);
  if (errors.length) return { valid: false, errors };
  const price = prices(p), allocated = allocatedCosts(p);
  if (price.seller <= 0) return { valid: false, errors: ['Цена после скидок должна быть больше нуля.'] };
  if (p.inputVat > allocated.costs) return { valid: false, errors: ['Входной НДС на продажу не может превышать все её затраты в этом сценарии.'] };
  const result = economics(price.seller, p, allocated);
  if (![...Object.values(allocated), ...Object.values(result)].every(Number.isFinite)) return { valid: false, errors: ['Суммы слишком велики или доля сохранённых продаж слишком мала для расчёта.'] };
  const breakEven = solvePrice(p, allocated, 0), safe = solvePrice(p, allocated, p.target);
  const threshold = solvePrice(p, allocated, p.target, Math.max(1, p.floor));
  const margin = result.profit / price.seller * 100;
  const status = result.profit < -1e-7 ? 'loss' : threshold == null || price.seller + 1e-7 < threshold ? 'risk' : 'ok';
  return { valid: true, errors: [], ...price, ...allocated, ...result, contribution: result.profit + allocated.periodCosts, margin, breakEven, safe, threshold, status };
}
export function baseForSeller(seller, p) {
  const factor = (1 - p.discount / 100) * (1 - p.club / 100);
  if (!Number.isFinite(seller) || seller <= 0 || factor <= 0 || validateProduct(p).length) throw new Error('Не удалось рассчитать базовую цену.');
  let base = Math.ceil(seller / factor - 1e-9);
  if (base > MAX_PRICE) throw new Error('Цель требует базовую цену выше 1 млрд ₽. Уточните расходы или скидки.');
  while (prices({ ...p, base }).seller < seller) base += 1;
  if (base > MAX_PRICE) throw new Error('Цель требует базовую цену выше 1 млрд ₽. Уточните расходы или скидки.');
  while (base > 1 && prices({ ...p, base: base - 1 }).seller >= seller) base -= 1;
  return base;
}
export function estimatePlatformDiscount(seller, observed) {
  if (!Number.isFinite(seller) || !Number.isFinite(observed) || seller <= 0 || observed <= 0 || observed > seller) return null;
  return (1 - observed / seller) * 100;
}
export function priceScenario(p, changePercent) {
  const before = calculate(p);
  if (!before.valid || !Number.isFinite(changePercent) || changePercent <= -100) return null;
  let next;
  try { next = { ...p, base: baseForSeller(before.seller * (1 + changePercent / 100), p) }; } catch { return null; }
  const after = calculate(next);
  if (!after.valid) return null;
  return { product: next, result: after, requiredVolume: before.contribution > 0 && after.contribution > 0 ? before.contribution / after.contribution : null };
}
export const ACTUAL_KEYS = ['revenue', 'commission', 'acquiring', 'logistics', 'storage', 'ads', 'tax', 'vat', 'costs'];
export function reconcile(p, actual = p.actual) {
  const plan = calculate(p), errors = [];
  if (!actual) return { valid: false, errors: ['Введите данные своего отчёта.'] };
  if (!dateValid(actual.from) || !dateValid(actual.to) || actual.to < actual.from) errors.push('Укажите корректный период отчёта.');
  if (typeof actual.source !== 'string' || !actual.source.trim()) errors.push('Укажите отчёт или источник сумм.');
  if (!Number.isInteger(actual.units) || actual.units <= 0) errors.push('Укажите число сохранённых продаж завершённой когорты.');
  if (actual.closed !== true) errors.push('Подтвердите завершённую когорту без ожидаемых возвратов.');
  if (ACTUAL_KEYS.some(key => typeof actual[key] !== 'number' || !Number.isFinite(actual[key]) || (key !== 'vat' && actual[key] < 0))) errors.push('Заполните суммы отчёта числами; расходы укажите положительными.');
  if (!plan.valid || errors.length) return { valid: false, errors: [...errors, ...plan.errors] };
  const expected = { revenue: plan.seller, commission: plan.commissionCost, acquiring: plan.acquiringCost, logistics: plan.expectedLogistics, storage: plan.storageCost, ads: plan.adsCost, tax: plan.taxCost, vat: plan.vatCost, costs: p.cost + plan.packagingCost + plan.otherCost + plan.returnLossCost };
  const rows = ACTUAL_KEYS.map(key => ({ key, plan: expected[key], actual: actual[key] / actual.units, delta: actual[key] / actual.units - expected[key] }));
  const profit = (actual.revenue - ACTUAL_KEYS.filter(key => key !== 'revenue').reduce((sum, key) => sum + actual[key], 0)) / actual.units;
  return { valid: true, errors: [], rows, profit, delta: profit - plan.profit, margin: actual.revenue ? profit * actual.units / actual.revenue * 100 : null };
}
export function createSeed(products) {
  // Explicit demo mapping; these are not verified WB card subjects.
  const subjects = { p5: 'Плащи', p11: 'Топы', p15: 'Сумки' };
  return { schema: 2, products: products.map((p, index) => withTariff({
    id: p.id, name: p.name, code: p.code, nm: p.nm, category: p.cat, mono: p.mono, tile: p.tile, revision: 1,
    subject: subjects[p.id] || (SUBJECTS.some(row => row.subject === p.cat) ? p.cat : ''),
    base: p.base, discount: Math.round((1 - p.price / p.base) * 100), club: 0, spp: [19, 17, 21, 18, 16][index % 5],
    model: 'FBW', commission: p.comm, commissionSource: 'manual', options: 0, acquiring: 1.5, tax: 6,
    commissionBasis: 'seller', optionsBasis: 'seller', acquiringBasis: 'seller', taxBasis: 'seller',
    commissionFixed: 0, optionsFixed: 0, acquiringFixed: 0, taxFixed: 0, taxProfile: 'income',
    vatRate: 0, vatDeductible: false, inputVat: 0, deductibleCosts: 0,
    cost: p.cost, packaging: 25, packagingUnit: 'dispatch', logistics: p.logi, reverseLogistics: 50, returnLogistics: 50,
    logisticsSource: 'manual', supplyDate: '2026-10-19', liters: 1.8,
    buyout: p.buyout, returnRate: 0, cancelRate: 0, returnLoss: 0,
    storage: p.stor, storageUnit: 'retained', storageDays: 30, ads: p.ad, adsUnit: 'retained', other: 0, otherUnit: 'retained', periodSales: 100,
    target: 15, floor: 0, blockAuto: true, actual: null,
  })), history: [] };
}
export function loadStore(seed, storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { data: clone(seed), warning: '' };
    const saved = JSON.parse(raw), legacy = saved.schema === 1;
    if (![1, 2].includes(saved.schema) || !Array.isArray(saved.products) || saved.products.length !== seed.products.length || !Array.isArray(saved.history)) throw new Error('schema');
    const restore = (initial, found) => {
      if (!found) throw new Error('product');
      const patch = Object.fromEntries(editable.filter(key => Object.hasOwn(found, key)).map(key => [key, found[key]]));
      const p = { ...initial, ...patch, revision: found.revision };
      if (legacy) Object.assign(p, { commissionSource: 'manual', packagingUnit: 'retained', returnLogistics: p.reverseLogistics });
      if (validateProduct(p).length || !calculate(p).valid || !Number.isInteger(p.revision) || p.revision < 1) throw new Error('product');
      return p;
    };
    const products = seed.products.map(initial => restore(initial, saved.products.find(p => p.id === initial.id)));
    const history = saved.history.flatMap(row => {
      try {
        if (!row || typeof row.id !== 'string' || typeof row.at !== 'string' || typeof row.title !== 'string' || !['change', 'rollback'].includes(row.kind) || !Array.isArray(row.changes) || !row.changes.length) return [];
        return [{ ...row, changes: row.changes.map(c => {
          const initial = seed.products.find(p => p.id === c.id);
          if (!initial) throw new Error('id');
          return { id: c.id, before: restore(initial, c.before), after: restore(initial, c.after) };
        }) }];
      } catch { return []; }
    }).slice(0, 60);
    return { data: { schema: 2, products, history }, warning: legacy ? 'Сценарий перенесён из первой версии. Ваши цены, ставки и история сохранены; старые комиссии отмечены как ручные. Официальный снимок можно применить в калькуляторе.' : '' };
  } catch { return { data: clone(seed), warning: 'Сохранённые данные недоступны. Загружен исходный демо-сценарий.' }; }
}
export function saveStore(store, storage) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(store)); }
  catch { throw new Error('Браузер не сохранил изменения. Освободите место или разрешите локальное хранилище.'); }
}
export function previewChanges(store, changes) {
  if (!changes.length) throw new Error('Выберите хотя бы один товар.');
  const ids = new Set();
  return changes.map(change => {
    if (ids.has(change.id)) throw new Error('Один товар указан дважды.');
    ids.add(change.id);
    const before = store.products.find(p => p.id === change.id);
    if (!before) throw new Error('Товар не найден.');
    if (change.revision !== before.revision) throw new Error('Товар уже изменился. Откройте расчёт заново.');
    const patch = Object.fromEntries(Object.entries(change.patch).filter(([key]) => editable.includes(key)));
    if (Object.hasOwn(patch, 'commission') && !Object.hasOwn(patch, 'commissionSource')) patch.commissionSource = 'manual';
    const after = { ...before, ...clone(patch), revision: before.revision + 1 };
    const oldResult = calculate(before), result = calculate(after);
    if (!result.valid) throw new Error(result.errors.join(' '));
    return { id: before.id, before: clone(before), after, oldResult, result };
  });
}
export function commitChanges(store, changes, title, acknowledgeRisk = false) {
  const preview = previewChanges(store, changes);
  if (!acknowledgeRisk && preview.some(row => row.result.status !== 'ok')) throw new Error('Подтвердите сохранение цены ниже целевого порога.');
  const changed = new Map(preview.map(row => [row.id, row.after]));
  const entry = {
    id: globalThis.crypto?.randomUUID?.() || `change-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: new Date().toISOString(), title, kind: 'change', changes: preview.map(({ id, before, after }) => ({ id, before, after })),
  };
  return { schema: 2, products: store.products.map(p => changed.get(p.id) || p), history: [entry, ...store.history].slice(0, 60) };
}
export function canRollback(store, entry) {
  return entry.kind === 'change' && !entry.rolledBack && entry.changes.every(change => store.products.find(p => p.id === change.id)?.revision === change.after.revision);
}
export function rollbackChanges(store, entryId) {
  const entry = store.history.find(row => row.id === entryId);
  if (!entry || !canRollback(store, entry)) throw new Error('Товар уже изменился после этой операции. Откат недоступен.');
  const changes = entry.changes.map(change => ({ id: change.id, revision: change.after.revision, patch: change.before }));
  const next = commitChanges(store, changes, 'Откат: ' + entry.title, true);
  next.history[0].kind = 'rollback';
  next.history = next.history.map(row => row.id === entryId ? { ...row, rolledBack: true } : row);
  return next;
}
