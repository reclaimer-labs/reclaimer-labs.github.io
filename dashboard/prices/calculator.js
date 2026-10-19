import { calculate, BASE_LABELS, UNIT_LABELS, SOURCES, priceScenario, reconcile, ACTUAL_KEYS } from './model.js';
import { COMMISSION_SNAPSHOT, SUBJECTS, tariffFor, withTariff } from './tariffs.js';

export function createPricingPanels(React, ui) {
  const h = React.createElement;
  const { Field, Select, TextField, button, badge, icon, sourceLink, rub, pct } = ui;
  const choices = keys => keys.map(key => [key, UNIT_LABELS[key]]);
  const actualLabels = { revenue: 'Выручка с НДС и компенсациями', commission: 'Комиссия и опции', acquiring: 'Платёжные услуги', logistics: 'Вся логистика', storage: 'Хранение', ads: 'Реклама', tax: 'Налог без НДС', vat: 'НДС за вычетом входного', costs: 'Себестоимость, упаковка, прочее' };
  const block = (step, title, children) => h('section', { className: 'pw-panel pw-form-panel' }, h('div', { className: 'pw-step-title' }, h('span', null, step), h('h2', null, title)), ...children);

  function CalculatorInputs({ product: p, setProduct }) {
    const patch = value => setProduct(current => ({ ...current, ...value }));
    const field = (key, label, hint, options = {}) => h(Field, { key, label, value: p[key], suffix: '₽', onChange: value => patch({ [key]: value }), hint, ...options });
    const select = (key, label, values, hint, onChange) => h(Select, { key, label, value: p[key], choices: values, hint, onChange: onChange || (value => patch({ [key]: value })) });
    const rate = (key, label) => h('div', { className: 'pw-fee-row', key },
      field(p[key + 'Basis'] === 'fixed' ? key + 'Fixed' : key, label, null, {
        suffix: p[key + 'Basis'] === 'fixed' ? '₽' : '%', max: p[key + 'Basis'] === 'fixed' ? undefined : 99.99,
        onChange: value => patch({ [p[key + 'Basis'] === 'fixed' ? key + 'Fixed' : key]: value, ...(key === 'commission' ? { commissionSource: 'manual' } : {}) }),
      }), select(key + 'Basis', 'База: ' + label.toLowerCase(), Object.entries(BASE_LABELS), null, value => patch({ [key + 'Basis']: value, ...(key === 'commission' && value === 'fixed' ? { commissionSource: 'manual' } : {}) })));
    const unitCost = (key, label, units) => h('div', { className: 'pw-fee-row', key }, field(key, label), select(key + 'Unit', 'Единица: ' + label.toLowerCase(), choices(units)));
    const r = calculate(p), snapshot = p.commissionSource === COMMISSION_SNAPSHOT.id;
    return h(React.Fragment, null,
      block('02', 'Комиссии и их базы', [
        h('div', { className: 'pw-form-grid pw-form-grid-two', key: 'subject' },
          select('subject', 'Предмет WB', [['', 'Предмет не выбран'], ...SUBJECTS.map(row => [row.subject, row.parent + ' → ' + row.subject])], 'Выбран для демо. Сверьте с карточкой WB.', value => setProduct(current => withTariff(current, { subject: value }))),
          select('model', 'Модель продаж', ['FBW', 'FBS', 'DBS'].map(model => [model, model]), null, value => setProduct(current => ({ ...withTariff(current, { model: value }), ...(value !== 'FBW' ? { logisticsSource: 'manual' } : {}) })))),
        h('div', { className: 'pw-tariff-stamp', key: 'stamp' }, badge(snapshot ? 'Снимок WB' : 'Ручная ставка', snapshot ? 'ok' : 'neutral'), h('span', null, snapshot ? 'Таблица с 24.08.2026 · проверена 19.10.2026' : 'Ставка вашего сценария; автоматического обновления нет.'),
          !snapshot && tariffFor(p.subject, p.model) != null && button('Применить снимок ' + pct(tariffFor(p.subject, p.model)), () => setProduct(current => withTariff(current)), 'pw-btn-quiet')),
        rate('commission', 'Комиссия по предмету'), rate('options', 'Опции тарифа'), rate('acquiring', 'Платёжные услуги'),
        h('p', { className: 'pw-help', key: 'help' }, 'Проценты применяются к выбранной базе. Рубли — удержание на одну сохранённую продажу. Суммы из отчёта уже могут учитывать скидки и возвраты: не вычитайте их повторно. ', sourceLink(SOURCES[5], 'Поля отчёта')),
      ]),
      block('03', 'Расходы и движение заказов', [
        h('div', { className: 'pw-form-grid pw-form-grid-two', key: 'purchase' }, field('cost', 'Себестоимость', 'Один товар, оставшийся у покупателя'), field('returnLoss', 'Потеря при возврате после выкупа', 'На один такой возврат; 0, если товар пригоден')),
        unitCost('packaging', 'Упаковка', ['dispatch', 'retained']),
        h('div', { className: 'pw-form-grid pw-form-grid-three', key: 'events' },
          field('cancelRate', 'Отмены до отправки', 'Доля всех заказов; доставки нет', { suffix: '%', max: 99.99 }),
          field('buyout', 'Процент выкупа', 'Из отправленных заказов', { suffix: '%', min: 0.01, max: 100 }),
          field('returnRate', 'Возвраты после выкупа', 'Доля выкупленных товаров', { suffix: '%', max: 99.99 })),
        r.valid && h('div', { className: 'pw-cohort-note', key: 'cohort' }, icon('route'), h('p', null, 'На сохранённую продажу: ', h('strong', null, r.dispatches.toFixed(2) + ' отправки'), ', ' + r.failedReturns.toFixed(2) + ' невыкупа и ' + r.postReturns.toFixed(2) + ' возврата после покупки.')),
        h('details', { className: 'pw-method pw-logistics-method', key: 'logistics', open: true }, h('summary', null, 'Тарифы доставки · ' + (p.logisticsSource === 'manual' ? 'вручную' : 'снимок новой поставки FBW')),
          select('logisticsSource', 'Источник логистики', [['manual', 'Свои тарифы / существующая поставка'], ['newFbw', 'Снимок · новая поставка FBW, РФ, обычный товар']], 'СГТ, КГТ, индивидуальные и исторические условия — вручную.'),
          p.logisticsSource === 'newFbw' ? h(React.Fragment, null,
            h('div', { className: 'pw-form-grid pw-form-grid-two' }, h(TextField, { label: 'Дата новой поставки', type: 'date', value: p.supplyDate, onChange: value => patch({ supplyDate: value }) }), field('liters', 'Объём в упаковке', 'Длина × ширина × высота в см / 1000', { suffix: 'л', min: 0.001 })),
            r.valid && h('p', { className: 'pw-help' }, 'На отправку: ' + rub(r.forward) + '. Обратная: ' + rub(r.reverse) + '. Коэффициент 170% применяется только к прямому тарифу.'),
            h('p', { className: 'pw-help' }, 'Снимок проверен 19.10.2026. Условия новых поставок с 15.08.2026; ИРП и старый индекс локализации не добавляются. Для будущей поставки перепроверьте тарифы. ', sourceLink(SOURCES[6], 'Методика WB')))
          : h('div', { className: 'pw-form-grid pw-form-grid-three' }, field('logistics', 'Доставка заказа', 'На отправку'), field('reverseLogistics', 'Обратная при невыкупе', 'На один невыкуп'), field('returnLogistics', 'Обратная после выкупа', 'На один возврат после покупки'))),
        h('details', { className: 'pw-method pw-extra-costs', key: 'costs', open: true }, h('summary', null, 'Хранение, реклама и прочие расходы'),
          unitCost('storage', 'Хранение', ['retained', 'day', 'period']),
          p.storageUnit === 'day' && field('storageDays', 'Дней хранения на продажу', 'Распределённые товаро-дни на одну сохранённую продажу', { suffix: 'дн.' }),
          unitCost('ads', 'Реклама', ['retained', 'order', 'period']), unitCost('other', 'Другие расходы', ['retained', 'dispatch', 'order', 'period']),
          ['storageUnit', 'adsUnit', 'otherUnit'].some(key => p[key] === 'period') && field('periodSales', 'Сохранённых продаж за период', 'Общий расход периода делится один раз', { suffix: 'шт.', min: 1, step: 1 })),
        h('p', { className: 'pw-help', key: 'help' }, 'Выкуп и возвраты задавайте по завершённой когорте. Закупка пригодного возврата не списывается заново. Невозмещённые комиссии и дополнительные потери внесите в прочие расходы.'),
      ]),
      block('04', 'Налоговый сценарий', [
        h('div', { className: 'pw-form-grid pw-form-grid-two', key: 'taxprofile' },
          select('taxProfile', 'Модель налога', [['income', 'Процент от дохода'], ['profit', 'Доходы минус признанные расходы'], ['manual', 'Своя сумма на продажу']]),
          select('vatRate', 'НДС внутри цены', [[0, 'Без НДС / освобождение'], [5, '5% · без вычета'], [7, '7% · без вычета'], [10, '10% · при наличии основания'], [22, '22%']], 'Цены и затраты введены с НДС.', value => patch({ vatRate: Number(value), vatDeductible: false, inputVat: 0 }))),
        p.taxProfile === 'manual' ? field('taxFixed', 'Налог на сохранённую продажу', 'Сумма вашего расчёта, без НДС') :
          h('div', { className: 'pw-form-grid pw-form-grid-two', key: 'taxrate' }, field('tax', 'Ставка налога', 'Выберите по своему режиму', { suffix: '%', max: 99.99 }), select('taxBasis', 'База дохода для налога', [['seller', 'Цена продавца без НДС'], ['buyer', 'Цена покупателя без НДС']], 'Компенсации WB сверяйте с документами.')),
        p.taxProfile === 'profit' && field('deductibleCosts', 'Признанные расходы для налога', 'На сохранённую продажу, без вычитаемого НДС; подтвердите документами.'),
        [10, 22].includes(p.vatRate) && h('div', { className: 'pw-vat-input', key: 'inputvat' },
          h('label', { className: 'pw-checkbox-label' }, h('input', { type: 'checkbox', checked: p.vatDeductible, onChange: e => patch({ vatDeductible: e.target.checked, inputVat: e.target.checked ? p.inputVat : 0 }) }), h('span', null, h('strong', null, 'Есть право на вычет входного НДС'), h('small', null, 'Указывайте только подтверждённую сумму на эту продажу.'))),
          p.vatDeductible && field('inputVat', 'Входной НДС к вычету', 'Уже содержится в введённых затратах; отдельным расходом не добавляется.')),
        h('p', { className: 'pw-help', key: 'vathelp' }, 'НДС внутри цены = цена × ставка / (100 + ставка). Например, 1 000 ₽ без НДС + 22% = 1 220 ₽; НДС внутри 1 220 ₽ равен 220 ₽.'),
        h('details', { className: 'pw-method', key: 'taxlimits' }, h('summary', null, 'Границы налогового плана'), h('p', null, 'Это оценка на единицу. УСН не определяет освобождение от НДС автоматически. Годовой минимальный налог, лимиты режима, страховые взносы, региональные льготы, сроки признания и возмещение НДС в денежном потоке здесь не рассчитываются. Их можно распределить своей суммой налога. При убытке в модели «доходы минус расходы» налог равен нулю до годовой сверки. ', sourceLink(SOURCES[7], 'Условия ФНС'))),
      ]));
  }

  function Scenarios({ product, setProduct }) {
    const result = calculate(product);
    if (!result.valid) return null;
    return h('section', { className: 'pw-panel pw-sensitivity' }, h('h2', null, 'Цена и необходимый объём продаж'),
      h('p', { className: 'pw-help' }, 'Сколько продаж нужно для прежнего вклада при неизменных удельных переменных расходах. Это условие окупаемости, не прогноз спроса.'),
      h('div', null, [-10, 0, 10].map(delta => {
        const scenario = priceScenario(product, delta);
        if (!scenario) return h('div', { key: delta, className: 'pw-scenario-unavailable' }, delta + '%: вне допустимой цены');
        const { result: next, requiredVolume } = scenario;
        const volume = requiredVolume == null ? 'Для убыточного вклада не считается' : 'Для прежнего вклада: ' + (requiredVolume === 1 ? 'тот же объём' : (requiredVolume > 1 ? '+' : '−') + pct(Math.abs(requiredVolume - 1) * 100) + ' продаж');
        return button([h('small', { key: 'label' }, delta === 0 ? 'Текущая' : (delta > 0 ? '+' : '−') + Math.abs(delta) + '%'), h('strong', { key: 'price' }, rub(next.seller)), h('span', { key: 'profit', className: next.profit < 0 ? 'pw-text-loss' : '' }, 'Прибыль ' + rub(next.profit)), h('span', { key: 'volume', className: 'pw-volume' }, volume)], () => setProduct(scenario.product), delta === 0 ? 'pw-scenario-active' : '', { key: delta });
      })), result.periodCosts > 0 && h('p', { className: 'pw-help' }, 'Постоянные затраты периода исключены из удельного вклада. Не вычитайте их повторно при расчёте прибыли периода.'));
  }

  function FactPanel({ product: p, setProduct }) {
    const actual = p.actual, comparison = reconcile(p);
    const change = (key, value) => setProduct(current => ({ ...current, actual: { ...current.actual, [key]: value } }));
    return h('details', { className: 'pw-panel pw-form-panel pw-fact-panel' }, h('summary', null, h('span', null, 'План и отчёт'), badge(actual ? comparison.valid ? 'Ручная сверка' : 'Черновик' : 'Нет данных', 'neutral')),
      h('p', { className: 'pw-help' }, 'Сравните текущий план с суммами своего отчёта за один период и ту же завершённую когорту. Подключения к WB нет.'),
      !actual ? button('Добавить данные отчёта', () => setProduct(current => ({ ...current, actual: { from: '', to: '', source: '', units: 0, closed: false, ...Object.fromEntries(ACTUAL_KEYS.map(key => [key, 0])) } }))) :
        h(React.Fragment, null,
          h('div', { className: 'pw-form-grid pw-form-grid-two' }, h(TextField, { label: 'Начало периода отчёта', type: 'date', value: actual.from, onChange: value => change('from', value) }), h(TextField, { label: 'Конец периода отчёта', type: 'date', value: actual.to, onChange: value => change('to', value) }), h(TextField, { label: 'Источник сумм отчёта', value: actual.source, onChange: value => change('source', value), hint: 'Номер отчёта, файл или документ' }), h(Field, { label: 'Сохранённых продаж в отчёте', value: actual.units, min: 1, step: 1, suffix: 'шт.', onChange: value => change('units', value) })),
          h('p', { className: 'pw-help' }, 'Все суммы ниже — за весь период, после сторно возвратов. Выручка до удержаний WB, с компенсациями. Комиссия, платёжные услуги и логистика вводятся отдельными суммами. Нули подтвердите по документам.'),
          h('div', { className: 'pw-form-grid pw-form-grid-two' }, ACTUAL_KEYS.map(key => h(Field, { key, label: actualLabels[key] + ' · отчёт', value: actual[key], suffix: '₽', min: key === 'vat' ? null : 0, onChange: value => change(key, value) }))),
          h('label', { className: 'pw-checkbox-label' }, h('input', { type: 'checkbox', checked: actual.closed, onChange: e => change('closed', e.target.checked) }), h('span', null, h('strong', null, 'Проверены все суммы и завершена когорта'), h('small', null, 'Нет ожидаемых возвратов; расходы, налог и компенсации относятся к тем же продажам.'))),
          comparison.valid ? h('div', { className: 'pw-reconciliation' }, h('div', { className: 'pw-fact-profit' }, h('span', null, 'Прибыль по введённым суммам / продажа'), h('strong', { 'data-testid': 'actual-profit' }, rub(comparison.profit))),
            h('div', { className: 'pw-table-scroll', tabIndex: 0, role: 'region', 'aria-label': 'Сверка с отчётом, прокрутка по горизонтали' }, h('table', { className: 'pw-table pw-reconcile-table' }, h('thead', null, h('tr', null, ['На одну продажу', 'План', 'Введено', 'Разница'].map(label => h('th', { key: label }, label)))), h('tbody', null, comparison.rows.map(row => h('tr', { key: row.key }, h('td', null, actualLabels[row.key]), h('td', null, rub(row.plan)), h('td', null, rub(row.actual)), h('td', { className: (row.key === 'revenue' ? row.delta < 0 : row.delta > 0) ? 'pw-text-loss' : '' }, rub(row.delta))))))),
            h('p', { className: 'pw-help' }, 'Отклонение прибыли от текущего плана: ' + rub(comparison.delta) + '. Суммы введены вручную и не подтверждены подключением к WB.')) : h('p', { className: 'pw-help', role: 'status' }, comparison.errors.join(' ')),
          button('Убрать данные отчёта', () => setProduct(current => ({ ...current, actual: null })), 'pw-btn-quiet'),
          h('p', { className: 'pw-help' }, 'Данные отчёта сохраняются вместе со сценарием кнопкой «Проверить и сохранить».')));
  }

  function TariffDirectory({ products, model, setModel, onChoose }) {
    return h('div', { className: 'pw-panel pw-rate-directory' },
      h('div', { className: 'pw-panel-heading' }, h('div', null, h('h2', null, 'Снимок комиссий по предметам WB'), h('p', null, 'Дата в таблице: 24.08.2026 · проверка 19.10.2026')),
        h(Select, { label: 'Модель в справочнике комиссий', value: model, onChange: setModel, choices: ['FBW', 'FBS', 'DBS'].map(value => [value, value]) })),
      h('div', { className: 'pw-info-note' }, icon('verified'), h('p', null, '14 проверенных предметов из официальной PDF. Снимок не обновляется автоматически; индивидуальные условия продавца могут отличаться. Предметы демо-товаров выбраны для сценария. ', sourceLink(SOURCES[2], 'Открыть PDF WB'))),
      h('div', { className: 'pw-table-scroll', tabIndex: 0, role: 'region', 'aria-label': 'Справочник комиссий, прокрутка по горизонтали' }, h('table', { className: 'pw-table pw-rate-table' }, h('thead', null, h('tr', null, ['Предмет WB', 'FBW', 'FBS', 'DBS / DBW', 'В демо', ''].map(title => h('th', { key: title }, title)))),
        h('tbody', null, SUBJECTS.map(row => h('tr', { key: row.subject },
          h('td', null, h('strong', null, row.subject), h('small', null, row.parent + ' · стр. ' + row.page)),
          ['FBW', 'FBS', 'DBS'].map(value => h('td', { key: value, className: 'pw-money ' + (value === model ? 'pw-rate-selected' : '') }, pct(row[value]))),
          h('td', null, products.filter(p => p.subject === row.subject).length),
          h('td', null, button('Рассчитать ' + model, () => onChoose(row.subject, model), 'pw-btn-quiet', { 'aria-label': 'Рассчитать ' + row.subject + ' ' + model }))))))),
      h('p', { className: 'pw-directory-note' }, 'Родительской категории недостаточно. В калькуляторе доступны ручная ставка, отдельные базы удержаний и фиксированная сумма в рублях. В PDF DBS и DBW объединены в одну колонку.'));
  }
  return { CalculatorInputs, Scenarios, FactPanel, TariffDirectory };
}
