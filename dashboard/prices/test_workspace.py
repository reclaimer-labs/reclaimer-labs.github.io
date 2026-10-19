"""Price workspace acceptance checks; requires the repository served on localhost:8001."""
import json
import os
from pathlib import Path
import re
import sys
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
BASE = os.environ.get('MARGINPILOT_TEST_URL', 'http://127.0.0.1:8001')
ARTIFACTS = Path(__file__).resolve().parents[3] / 'artifacts' / 'prices'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
KEY = 'marginpilot.prices.v1'

with sync_playwright() as p:
    launch = {'headless': True}
    if sys.platform == 'win32':
        launch['channel'] = os.environ.get('PW_CHANNEL', 'msedge')
    browser = p.chromium.launch(**launch)
    context = browser.new_context(viewport={'width': 1536, 'height': 1100}, accept_downloads=True, reduced_motion='reduce')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def open_prices(target=page):
        target.goto(BASE + '/dashboard/#prices', wait_until='networkidle')
        expect(target.locator('.pw')).to_be_visible()

    def tab(name, target=page):
        target.get_by_role('navigation', name='Разделы цены').get_by_role('button', name=name, exact=False).click()

    def saved(target=page):
        return target.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

    def input_field(scope, name):
        return scope.get_by_label(name, exact=True)

    def edit(code, target=page):
        target.get_by_role('button', name='Изменить цену ' + code, exact=True).click()
        return target.get_by_role('dialog')

    def apply_editor(dialog):
        dialog.get_by_role('button', name='Проверить изменение', exact=True).click()
        return page.get_by_role('dialog')

    open_prices()
    expect(page.locator('.app-sidebar').get_by_text('Цены', exact=True)).to_be_visible()
    expect(page.locator('.pw-table tbody tr')).to_have_count(15)
    page.screenshot(path=str(ARTIFACTS / 'desktop.png'))
    input_field(page, 'Поиск товара').fill('LM-DR-001')
    expect(page.locator('.pw-table tbody tr')).to_have_count(1)
    input_field(page, 'Поиск товара').fill('ничего-не-найдётся')
    expect(page.get_by_text('Товары не найдены', exact=True)).to_be_visible()
    page.get_by_role('button', name='Сбросить фильтры').click()
    expect(page.locator('.pw-table tbody tr')).to_have_count(15)

    dialog = edit('LM-DR-001')
    expect(dialog).to_be_focused()
    page.keyboard.press('Shift+Tab')
    expect(dialog.get_by_role('button', name='Проверить изменение')).to_be_focused()
    input_field(dialog, 'Базовая цена').fill('7000')
    input_field(dialog, 'Скидка продавца').fill('20')
    input_field(dialog, 'Скидка WB Клуба').fill('10')
    preview = apply_editor(dialog)
    expect(preview.get_by_text('5 040 ₽', exact=True)).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'preview.png'))
    preview.get_by_role('button', name='Сохранить в демо', exact=True).click()
    assert saved()['products'][0]['base'] == 7000
    assert saved()['products'][0]['club'] == 10
    assert saved()['products'][0]['revision'] == 2
    page.reload(wait_until='networkidle')
    assert saved()['products'][0]['base'] == 7000
    tab('История')
    expect(page.locator('.pw-history article')).to_have_count(1)
    page.get_by_role('button', name='Откатить', exact=False).click()
    page.get_by_role('checkbox', name=re.compile('В выборке есть цены')).check()
    page.get_by_role('button', name='Подтвердить откат в демо', exact=True).click()
    assert saved()['products'][0]['base'] == 4130
    assert saved()['products'][0]['revision'] == 3
    assert saved()['history'][1]['rolledBack'] is True
    print('PASS edit, focus trap, persistence and rollback')

    tab('Управление ценами')
    page.get_by_role('checkbox', name='Выбрать LM-TR-016', exact=True).check()
    page.get_by_role('checkbox', name='Выбрать LM-TP-019', exact=True).check()
    page.get_by_role('button', name='До целевой маржи', exact=True).click()
    expect(page.locator('.pw-preview-list article')).to_have_count(2)
    page.get_by_role('button', name='Сохранить в демо', exact=True).click()
    economics = page.evaluate('''async key => {
      const {calculate}=await import('./prices/model.js');
      return JSON.parse(localStorage.getItem(key)).products.filter(p=>['p10','p11'].includes(p.id)).map(calculate);
    }''', KEY)
    assert all(row['margin'] >= 15 for row in economics)
    before = saved()
    page.get_by_role('checkbox', name='Выбрать LM-TR-016', exact=True).check()
    page.get_by_role('checkbox', name='Выбрать LM-TP-019', exact=True).check()
    page.get_by_role('button', name='Изменить на %', exact=True).click()
    input_field(page.get_by_role('dialog'), 'Изменение цены продавца').fill('-90')
    page.get_by_role('button', name='Посмотреть результат').click()
    expect(page.get_by_role('button', name='Сохранить в демо', exact=True)).to_be_disabled()
    page.get_by_role('checkbox', name=re.compile('В выборке есть цены')).check()
    expect(page.get_by_role('button', name='Сохранить в демо', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Назад', exact=True).click()
    assert saved() == before
    page.get_by_role('button', name='Снять выбор', exact=True).click()
    print('PASS bulk recommendations, deliberate risk and cancellation')

    tab('Калькулятор')
    output = page.locator('.pw-result-profit').inner_text()
    input_field(page, 'Скидка WB · СПП').fill('50')
    expect(page.locator('.pw-result-profit')).to_have_text(output)
    input_field(page, 'Скидка WB Клуба').fill('2')
    expect(page.get_by_role('button', name='Проверить и сохранить', exact=False)).to_be_disabled()
    input_field(page, 'Скидка WB Клуба').fill('10')
    page.get_by_label('Модель продаж', exact=True).select_option('FBS')
    expect(input_field(page, 'Комиссия по предмету')).to_have_value('48')
    expect(page.get_by_role('button', name='Проверить и сохранить', exact=False)).to_be_enabled()
    input_field(page, 'Комиссия по предмету').fill('31.5')
    input_field(page, 'Целевая маржа').fill('99')
    expect(page.get_by_test_id('target-price')).to_have_text('Недостижима')
    input_field(page, 'Целевая маржа').fill('15')
    input_field(page, 'Процент выкупа').fill('0')
    expect(page.get_by_role('button', name='Проверить и сохранить', exact=False)).to_be_disabled()
    input_field(page, 'Процент выкупа').fill('50')
    input_field(page, 'Себестоимость').fill('-1')
    expect(page.get_by_role('button', name='Проверить и сохранить', exact=False)).to_be_disabled()
    input_field(page, 'Себестоимость').fill('940')
    page.get_by_role('button', name='Установить цену для цели', exact=False).click()
    page.get_by_role('button', name='Проверить и сохранить', exact=False).click()
    page.get_by_role('button', name='Сохранить в демо', exact=True).click()
    assert saved()['products'][0]['model'] == 'FBS'
    assert saved()['products'][0]['commission'] == 31.5
    page.screenshot(path=str(ARTIFACTS / 'calculator.png'))
    print('PASS calculator, sequential discounts, subject/model snapshot and invalid inputs')

    tab('Комиссии и СПП')
    page.get_by_label('Модель в справочнике комиссий', exact=True).select_option('FBS')
    expect(page.locator('.pw-rate-table tbody tr')).to_have_count(14)
    expect(page.locator('.pw-rate-table tbody tr').first).to_contain_text('48%')
    expect(page.locator('.pw-rate-table tbody tr').filter(has_text='Кардиганы')).to_contain_text('46%')
    assert '31,5%' not in page.locator('.pw-rate-table').inner_text()
    input_field(page, 'Цена продавца после скидок').fill('2000')
    input_field(page, 'Цена покупателя').fill('1500')
    expect(page.get_by_test_id('observed-spp')).to_have_text('25%')
    estimate = page.get_by_role('button', name='Использовать оценку в калькуляторе', exact=True)
    expect(estimate).to_be_disabled()
    page.get_by_role('checkbox', name=re.compile('Сравниваю одинаковые условия')).check()
    expect(estimate).to_be_enabled()
    estimate.click()
    expect(input_field(page, 'Скидка WB · СПП')).to_have_value('25')
    tab('Комиссии и СПП')
    input_field(page, 'Цена покупателя').fill('2001')
    expect(page.get_by_test_id('observed-spp')).to_have_text('—')
    expect(page.get_by_role('button', name='Использовать оценку в калькуляторе')).to_be_disabled()
    page.screenshot(path=str(ARTIFACTS / 'tariffs.png'))
    print('PASS official directory stays independent of manual overrides; contextual SPP estimate')

    tab('Управление ценами')
    before = saved()
    page.evaluate('''() => {window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='marginpilot.prices.v1')throw new Error('quota');return window.__setItem.call(this,key,value)}}''')
    dialog = edit('LM-DR-001')
    input_field(dialog, 'Базовая цена').fill('10000')
    apply_editor(dialog).get_by_role('button', name='Сохранить в демо', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Браузер не сохранил')
    assert saved() == before
    page.get_by_role('button', name='Назад', exact=True).click()
    page.keyboard.press('Escape')
    page.evaluate('() => {Storage.prototype.setItem=window.__setItem}')
    print('PASS failed storage never reports success or mutates saved prices')

    stale = context.new_page()
    open_prices(stale)
    dialog = edit('LM-DR-001')
    input_field(dialog, 'Базовая цена').fill('10000')
    apply_editor(dialog).get_by_role('button', name='Сохранить в демо', exact=True).click()
    latest = saved()
    stale_dialog = edit('LM-DR-001', stale)
    input_field(stale_dialog, 'Базовая цена').fill('11000')
    stale_dialog.get_by_role('button', name='Проверить изменение', exact=True).click()
    stale.get_by_role('button', name='Сохранить в демо', exact=True).click()
    expect(stale.get_by_role('alert')).to_contain_text('другой вкладке')
    assert saved() == latest
    stale.close()
    print('PASS another browser tab cannot silently overwrite newer prices')

    input_field(page, 'Поиск товара').fill('LM-DR-001')
    with page.expect_download() as download_info:
        page.get_by_role('button', name='Экспорт CSV', exact=False).click()
    download = download_info.value
    data = Path(download.path()).read_text(encoding='utf-8-sig')
    assert len(data.splitlines()) == 2 and 'LM-DR-001' in data
    assert 'сценарий' in data
    assert 'Источник комиссии' in data and 'База налога' in data
    tab('История')
    expect(page.get_by_text('Откат недоступен: после этой операции товар изменяли снова.', exact=True).first).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'history.png'))
    print('PASS CSV exports the visible selection; stale rollback remains blocked')

    page.evaluate("location.hash='cards'")
    expect(page.locator('.ct')).to_be_visible()
    page.evaluate("location.hash='prices'")
    expect(page.locator('.pw')).to_be_visible()
    for width in [360, 390, 768]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if width < 720:
            mobile = page.get_by_role('navigation', name='Мобильная навигация')
            expect(mobile.get_by_role('button', name='Цены', exact=True)).to_be_visible()
            mobile.get_by_role('button', name='Финансы', exact=True).click()
            expect(page.locator('.pw')).to_have_count(0)
            mobile.get_by_role('button', name='Цены', exact=True).click()
            expect(page.locator('.pw')).to_be_visible()
        if width == 390:
            page.screenshot(path=str(ARTIFACTS / 'mobile.png'))
            tab('Калькулятор')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('.pw-result').scroll_into_view_if_needed()
            page.screenshot(path=str(ARTIFACTS / 'mobile-calculator.png'))
            tab('Управление ценами')
            dialog = edit('LM-DR-001')
            assert dialog.bounding_box()['width'] <= width
            page.screenshot(path=str(ARTIFACTS / 'mobile-editor.png'))
            page.keyboard.press('Escape')
            expect(page.get_by_role('dialog')).to_have_count(0)
    page.set_viewport_size({'width': 1536, 'height': 1100})
    page.reload(wait_until='networkidle')
    expect(page.locator('.pw')).to_be_visible()
    assert page.url.endswith('#prices')
    assert not errors, errors
    print('PASS direct link, hash navigation, Cards/Finance regression and responsive layouts')
    print(json.dumps({'result': 'PASS', 'browser_errors': errors, 'artifacts': str(ARTIFACTS)}, ensure_ascii=False))

    advanced_context = browser.new_context(viewport={'width': 1536, 'height': 1100}, reduced_motion='reduce')
    advanced = advanced_context.new_page()
    advanced.on('pageerror', lambda error: errors.append(str(error)))
    open_prices(advanced)
    tab('Калькулятор', advanced)
    advanced.get_by_label('Модель продаж', exact=True).select_option('DBS')
    expect(input_field(advanced, 'Комиссия по предмету')).to_have_value('45')
    advanced.get_by_label('Модель продаж', exact=True).select_option('FBW')
    advanced.get_by_label('Предмет WB', exact=True).select_option('Кардиганы')
    expect(input_field(advanced, 'Комиссия по предмету')).to_have_value('41.5')
    input_field(advanced, 'Комиссия по предмету').fill('30')
    expect(advanced.locator('.pw-tariff-stamp')).to_contain_text('Ручная ставка')
    advanced.get_by_role('button', name='Применить снимок', exact=False).click()
    expect(input_field(advanced, 'Комиссия по предмету')).to_have_value('41.5')
    advanced.get_by_label('База: платёжные услуги', exact=True).select_option('buyer')
    before_spp = advanced.locator('.pw-result-profit').inner_text()
    input_field(advanced, 'Скидка WB · СПП').fill('40')
    assert advanced.locator('.pw-result-profit').inner_text() != before_spp
    advanced.get_by_label('База: платёжные услуги', exact=True).select_option('seller')
    before_units = advanced.locator('.pw-result-profit').inner_text()
    advanced.get_by_label('Единица: упаковка', exact=True).select_option('retained')
    assert advanced.locator('.pw-result-profit').inner_text() != before_units
    input_field(advanced, 'Возвраты после выкупа').fill('20')
    input_field(advanced, 'Отмены до отправки').fill('10')
    advanced.get_by_label('Источник логистики', exact=True).select_option('newFbw')
    expect(advanced.locator('.pw-logistics-method')).to_contain_text('97,24 ₽')
    expect(advanced.locator('.pw-logistics-method')).to_contain_text('57,2 ₽')
    advanced.get_by_label('Дата новой поставки', exact=True).fill('2026-08-14')
    expect(advanced.get_by_role('button', name='Проверить и сохранить')).to_be_disabled()
    advanced.get_by_label('Дата новой поставки', exact=True).fill('2026-10-19')
    advanced.get_by_label('Модель продаж', exact=True).select_option('FBS')
    expect(advanced.get_by_label('Источник логистики', exact=True)).to_have_value('manual')
    advanced.get_by_label('НДС внутри цены', exact=True).select_option('22')
    advanced.get_by_role('checkbox', name='Есть право на вычет входного НДС', exact=False).check()
    input_field(advanced, 'Входной НДС к вычету').fill('20')
    expect(advanced.locator('.pw-result')).to_contain_text('выручка без НДС')
    advanced.get_by_label('НДС внутри цены', exact=True).select_option('5')
    expect(input_field(advanced, 'Входной НДС к вычету')).to_have_count(0)
    advanced.get_by_label('Модель налога', exact=True).select_option('profit')
    input_field(advanced, 'Признанные расходы для налога').fill('500')
    advanced.get_by_label('Модель налога', exact=True).select_option('manual')
    input_field(advanced, 'Налог на сохранённую продажу').fill('100')
    print('PASS fee bases, units, distinct return events, dated logistics and VAT controls')

    advanced.locator('.pw-fact-panel > summary').click()
    expect(advanced.get_by_test_id('actual-profit')).to_have_count(0)
    advanced.get_by_role('button', name='Добавить данные отчёта').click()
    advanced.get_by_label('Начало периода отчёта', exact=True).fill('2026-09-01')
    advanced.get_by_label('Конец периода отчёта', exact=True).fill('2026-09-30')
    advanced.get_by_label('Источник сумм отчёта', exact=True).fill('Контрольный отчёт 123')
    input_field(advanced, 'Сохранённых продаж в отчёте').fill('10')
    for label, value in [('Выручка с НДС и компенсациями', 20000), ('Комиссия и опции', 5000), ('Платёжные услуги', 400), ('Вся логистика', 0), ('Хранение', 0), ('Реклама', 0), ('Налог без НДС', 1200), ('НДС за вычетом входного', 0), ('Себестоимость, упаковка, прочее', 7000)]:
        advanced.get_by_label(label + ' · отчёт', exact=True).fill(str(value))
    expect(advanced.get_by_test_id('actual-profit')).to_have_count(0)
    advanced.get_by_role('checkbox', name='Проверены все суммы и завершена когорта', exact=False).check()
    expect(advanced.get_by_test_id('actual-profit')).to_have_text('640 ₽')
    advanced.locator('.pw-fact-panel').screenshot(path=str(ARTIFACTS / 'reconciliation.png'))
    advanced.get_by_role('button', name='Установить цену для цели', exact=False).click()
    advanced.get_by_role('button', name='Проверить и сохранить').click()
    advanced.get_by_role('button', name='Сохранить в демо', exact=True).click()
    assert saved(advanced)['products'][0]['actual']['source'] == 'Контрольный отчёт 123'
    advanced.reload(wait_until='networkidle')
    tab('Калькулятор', advanced)
    advanced.locator('.pw-fact-panel > summary').click()
    expect(advanced.get_by_test_id('actual-profit')).to_have_text('640 ₽')
    print('PASS manual report requires cohort confirmation and survives scenario save/reload')
    for width in [360, 390, 768]:
        advanced.set_viewport_size({'width': width, 'height': 844})
        for name in ['Калькулятор', 'Комиссии и СПП']:
            tab(name, advanced)
            assert advanced.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, name)
        if width == 390:
            advanced.screenshot(path=str(ARTIFACTS / 'mobile-tariffs-v2.png'))
    assert not errors, errors
    advanced_context.close()
    print('PASS new pricing panels at 360, 390 and 768 pixels')
    browser.close()
