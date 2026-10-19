// Verified excerpt, not a live tariff feed. Exact WB subject names are preserved.
export const COMMISSION_SNAPSHOT = Object.freeze({
  id: 'wb-ru-2026-08-24', effectiveFrom: '2026-08-24', checkedOn: '2026-10-19',
  url: 'https://static-basket-02.wbbasket.ru/vol20/education/instruction/Comission_RU.pdf',
  sha256: 'c40a51fde0dd91b226e6e7214279bd6eae9d7e8664f22712b0035967bc32f656',
});
export const SUBJECTS = [
  ['Сумки', 'Аксессуары', 41], ['Брюки', 'Одежда', 132],
  ['Рубашки', 'Одежда', 133], ['Кардиганы', 'Одежда', 133],
  ['Платья', 'Одежда', 133], ['Водолазки', 'Одежда', 133], ['Свитшоты', 'Одежда', 133],
  ['Костюмы', 'Одежда', 134], ['Топы', 'Одежда', 134], ['Юбки', 'Одежда', 134],
  ['Пиджаки', 'Одежда', 134], ['Плащи', 'Одежда', 134], ['Джинсы', 'Одежда', 134], ['Футболки', 'Одежда', 134],
].map(([subject, parent, page]) => Object.freeze({
  subject, parent, page, FBW: subject === 'Кардиганы' ? 41.5 : 43.5,
  FBS: subject === 'Кардиганы' ? 46 : 48, DBS: 45,
}));
export function tariffFor(subject, model) {
  return SUBJECTS.find(row => row.subject === subject)?.[model] ?? null;
}
export function withTariff(product, patch = {}) {
  const next = { ...product, ...patch }, rate = tariffFor(next.subject, next.model);
  return rate == null ? { ...next, commissionSource: 'manual' } : {
    ...next, commission: rate, commissionSource: COMMISSION_SNAPSHOT.id, commissionBasis: 'seller',
  };
}
export const LOGISTICS_SNAPSHOT = Object.freeze({
  checkedOn: '2026-10-19', articleUpdated: '2026-10-13', newSupplyFrom: '2026-08-15', coefficient: 1.7,
  url: 'https://seller.wildberries.ru/instructions/ru/ru/material/logistics-types-and-cost-calculation',
});
// Ordinary goods, Russian FBW new-supply scenario. Historical/oversize terms are manual.
export function volumeTariff(liters) {
  if (!Number.isFinite(liters) || liters <= 0) return null;
  if (liters <= 1) return [23, 26, 29, 30, 32][Math.max(0, Math.min(4, Math.ceil(liters * 5 - 1e-10) - 1))];
  return Math.round((46 + 14 * (liters - 1)) * 100) / 100;
}
