// Planning model. Rates and product observations are demo scenarios, not WB tariffs.
export const STORAGE_KEY = 'marginpilot.prices.v1';
export const CHECKED_ON = '19.10.2026';
export const SOURCES = [
  { title: 'Цены и скидки продавца', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/how-to-set-price-and-discount', text: 'Базовая цена и скидка продавца задаются отдельно.' },
  { title: 'Скидка WB (СПП)', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/wb-discount', text: 'Скидку финансирует WB; она не вычитается второй раз из дохода продавца.' },
  { title: 'Тарифы по категориям', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/fees-site-section', text: 'Точную ставку проверяют по предмету и модели продаж в кабинете продавца.' },
  { title: 'Скидка WB Клуба', url: 'https://seller.wildberries.ru/instructions/en/ru/material/wb-club-discount', text: 'Дополнительная скидка продавца применяется к цене после его основной скидки.' },
  { title: 'Минимальная цена и автоакции', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/how-to-set-minimal-price-and-block-auto-promotions', text: 'Ограничения действуют на автоматическое применение скидок в автоакциях.' },
  { title: 'Детализация отчёта реализации', url: 'https://seller.wildberries.ru/instructions/ru/ru/material/how-to-read-fimancial-reports-detalization', text: 'Платформенные скидки и фактические удержания сверяют по отдельным полям отчёта.' },
];

export const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const clone = value => JSON.parse(JSON.stringify(value));
const numberFields = ['base', 'discount', 'club', 'spp', 'commission', 'options', 'acquiring', 'tax', 'cost', 'packaging', 'logistics', 'reverseLogistics', 'buyout', 'storage', 'ads', 'other', 'target', 'floor'];
const editable = [...numberFields, 'model', 'blockAuto'];
const rateFields = ['discount', 'club', 'spp', 'commission', 'options', 'acquiring', 'tax', 'target'];

export function validateProduct(p) {
  const errors = [];
  for (const field of numberFields) {
    if (typeof p[field] !== 'number' || !Number.isFinite(p[field]) || p[field] < 0) errors.push('Заполните все суммы и проценты неотрицательными числами.');
  }
  if (!(p.base > 0)) errors.push('Базовая цена должна быть больше нуля.');
  if (rateFields.some(field => p[field] >= 100)) errors.push('Скидки и ставки должны быть меньше 100%.');
  if (p.club !== 0 && (p.club < 3 || p.club > 31 || !Number.isInteger(p.club))) errors.push('Скидка WB Клуба: 0 для отключения или целое число от 3 до 31%.');
  if (!Number.isInteger(p.floor)) errors.push('Минимум для автоакций должен быть целым числом рублей.');
  if (!(p.buyout > 0 && p.buyout <= 100)) errors.push('Выкуп должен быть больше 0 и не больше 100%.');
  if (!['FBW', 'FBS', 'DBS'].includes(p.model)) errors.push('Выберите модель продаж.');
  if (typeof p.blockAuto !== 'boolean') errors.push('Укажите настройку автоакций.');
  return [...new Set(errors)];
}

export function calculate(p) {
  const errors = validateProduct(p);
  if (errors.length) return { valid: false, errors };
  const afterDiscount = money(p.base * (1 - p.discount / 100));
  const seller = money(afterDiscount * (1 - p.club / 100));
  if (seller <= 0) return { valid: false, errors: ['Цена после скидок должна быть больше нуля.'] };
  const buyer = money(seller * (1 - p.spp / 100));
  const q = p.buyout / 100;
  // One sold unit must cover the failed dispatches as well as the successful one.
  const expectedLogistics = (p.logistics + (1 - q) * p.reverseLogistics) / q;
  const costs = p.cost + p.packaging + expectedLogistics + p.storage + p.ads + p.other;
  const rate = (p.commission + p.options + p.acquiring + p.tax) / 100;
  const profit = seller * (1 - rate) - costs;
  if (![seller, buyer, expectedLogistics, costs, profit].every(Number.isFinite)) return { valid: false, errors: ['Суммы слишком велики или доля выкупа слишком мала для расчёта.'] };
  const margin = profit / seller * 100;
  const breakEven = rate < 1 ? Math.ceil(costs / (1 - rate) - 1e-9) : null;
  const targetDenominator = 1 - rate - p.target / 100;
  const safe = targetDenominator > 0 ? Math.ceil(costs / targetDenominator - 1e-9) : null;
  const threshold = safe == null ? null : Math.max(safe, p.floor);
  const status = profit < 0 ? 'loss' : safe == null || seller < Math.max(safe, p.floor) ? 'risk' : 'ok';
  return {
    valid: true, errors: [], afterDiscount, seller, buyer, expectedLogistics, costs, rate, profit, margin, breakEven, safe, threshold, status,
    commissionCost: seller * (p.commission + p.options) / 100,
    acquiringCost: seller * p.acquiring / 100,
    taxCost: seller * p.tax / 100,
    marketplacePayout: seller * (1 - (p.commission + p.options + p.acquiring) / 100) - expectedLogistics - p.storage,
  };
}

export function baseForSeller(seller, p) {
  const factor = (1 - p.discount / 100) * (1 - p.club / 100);
  if (!Number.isFinite(seller) || seller <= 0 || factor <= 0 || validateProduct(p).length) throw new Error('Не удалось рассчитать базовую цену.');
  // Round upwards so the resulting price never falls below the requested floor.
  let base = Math.ceil(seller / factor - 1e-9);
  while (calculate({ ...p, base }).seller < seller) base += 1;
  // Sequential rounding can make one ruble less sufficient as well.
  while (base > 1 && calculate({ ...p, base: base - 1 }).seller >= seller) base -= 1;
  return base;
}

export function estimatePlatformDiscount(seller, observed) {
  if (!Number.isFinite(seller) || !Number.isFinite(observed) || seller <= 0 || observed <= 0 || observed > seller) return null;
  return (1 - observed / seller) * 100;
}

export function createSeed(products) {
  return {
    schema: 1,
    products: products.map((p, index) => ({
      id: p.id, name: p.name, code: p.code, nm: p.nm, category: p.cat,
      mono: p.mono, tile: p.tile, revision: 1,
      base: p.base, discount: Math.round((1 - p.price / p.base) * 100), club: 0,
      spp: [19, 17, 21, 18, 16][index % 5], commission: p.comm,
      model: 'FBW', options: 0, acquiring: 1.5, tax: 6,
      cost: p.cost, packaging: 25, logistics: p.logi, reverseLogistics: 50,
      buyout: p.buyout, storage: p.stor, ads: p.ad, other: 0,
      target: 15, floor: 0, blockAuto: true,
    })),
    history: [],
  };
}

export function loadStore(seed, storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { data: clone(seed), warning: '' };
    const saved = JSON.parse(raw);
    if (saved.schema !== 1 || !Array.isArray(saved.products) || saved.products.length !== seed.products.length || !Array.isArray(saved.history)) throw new Error('schema');
    const products = seed.products.map(initial => {
      const found = saved.products.find(p => p.id === initial.id);
      if (!found || validateProduct(found).length || !Number.isInteger(found.revision) || found.revision < 1) throw new Error('product');
      return { ...initial, ...Object.fromEntries(editable.map(key => [key, found[key]])), revision: found.revision };
    });
    const ids = new Set(products.map(p => p.id));
    const history = saved.history.filter(row => row && typeof row.id === 'string' && typeof row.at === 'string' && typeof row.title === 'string' && Array.isArray(row.changes) && row.changes.length && row.changes.every(c => c && ids.has(c.id) && c.before && c.after && !validateProduct(c.before).length && !validateProduct(c.after).length && Number.isInteger(c.after.revision))).slice(0, 60);
    return { data: { schema: 1, products, history }, warning: '' };
  } catch {
    return { data: clone(seed), warning: 'Сохранённые данные недоступны. Загружен исходный демо-сценарий.' };
  }
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
    const after = { ...before, ...patch, revision: before.revision + 1 };
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
    at: new Date().toISOString(), title, kind: 'change',
    changes: preview.map(({ id, before, after }) => ({ id, before, after })),
  };
  return { schema: 1, products: store.products.map(p => changed.get(p.id) || p), history: [entry, ...store.history].slice(0, 60) };
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
