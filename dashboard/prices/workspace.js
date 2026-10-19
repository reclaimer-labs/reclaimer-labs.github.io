import {
  CHECKED_ON, SOURCES, STORAGE_KEY, money, calculate, createSeed, loadStore,
  saveStore, baseForSeller, estimatePlatformDiscount, previewChanges,
  commitChanges, canRollback, rollbackChanges,
} from './model.js';

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const rub = value => value == null || !Number.isFinite(value) ? '—' : number.format(money(value)) + ' ₽';
const pct = value => value == null || !Number.isFinite(value) ? '—' : number.format(Math.round(value * 10) / 10) + '%';
const date = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const statusText = { ok: 'В рамках цели', risk: 'Ниже порога', loss: 'В убыток' };

export function createPricesWorkspace(React) {
  const h = React.createElement;
  const { useState, useMemo, useRef, useEffect } = React;
  const icon = name => h('span', { className: 'pw-icon', 'aria-hidden': true }, name);
  const badge = (text, tone = '') => h('span', { className: 'pw-badge ' + tone }, text);
  const button = (text, action, kind = '', props = {}) => h('button', { type: 'button', className: 'pw-btn ' + kind, onClick: action, ...props }, text);
  const sourceLink = (source, label) => h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', className: 'pw-source-link' }, label || source.title, icon('north_east'));

  function Field({ label, value, onChange, min = 0, max, step = 'any', hint, suffix, disabled = false }) {
    const id = React.useId();
    return h('label', { className: 'pw-field', htmlFor: id },
      h('span', { className: 'pw-label' }, label),
      h('span', { className: 'pw-input-wrap' }, h('input', {
        id, type: 'number', inputMode: 'decimal', min, max, step, disabled,
        value: typeof value === 'number' ? Number(value.toFixed(4)) : value,
        onChange: event => onChange(event.target.value === '' ? '' : Number(event.target.value)),
      }), suffix && h('span', { className: 'pw-suffix' }, suffix)),
      hint && h('small', null, hint));
  }

  function Dialog({ title, subtitle, onClose, children, wide = false }) {
    const ref = useRef(null);
    const titleId = React.useId();
    useEffect(() => {
      const previous = document.activeElement;
      ref.current?.focus();
      const handle = event => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key !== 'Tab') return;
        const items = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select,a[href],[tabindex="0"]')];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
      };
      const node = ref.current;
      node.addEventListener('keydown', handle);
      return () => { node.removeEventListener('keydown', handle); previous?.isConnected && previous.focus(); };
    }, []);
    return h('div', { className: 'pw-overlay', onClick: event => { if (event.target === event.currentTarget) onClose(); } },
      h('section', { className: 'pw-dialog' + (wide ? ' pw-dialog-wide' : ''), role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, ref, tabIndex: -1 },
        h('header', { className: 'pw-dialog-head' }, h('div', null, h('h2', { id: titleId }, title), subtitle && h('p', null, subtitle)), button(icon('close'), onClose, 'pw-btn-icon', { 'aria-label': 'Закрыть окно' })),
        children));
  }

  function Product({ product }) {
    return h('div', { className: 'pw-product' },
      h('div', { className: 'pw-art', style: { background: product.tile }, 'aria-hidden': true }, product.mono),
      h('div', null, h('strong', null, product.name), h('small', null, product.code + ' · ' + product.nm)));
  }

  function PriceFlow({ product, result }) {
    return h('div', { className: 'pw-flow' },
      h('div', null, h('small', null, 'До скидки'), h('strong', null, rub(product.base))), icon('arrow_forward'),
      h('div', null, h('small', null, 'Цена продавца'), h('strong', null, rub(result.seller))), icon('arrow_forward'),
      h('div', null, h('small', null, 'Покупателю · оценка'), h('strong', null, rub(result.buyer))));
  }

  function Result({ product, onRecommend }) {
    const r = calculate(product);
    if (!r.valid) return h('aside', { className: 'pw-result pw-result-invalid', 'aria-live': 'polite' }, icon('calculate'), h('h2', null, 'Уточните параметры'), r.errors.map(error => h('p', { key: error }, error)));
    const rows = [
      ['Себестоимость и упаковка', product.cost + product.packaging, 'cost'],
      ['Комиссия и опции WB', r.commissionCost, 'commission'],
      ['Платёжные услуги', r.acquiringCost, 'payment'],
      ['Логистика с учётом выкупа', r.expectedLogistics, 'logistics'],
      ['Хранение', product.storage, 'storage'],
      ['Реклама на один выкуп', product.ads, 'ads'],
      ['Налог · сценарий', r.taxCost, 'tax'],
      ['Другие расходы', product.other, 'other'],
    ];
    return h('aside', { className: 'pw-result', 'aria-label': 'Результат расчёта', 'aria-live': 'polite' },
      h('div', { className: 'pw-result-top' }, h('span', { className: 'pw-eyebrow' }, 'ПРИБЫЛЬ С ОДНОГО ВЫКУПА'), badge(statusText[r.status], r.status)),
      h('div', { className: 'pw-result-profit' + (r.profit < 0 ? ' pw-negative' : '') }, rub(r.profit)),
      h('p', { className: 'pw-result-margin' }, 'Маржа ', h('strong', null, pct(r.margin)), h('span', null, ' / цель ' + pct(product.target))),
      h(PriceFlow, { product, result: r }),
      h('div', { className: 'pw-cost-stack', 'aria-hidden': true }, rows.filter(row => row[1] > 0).map(row => h('span', { key: row[2], className: 'pw-segment-' + row[2], style: { flex: row[1] }, title: row[0] + ': ' + rub(row[1]) })), r.profit > 0 && h('span', { className: 'pw-segment-profit', style: { flex: r.profit }, title: 'Прибыль: ' + rub(r.profit) })),
      h('dl', { className: 'pw-breakdown' }, rows.map(([label, value, key]) => h('div', { key }, h('dt', null, h('i', { className: 'pw-dot pw-segment-' + key }), label), h('dd', null, rub(value))))),
      h('div', { className: 'pw-thresholds' }, h('div', null, h('small', null, 'Безубыточность'), h('strong', { 'data-testid': 'break-even' }, rub(r.breakEven))), h('div', null, h('small', null, 'Цена для цели ' + pct(product.target)), h('strong', { 'data-testid': 'target-price' }, r.safe == null ? 'Недостижима' : rub(r.safe)))),
      r.safe == null ? h('p', { className: 'pw-warning-text' }, 'Комиссии, налог и целевая маржа дают 100% или больше. Измените ставки или цель.') : button([icon('price_check'), 'Установить цену для цели'], () => onRecommend(r.threshold), 'pw-btn-mint'),
      h('p', { className: 'pw-result-note' }, 'СПП меняет цену покупателя. Прибыль рассчитана от цены продавца, без повторного вычета скидки WB.'));
  }

  return function PricesWorkspace({ products = [] }) {
    const seed = useMemo(() => createSeed(products), [products]);
    const storage = useMemo(() => { try { return window.localStorage; } catch { return null; } }, []);
    const initial = useMemo(() => loadStore(seed, storage), []);
    const [store, setStore] = useState(initial.data);
    const [message, setMessage] = useState(initial.warning);
    const [tab, setTab] = useState('manage');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [category, setCategory] = useState('all');
    const [selected, setSelected] = useState(new Set());
    const [editor, setEditor] = useState(null);
    const [preview, setPreview] = useState(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkPercent, setBulkPercent] = useState(5);
    const [calc, setCalc] = useState(() => ({ ...initial.data.products[0] }));
    const [ratesModel, setRatesModel] = useState('FBW');
    const [observationSeller, setObservationSeller] = useState(2890);
    const [observationBuyer, setObservationBuyer] = useState(2340.9);
    const [contextConfirmed, setContextConfirmed] = useState(false);
    const rootRef = useRef(null);
    const persistenceSnapshot = useRef(undefined);
    if (persistenceSnapshot.current === undefined) { try { persistenceSnapshot.current = storage?.getItem(STORAGE_KEY) ?? null; } catch { persistenceSnapshot.current = null; } }

    const metrics = store.products.map(p => ({ p, r: calculate(p) }));
    const risky = metrics.filter(({ r }) => r.status !== 'ok');
    const losses = metrics.filter(({ r }) => r.status === 'loss');
    const categories = [...new Set(store.products.map(p => p.category))];
    const filtered = metrics.filter(({ p, r }) => {
      const text = (p.name + ' ' + p.code + ' ' + p.nm + ' ' + p.category).toLowerCase();
      return text.includes(query.toLowerCase().trim()) && (category === 'all' || p.category === category) && (filter === 'all' || (filter === 'risk' ? r.status !== 'ok' : r.status === filter));
    });
    const selectedProducts = store.products.filter(p => selected.has(p.id));
    const observedDiscount = estimatePlatformDiscount(observationSeller, observationBuyer);

    function changeTab(next) { setTab(next); setMessage(''); rootRef.current?.scrollIntoView({ block: 'start' }); }
    function persist(next) {
      if ((storage?.getItem(STORAGE_KEY) ?? null) !== persistenceSnapshot.current) throw new Error('Данные изменились в другой вкладке. Обновите страницу перед сохранением.');
      saveStore(next, storage);
      persistenceSnapshot.current = JSON.stringify(next);
      setStore(next);
      const updated = next.products.find(p => p.id === calc.id);
      if (updated) setCalc({ ...updated });
    }
    function openPreview(changes, title, extra = {}) {
      try {
        const rows = previewChanges(store, changes);
        setPreview({ changes, rows, title, ...extra }); setAcknowledged(false); setMessage(''); setBulkOpen(false);
      } catch (error) { setMessage(error.message); }
    }
    function confirm() {
      try {
        if (preview.rows.some(row => row.result.status !== 'ok') && !acknowledged) return;
        const next = preview.rollbackId ? rollbackChanges(store, preview.rollbackId) : commitChanges(store, preview.changes, preview.title, acknowledged);
        persist(next); setPreview(null); setEditor(null); setSelected(new Set());
        setMessage('Сохранено в демо-магазине. Изменение записано в историю.');
      } catch (error) { setMessage(error.message); }
    }
    function recommend(p, target) {
      try { return { ...p, base: baseForSeller(Math.max(0.01, target), p) }; }
      catch (error) { setMessage(error.message); return p; }
    }
    function bulk(mode) {
      try {
        if (mode === 'percent' && (typeof bulkPercent !== 'number' || !Number.isFinite(bulkPercent) || bulkPercent <= -100)) throw new Error('Укажите изменение больше −100%.');
        const changes = selectedProducts.map(p => {
          const r = calculate(p);
          const target = mode === 'safe' ? r.threshold : money(r.seller * (1 + bulkPercent / 100));
          if (target == null) throw new Error('Для «' + p.name + '» целевая маржа недостижима. Уточните расходы.');
          return { id: p.id, revision: p.revision, patch: { base: baseForSeller(target, p) } };
        });
        openPreview(changes, mode === 'safe' ? 'Цены для целевой маржи' : 'Массовое изменение на ' + pct(bulkPercent));
      } catch (error) { setMessage(error.message); }
    }
    function startCalculator(p) { setCalc({ ...p }); setEditor(null); changeTab('calculator'); }
    function exportCsv() {
      const rows = [['Артикул', 'Название', 'Модель', 'Базовая цена', 'Скидка продавца %', 'WB Клуб %', 'Цена продавца', 'СПП сценарий %', 'Покупателю оценка', 'Комиссия сценарий %', 'Прибыль на выкуп', 'Маржа %', 'Цена для цели', 'Мин. цена автоакции', 'Блокировка автоакций']];
      for (const { p, r } of filtered) rows.push([p.code, p.name, p.model, p.base, p.discount, p.club, r.seller, p.spp, r.buyer, p.commission, money(r.profit), money(r.margin), r.safe ?? '', p.floor, p.blockAuto ? 'Да' : 'Нет']);
      const csv = '\ufeff' + rows.map(row => row.map(cell => '"' + String(cell).replaceAll('"', '""') + '"').join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'MarginPilot-prices-demo.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('CSV с текущей выборкой и сценарными ставками скачан.');
    }
    const field = (p, setter, key, label, suffix, hint, options = {}) => h(Field, { key, label, value: p[key], onChange: value => setter(current => ({ ...current, [key]: value })), suffix, hint, ...options });
    function priceFields(p, setter) {
      return h('div', { className: 'pw-form-grid' },
        field(p, setter, 'base', 'Базовая цена', '₽', 'До скидок продавца', { min: 0.01 }),
        field(p, setter, 'discount', 'Скидка продавца', '%', null, { max: 99.99 }),
        field(p, setter, 'club', 'Скидка WB Клуба', '%', '0 или 3–31% · за ваш счёт', { max: 31, step: 1 }),
        field(p, setter, 'spp', 'Скидка WB · СПП', '%', 'Сценарий за счёт WB', { max: 99.99 }));
    }
    function ruleFields(p, setter) {
      return h('div', { className: 'pw-rule-fields' }, h('div', { className: 'pw-form-grid pw-form-grid-two' },
        field(p, setter, 'target', 'Целевая маржа', '%', 'От цены продавца', { max: 99.99 }),
        field(p, setter, 'floor', 'Минимум для автоакций', '₽', '0 — не задан', { step: 1 })),
        h('label', { className: 'pw-checkbox-label' }, h('input', { type: 'checkbox', checked: p.blockAuto, onChange: event => setter(current => ({ ...current, blockAuto: event.target.checked })) }), h('span', null, h('strong', null, 'Блокировать снижение в автоакциях'), h('small', null, 'Настройка демо. Ограничивает автоматическую скидку, а не само участие в акции.'))));
    }

    function manage() {
      return h('section', { className: 'pw-panel', 'aria-label': 'Управление ценами' },
        h('div', { className: 'pw-panel-heading' }, h('div', null, h('h2', null, 'Цены товаров'), h('p', null, 'Цена продавца — основа экономики. Цена покупателя показана отдельно.')), button([icon('download'), 'Экспорт CSV'], exportCsv)),
        h('div', { className: 'pw-toolbar' }, h('label', { className: 'pw-search' }, icon('search'), h('input', { type: 'search', value: query, onChange: e => setQuery(e.target.value), placeholder: 'Название, артикул или WB ID', 'aria-label': 'Поиск товара' })),
          h('select', { value: category, onChange: e => setCategory(e.target.value), 'aria-label': 'Категория товара' }, h('option', { value: 'all' }, 'Все категории'), categories.map(cat => h('option', { key: cat, value: cat }, cat))),
          h('div', { className: 'pw-filters', 'aria-label': 'Фильтр состояния цены' }, [['all', 'Все', store.products.length], ['risk', 'Ниже порога', risky.length], ['loss', 'В убыток', losses.length]].map(([id, label, count]) => button([label, h('span', { key: 'n' }, count)], () => setFilter(id), filter === id ? 'pw-btn-active' : '', { key: id, 'aria-pressed': filter === id })))),
        selected.size > 0 && h('div', { className: 'pw-selection' }, h('strong', null, 'Выбрано: ' + selected.size), button('До целевой маржи', () => bulk('safe'), 'pw-btn-primary'), button('Изменить на %', () => setBulkOpen(true)), button('Снять выбор', () => setSelected(new Set()), 'pw-btn-quiet')),
        h('div', { className: 'pw-table-scroll', tabIndex: 0, role: 'region', 'aria-label': 'Таблица цен, прокручивается по горизонтали' },
          h('table', { className: 'pw-table' },
            h('thead', null, h('tr', null,
              h('th', null, h('input', { type: 'checkbox', 'aria-label': 'Выбрать видимые товары', checked: filtered.length > 0 && filtered.every(({ p }) => selected.has(p.id)), disabled: !filtered.length, onChange: e => setSelected(current => { const next = new Set(current); filtered.forEach(({ p }) => e.target.checked ? next.add(p.id) : next.delete(p.id)); return next; }) })),
              ['Товар / модель', 'До скидки', 'Цена продавца', 'Покупателю¹', 'Прибыль / маржа', 'Целевой порог²', 'Контроль', ''].map((title, i) => h('th', { key: i, scope: 'col' }, title)))),
            h('tbody', null, filtered.map(({ p, r }) => h('tr', { key: p.id, className: selected.has(p.id) ? 'pw-row-selected' : '', 'data-product-id': p.id },
              h('td', null, h('input', { type: 'checkbox', 'aria-label': 'Выбрать ' + p.code, checked: selected.has(p.id), onChange: () => setSelected(current => { const next = new Set(current); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; }) })),
              h('td', null, h(Product, { product: p }), h('div', { className: 'pw-product-meta' }, p.model + ' · ' + p.category, p.blockAuto && h('span', { title: 'Автоматическое снижение в автоакциях заблокировано в демо' }, icon('lock')))),
              h('td', { className: 'pw-money' }, rub(p.base), h('small', null, 'скидка ' + pct(p.discount), p.club > 0 ? ' + клуб ' + pct(p.club) : '')),
              h('td', { className: 'pw-money pw-seller' }, rub(r.seller), h('small', null, 'после скидок продавца')),
              h('td', { className: 'pw-money' }, rub(r.buyer), h('small', { className: 'pw-spp-caption' }, 'СПП ' + pct(p.spp) + ' · сценарий')),
              h('td', { className: 'pw-money ' + (r.profit < 0 ? 'pw-text-loss' : '') }, rub(r.profit), h('small', { className: r.status === 'ok' ? 'pw-text-green' : 'pw-text-loss' }, pct(r.margin) + ' / цель ' + pct(p.target))),
              h('td', { className: 'pw-money' }, rub(r.threshold), h('small', null, r.safe == null ? 'цель недостижима' : 'безубыточность ' + rub(r.breakEven))),
              h('td', null, badge(statusText[r.status], r.status)),
              h('td', null, button(icon('edit'), () => { setEditor({ ...p }); setMessage(''); }, 'pw-btn-icon', { 'aria-label': 'Изменить цену ' + p.code, title: 'Изменить цену' }))))))),
        !filtered.length && h('div', { className: 'pw-empty' }, icon('search_off'), h('h3', null, 'Товары не найдены'), h('p', null, 'Измените запрос или сбросьте фильтры.'), button('Сбросить фильтры', () => { setQuery(''); setCategory('all'); setFilter('all'); })),
        h('footer', { className: 'pw-table-footer' }, h('span', null, 'Показано ' + filtered.length + ' из ' + store.products.length + ' товаров'), h('span', null, '¹ Оценка без кошелька и персональных скидок. ² Максимум целевой цены и заданного минимума.')));
    }

    function calculator() {
      const result = calculate(calc);
      const setter = setCalc;
      return h('section', { className: 'pw-calculator', 'aria-label': 'Калькулятор цены' },
        h('div', { className: 'pw-calc-inputs' },
          h('div', { className: 'pw-panel pw-calc-product' }, h('div', null, h('span', { className: 'pw-eyebrow' }, 'РАСЧЁТ ДЛЯ ТОВАРА'), h('select', { value: calc.id, onChange: e => setCalc({ ...store.products.find(p => p.id === e.target.value) }), 'aria-label': 'Товар для расчёта' }, store.products.map(p => h('option', { value: p.id, key: p.id }, p.name)))), badge('Демо-ставки', 'neutral')),
          h('div', { className: 'pw-panel pw-form-panel' }, h('div', { className: 'pw-step-title' }, h('span', null, '01'), h('h2', null, 'Цена и скидки')), priceFields(calc, setter), h('p', { className: 'pw-help' }, 'Скидка продавца и WB Клуб уменьшают вашу цену последовательно. СПП влияет только на оценку цены покупателя.')),
          h('div', { className: 'pw-panel pw-form-panel' }, h('div', { className: 'pw-step-title' }, h('span', null, '02'), h('h2', null, 'Комиссии и налоги')),
            h('div', { className: 'pw-form-grid' }, h('label', { className: 'pw-field' }, h('span', { className: 'pw-label' }, 'Модель продаж'), h('select', { value: calc.model, 'aria-label': 'Модель продаж', onChange: e => setCalc(current => ({ ...current, model: e.target.value, commission: e.target.value === store.products.find(p => p.id === calc.id).model ? store.products.find(p => p.id === calc.id).commission : '' })) }, ['FBW', 'FBS', 'DBS'].map(model => h('option', { key: model }, model))), h('small', null, 'При смене укажите тариф')),
              field(calc, setter, 'commission', 'Комиссия по предмету', '%', 'Сценарная, уточните в WB', { max: 99.99 }),
              field(calc, setter, 'options', 'Опции тарифа', '%', 'Доплата к комиссии', { max: 99.99 }),
              field(calc, setter, 'acquiring', 'Платёжные услуги', '%', 'План от цены продавца', { max: 99.99 }),
              field(calc, setter, 'tax', 'Налог · сценарий', '%', 'План от цены продавца', { max: 99.99 })),
            h('p', { className: 'pw-help' }, 'Плановая модель без отдельного расчёта НДС. Фактические удержания, базу налога и платёжные услуги сверяют по отчётам. ', sourceLink(SOURCES[2], 'Проверить тариф'))),
          h('div', { className: 'pw-panel pw-form-panel' }, h('div', { className: 'pw-step-title' }, h('span', null, '03'), h('h2', null, 'Расходы на один выкуп')),
            h('div', { className: 'pw-form-grid' },
              field(calc, setter, 'cost', 'Себестоимость', '₽'), field(calc, setter, 'packaging', 'Упаковка', '₽'),
              field(calc, setter, 'logistics', 'Доставка заказа', '₽', 'На одну отправку'), field(calc, setter, 'reverseLogistics', 'Обратная логистика', '₽', 'На один невыкуп'),
              field(calc, setter, 'buyout', 'Процент выкупа', '%', 'Для расчёта логистики', { min: 0.01, max: 100 }),
              field(calc, setter, 'storage', 'Хранение', '₽', 'На выкуп'), field(calc, setter, 'ads', 'Реклама', '₽', 'На выкуп'), field(calc, setter, 'other', 'Другие расходы', '₽', 'На выкуп')),
            h('details', { className: 'pw-method' }, h('summary', null, 'Как учитываются невыкупы'), h('p', null, 'Логистика на один выкуп = [доставка заказа + (1 − доля выкупа) × обратная доставка] / доля выкупа. При выкупе 50% учитываются две доставки и один возврат. Возвраты после выкупа, повреждения и разовые удержания добавьте в другие расходы.'))),
          h('div', { className: 'pw-panel pw-form-panel' }, h('div', { className: 'pw-step-title' }, h('span', null, '04'), h('h2', null, 'Цель и защита цены')), ruleFields(calc, setter)),
          result.valid && h('div', { className: 'pw-panel pw-sensitivity' }, h('h2', null, 'Если изменить цену'), h('div', null, [-0.1, 0, 0.1].map(delta => {
            const price = money(result.seller * (1 + delta));
            const profit = price * (1 - result.rate) - result.costs;
            return button([h('small', { key: 'l' }, delta === 0 ? 'Текущая' : (delta > 0 ? '+' : '−') + '10%'), h('strong', { key: 'p' }, rub(price)), h('span', { key: 'm', className: profit < 0 ? 'pw-text-loss' : '' }, 'маржа ' + pct(profit / price * 100))], () => setCalc(current => recommend(current, price)), delta === 0 ? 'pw-scenario-active' : '', { key: delta });
          })))),
        h('div', { className: 'pw-calc-output' }, h(Result, { product: calc, onRecommend: target => setCalc(current => recommend(current, target)) }),
          button([icon('fact_check'), 'Проверить и сохранить'], () => openPreview([{ id: calc.id, revision: calc.revision, patch: calc }], 'Расчёт и настройка цены'), 'pw-btn-primary pw-save-calc', { disabled: !result.valid }),
          h('p', { className: 'pw-help' }, 'Параметры применяются к выбранному товару только после проверки.')));
    }

    function tariffs() {
      return h('section', { className: 'pw-tariffs', 'aria-label': 'Комиссии и СПП' },
        h('div', { className: 'pw-panel pw-rate-directory' },
          h('div', { className: 'pw-panel-heading' }, h('div', null, h('h2', null, 'Комиссии по категориям'), h('p', null, 'Ставки текущего демо-сценария. Не являются актуальной таблицей WB.')),
            h('select', { value: ratesModel, onChange: e => setRatesModel(e.target.value), 'aria-label': 'Модель в справочнике комиссий' }, ['FBW', 'FBS', 'DBS'].map(model => h('option', { key: model }, model)))),
          h('div', { className: 'pw-info-note' }, icon('info'), h('p', null, 'Точный тариф зависит от предмета WB, модели и действующих условий. Родительской категории недостаточно. ', sourceLink(SOURCES[2], 'Открыть официальные тарифы'))),
          h('div', { className: 'pw-table-scroll' }, h('table', { className: 'pw-table pw-rate-table' }, h('thead', null, h('tr', null, ['Категория демо-каталога', 'Товаров', 'Комиссия · сценарий', ''].map(title => h('th', { key: title, scope: 'col' }, title)))), h('tbody', null, categories.map(cat => {
            const all = store.products.filter(p => p.category === cat);
            const matching = all.filter(p => p.model === ratesModel);
            const rates = matching.map(p => p.commission);
            const text = !rates.length ? 'Не задана' : Math.min(...rates) === Math.max(...rates) ? pct(rates[0]) : pct(Math.min(...rates)) + '–' + pct(Math.max(...rates));
            return h('tr', { key: cat }, h('td', null, h('strong', null, cat), cat === 'Аксессуары' && h('small', null, 'В WB нужен точный предмет')), h('td', null, all.length), h('td', { className: 'pw-money' }, text, h('small', null, matching.length ? ratesModel + ' · демо' : 'Введите ставку вручную')), h('td', null, button('Настроить', () => { const p = matching[0] || all[0]; setCalc({ ...p, model: ratesModel, commission: matching.length ? p.commission : '' }); changeTab('calculator'); }, 'pw-btn-quiet', { 'aria-label': 'Настроить комиссию ' + cat })));
          })))),
          h('p', { className: 'pw-directory-note' }, 'Нет одной комиссии на все категории. В рабочем продукте ставки нужно загружать из кабинета/API и хранить с датой действия. В этом моке автоматического обновления нет.')),
        h('div', { className: 'pw-panel pw-spp-tool' }, h('span', { className: 'pw-eyebrow' }, 'ПОЧЕМУ ЦЕНЫ ОТЛИЧАЮТСЯ'), h('h2', null, 'Как определить СПП'),
          h('p', null, 'WB задаёт свою скидку. Для оценки сравните вашу цену после всех скидок продавца с ценой покупателя в одном контексте.'),
          h('div', { className: 'pw-form-grid pw-form-grid-two' }, h(Field, { label: 'Цена продавца после скидок', value: observationSeller, onChange: value => { setObservationSeller(value); setContextConfirmed(false); }, suffix: '₽' }), h(Field, { label: 'Цена покупателя', value: observationBuyer, onChange: value => { setObservationBuyer(value); setContextConfirmed(false); }, suffix: '₽' })),
          h('div', { className: 'pw-spp-result', 'aria-live': 'polite' }, h('small', null, 'Оценка совокупной платформенной скидки'), h('strong', { 'data-testid': 'observed-spp' }, pct(observedDiscount)), h('code', null, '(1 − цена покупателя / цена продавца) × 100%')),
          observedDiscount == null && h('p', { className: 'pw-warning-text' }, 'Обе цены должны быть больше нуля. Цена покупателя не может быть выше цены продавца.'),
          h('label', { className: 'pw-checkbox-label' }, h('input', { type: 'checkbox', checked: contextConfirmed, onChange: e => setContextConfirmed(e.target.checked) }), h('span', null, h('strong', null, 'Сравниваю одинаковые условия'), h('small', null, 'Тот же товар, размер, регион и момент времени; без кошелька и других дополнительных скидок.'))),
          button('Использовать оценку в калькуляторе', () => { setCalc(current => ({ ...current, spp: Math.round(observedDiscount * 100) / 100 })); changeTab('calculator'); }, 'pw-btn-primary', { disabled: observedDiscount == null || !contextConfirmed }),
          h('p', { className: 'pw-help' }, 'Если дополнительные скидки не исключены, это их общий эффект. Чистую СПП таким сравнением выделить нельзя. В отчёте поле «Платформенные скидки, %» также объединяет несколько скидок WB. ', sourceLink(SOURCES[5], 'Поля отчёта'))),
        h('div', { className: 'pw-panel pw-source-panel' }, h('div', { className: 'pw-panel-heading' }, h('div', null, h('h2', null, 'Что заложено в расчёт'), h('p', null, 'Официальные источники · проверка ' + CHECKED_ON))), h('div', { className: 'pw-source-grid' }, SOURCES.map(source => h('article', { key: source.url }, sourceLink(source), h('p', null, source.text)))),
          h('details', { className: 'pw-method' }, h('summary', null, 'Формулы, допущения и границы расчёта'), h('p', null, 'Цена продавца = базовая цена × (1 − скидка продавца) × (1 − скидка Клуба). Цена покупателя = цена продавца × (1 − сценарий СПП). Прибыль = цена продавца × (1 − комиссия − опции − платёжные услуги − налог) − расходы на один выкуп.'), h('p', null, 'Цена для целевой маржи = расходы / (1 − процентные расходы − целевая маржа). Целевой порог — максимум этой цены и ручного минимума. Платформенная скидка не вычитается из прибыли повторно. Ставки, НДС, возвраты после выкупа и персональные условия нужно сверить с фактическими отчётами. Это план, а не расчёт бухгалтерской выплаты.'))));
    }

    function history() {
      return h('section', { className: 'pw-panel', 'aria-label': 'История изменений цены' }, h('div', { className: 'pw-panel-heading' }, h('div', null, h('h2', null, 'История изменений'), h('p', null, 'Сохранения и откаты в этом браузере · время Москвы'))),
        !store.history.length ? h('div', { className: 'pw-empty' }, icon('history'), h('h3', null, 'Здесь появятся ваши изменения'), h('p', null, 'Измените цену товара или примените расчёт. Сохраним прежние значения и возможность отката.'), button('К товарам', () => changeTab('manage'))) :
          h('div', { className: 'pw-history' }, store.history.map(entry => h('article', { key: entry.id }, h('div', { className: 'pw-history-heading' }, h('span', { className: 'pw-history-symbol' }, icon(entry.kind === 'rollback' ? 'undo' : 'price_change')), h('div', null, h('h3', null, entry.title), h('small', null, date(entry.at) + ' МСК · Вы · демо')), badge(entry.rolledBack ? 'Отменено' : entry.kind === 'rollback' ? 'Откат сохранён' : 'Сохранено', entry.rolledBack ? '' : 'ok'), canRollback(store, entry) && button([icon('undo'), 'Откатить'], () => {
            const changes = entry.changes.map(c => ({ id: c.id, revision: c.after.revision, patch: c.before }));
            openPreview(changes, 'Откат: ' + entry.title, { rollbackId: entry.id });
          })), h('div', { className: 'pw-history-rows' }, entry.changes.map(change => h('div', { key: change.id }, h('span', null, change.after.name), h('span', { className: 'pw-money' }, rub(calculate(change.before).seller), icon('arrow_forward'), h('strong', null, rub(calculate(change.after).seller))), h('small', null, 'маржа ' + pct(calculate(change.before).margin) + ' → ' + pct(calculate(change.after).margin))))),
            entry.kind === 'change' && !entry.rolledBack && !canRollback(store, entry) && h('p', { className: 'pw-help' }, 'Откат недоступен: после этой операции товар изменяли снова.')))));
    }

    return h('div', { className: 'pw', ref: rootRef, 'data-screen-label': 'Цены' },
      h('header', { className: 'pw-command' }, h('div', { className: 'pw-command-icon', 'aria-hidden': true }, icon('price_change')), h('div', { className: 'pw-command-copy' }, h('div', { className: 'pw-eyebrow' }, 'ЦЕНА ПОД КОНТРОЛЕМ'), h('h1', null, 'Продавайте с нужной маржой'), h('p', null, 'Цена, скидки и расходы — в одном расчёте.')), button([icon('calculate'), 'Рассчитать цену'], () => changeTab('calculator'), 'pw-btn-mint')),
      h('div', { className: 'pw-demo-note' }, badge('Демо', 'neutral'), h('span', null, 'Цены, комиссии и СПП — сценарные. Сохранения действуют в этом браузере; связи с WB нет.')),
      h('nav', { className: 'pw-tabs', 'aria-label': 'Разделы цены' }, [['manage', 'tune', 'Управление ценами'], ['calculator', 'calculate', 'Калькулятор'], ['tariffs', 'percent', 'Комиссии и СПП'], ['history', 'history', 'История']].map(([id, sym, label]) => button([icon(sym), label, id === 'history' && store.history.length > 0 ? h('span', { className: 'pw-tab-count', key: 'n' }, store.history.length) : null], () => changeTab(id), tab === id ? 'pw-tab-current' : '', { key: id, 'aria-current': tab === id ? 'page' : undefined }))),
      message && !preview && h('div', { className: 'pw-message', role: 'status' }, icon('info'), h('span', null, message), button(icon('close'), () => setMessage(''), 'pw-btn-icon', { 'aria-label': 'Скрыть сообщение' })),
      tab === 'manage' && h('div', { className: 'pw-kpis' }, [
        ['Всего товаров', store.products.length, 'В вашем демо-каталоге', 'inventory_2', 'all', ''],
        ['Ниже целевого порога', risky.length, 'Проверьте цену и расходы', 'shield', 'risk', 'amber'],
        ['Продаются в минус', losses.length, 'Расходы превышают цену', 'trending_down', 'loss', 'red'],
        ['Средняя маржа по SKU', pct(metrics.reduce((sum, x) => sum + x.r.margin, 0) / metrics.length), 'После расходов на выкуп', 'monitoring', 'all', 'green'],
      ].map(([label, value, hint, sym, next, tone]) => h('button', { key: label, className: 'pw-kpi ' + tone, onClick: () => setFilter(next), type: 'button' }, h('span', { className: 'pw-kpi-label' }, icon(sym), label), h('strong', null, value), h('small', null, hint)))),
      tab === 'manage' ? manage() : tab === 'calculator' ? calculator() : tab === 'tariffs' ? tariffs() : history(),
      editor && !preview && h(Dialog, { title: 'Изменить цену', subtitle: editor.name, onClose: () => setEditor(null) }, h('div', { className: 'pw-dialog-body' }, priceFields(editor, setEditor), calculate(editor).valid ? h(PriceFlow, { product: editor, result: calculate(editor) }) : h('p', { className: 'pw-warning-text', role: 'alert' }, calculate(editor).errors.join(' ')), ruleFields(editor, setEditor), button([icon('calculate'), 'Рассчитать все расходы'], () => startCalculator(editor), 'pw-btn-quiet')), h('footer', { className: 'pw-dialog-footer' }, button('Отмена', () => setEditor(null)), button('Проверить изменение', () => openPreview([{ id: editor.id, revision: editor.revision, patch: editor }], 'Изменение цены ' + editor.code), 'pw-btn-primary', { disabled: !calculate(editor).valid }))),
      bulkOpen && !preview && h(Dialog, { title: 'Массовое изменение цены', subtitle: 'Выбрано товаров: ' + selected.size, onClose: () => setBulkOpen(false) }, h('div', { className: 'pw-dialog-body' }, h(Field, { label: 'Изменение цены продавца', value: bulkPercent, onChange: setBulkPercent, min: -99.99, suffix: '%', hint: 'Например, 5 для повышения или −5 для снижения. Скидки сохранятся, базовая цена пересчитается.' })), h('footer', { className: 'pw-dialog-footer' }, button('Отмена', () => setBulkOpen(false)), button('Посмотреть результат', () => bulk('percent'), 'pw-btn-primary'))),
      preview && h(Dialog, { title: preview.rollbackId ? 'Проверка отката' : 'Проверьте изменение', subtitle: preview.title + ' · ' + preview.rows.length + ' товаров', onClose: () => { setPreview(null); setMessage(''); }, wide: true },
        h('div', { className: 'pw-dialog-body' }, h('div', { className: 'pw-info-note' }, icon('visibility'), h('p', null, 'Сохраним цены и параметры только в демо-магазине. Реальные цены Wildberries не изменятся.')),
          h('div', { className: 'pw-preview-list' }, preview.rows.map(row => h('article', { key: row.id }, h(Product, { product: row.after }), h('div', { className: 'pw-preview-numbers' }, h('div', null, h('small', null, 'Цена продавца'), h('span', { className: 'pw-money' }, rub(row.oldResult.seller), icon('arrow_forward'), h('strong', null, rub(row.result.seller)))), h('div', null, h('small', null, 'Прибыль на выкуп'), h('strong', { className: row.result.profit < 0 ? 'pw-text-loss' : 'pw-text-green' }, rub(row.result.profit))), h('div', null, h('small', null, 'Маржа'), h('strong', null, pct(row.oldResult.margin) + ' → ' + pct(row.result.margin))), badge(statusText[row.result.status], row.result.status)), h('small', { className: 'pw-preview-meta' }, 'База ' + rub(row.after.base) + ' · скидка ' + pct(row.after.discount) + ' · клуб ' + pct(row.after.club) + ' · минимум автоакции ' + rub(row.after.floor) + ' · блокировка ' + (row.after.blockAuto ? 'включена' : 'выключена'))))),
          preview.rows.some(row => row.result.status !== 'ok') && h('label', { className: 'pw-risk-confirm' }, h('input', { type: 'checkbox', checked: acknowledged, onChange: e => setAcknowledged(e.target.checked) }), h('span', null, 'В выборке есть цены ниже целевого порога или с убытком. Сохранить этот сценарий осознанно.')),
          message && h('p', { className: 'pw-warning-text', role: 'alert' }, message)),
        h('footer', { className: 'pw-dialog-footer' }, button('Назад', () => { setPreview(null); setMessage(''); }), button(preview.rollbackId ? 'Подтвердить откат в демо' : 'Сохранить в демо', confirm, 'pw-btn-primary', { disabled: preview.rows.some(row => row.result.status !== 'ok') && !acknowledged }))));
  };
}
