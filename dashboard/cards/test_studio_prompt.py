"""Product-specific infographic prompts and their persisted image provenance."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1440,'height':1080}, permissions=['clipboard-read','clipboard-write'])
    page = context.new_page()
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8001/dashboard/#cards')
    page.wait_for_load_state('networkidle')
    root=page.locator('.ct')
    root.get_by_label('Выбрать LM-CT-002',exact=True).check()
    root.get_by_label('Выбрать LM-TS-021',exact=True).check()
    root.get_by_role('navigation',name='Разделы контента').get_by_role('button',name='Инфографика',exact=True).click()
    selector=root.get_by_label('Товар',exact=True)
    selector.select_option('p5')
    description=root.get_by_label('Описание товара для инфографики',exact=True)
    original=description.input_value()
    assert original
    description.fill('Бежевый тренч. Пояс в комплекте. Пуговицы в два ряда.')
    root.get_by_label('Пожелания к изображению',exact=True).fill('Светлый фон. Крупно показать пояс.')
    root.get_by_label('Заголовок',exact=True).fill('Тренч с поясом')
    prompt=root.get_by_label('Промпт для инфографики',exact=True)
    text=prompt.input_value()
    assert 'Пуговицы в два ряда.' in text and 'Крупно показать пояс.' in text
    assert 'Тренч с поясом' in text and '900 × 1200' in text
    root.get_by_role('button',name='Копировать промпт',exact=True).click()
    expect(root.get_by_role('button',name='Скопировано',exact=True)).to_be_visible()
    assert page.evaluate('navigator.clipboard.readText()').replace('\r\n','\n')==text
    with page.expect_download() as download:
        root.get_by_role('button',name='Скачать TXT',exact=True).click()
    assert Path(download.value.path()).read_text(encoding='utf-8')==text
    ids=selector.locator('option').evaluate_all('(options)=>options.map(o=>({id:o.value,title:o.textContent}))')
    second=next(item['id'] for item in ids if item['id']!='p5')
    selector.select_option(second)
    assert 'Пуговицы в два ряда.' not in description.input_value()
    selector.select_option('p5')
    assert 'Пуговицы в два ряда.' in description.input_value()
    description.fill('')
    root.get_by_role('button',name='Сгенерировать инфографику',exact=True).click()
    expect(root.get_by_role('alert')).to_contain_text('Заполните описание')
    description.fill('Бежевый тренч. Пояс в комплекте.')
    root.get_by_role('checkbox',name='Применить стиль к выбранным: 2',exact=True).check()
    root.get_by_role('button',name='Сгенерировать инфографику',exact=True).click()
    used_prompt=prompt.input_value()
    root.get_by_role('button',name='Добавить в карточки',exact=True).click()
    state=page.evaluate("JSON.parse(localStorage.getItem('marginpilot.cards.content.v2'))")
    trench=next(c for c in state['cards'] if c['id']=='p5')
    shirt=next(c for c in state['cards'] if c['code']=='LM-TS-021')
    assert trench['images'][-1]['prompt']==used_prompt
    assert trench['images'][-1]['productDescription']=='Бежевый тренч. Пояс в комплекте.'
    assert trench['description']==original
    assert 'Бежевый тренч. Пояс в комплекте.' not in shirt['images'][-1]['prompt']
    root.get_by_role('button',name='Сгенерировать инфографику',exact=True).click()
    description.fill('Другой бриф')
    expect(root.get_by_role('button',name='Добавить в карточки',exact=True)).to_be_disabled()
    root.get_by_role('button',name='Взять описание из карточки',exact=True).click()
    expect(description).to_have_value(original)
    page.set_viewport_size({'width':390,'height':844})
    prompt.scroll_into_view_if_needed()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    expect(prompt).to_be_visible()
    assert not errors,errors
    print('PASS: product description, per-product isolation, exact prompt export/copy, bulk persistence, original text preservation, invalidation, mobile.')
    browser.close()
