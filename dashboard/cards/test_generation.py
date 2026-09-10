"""Acceptance coverage for configurable, multimodal creation. Separate browser storage."""
import base64
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=')
ARTIFACTS = Path(__file__).parent / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1080})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8001/dashboard/#cards')
    page.wait_for_load_state('networkidle')
    root = page.locator('.ct')
    nav = root.get_by_role('navigation', name='Разделы контента')
    nav.get_by_role('button', name='Генерация', exact=True).click()
    controls = root.locator('.ct-generation-controls')

    # Every combination of output types is independent of the source mode.
    checks = page.evaluate('''async()=>{
      const m = await import('./cards/content-store.js');
      const c = (await m.createContentRepository().load()).cards[0];
      c.generationInput = {description: 'Только из текста.', images:[{id:'photo',name:'photo',alt:'photo',source:'upload',src:'data:image/png;base64,fixture'}]};
      const types=['title','description','rich','images'];
      let count=0;
      for(const sourceMode of ['text','images','both']) {
        const request=m.buildGenerationRequest(c,{sourceMode});
        if ((request.sources.images.length>0)!==(sourceMode!=='text')) throw Error('Image source switch');
        if (!!request.sources.description!==(sourceMode!=='images')) throw Error('Description source switch');
        for(let mask=1;mask<16;mask++) {
          const parts=types.filter((_,i)=>mask&(1<<i));
          const result=m.generateContent([c],{sourceMode,parts,richCount:3,imageCount:2})[0].patch;
          if (JSON.stringify(Object.keys(result).sort())!==JSON.stringify([...parts].sort())) throw Error('Output selection');
          if(result.description && result.description.includes('Только из текста.')!==(sourceMode!=='images')) throw Error('Text isolation');
          if(result.images && result.images.at(-1).svg.includes('base64,fixture')!==(sourceMode!=='text')) throw Error('Image isolation');
          if(result.rich && result.rich.length!==c.rich.length+3) throw Error('Rich count');
          count++;
        }
      }
      return count;
    }''')
    assert checks == 45

    # Description + uploaded photo, custom metadata, independently selected rich/images.
    expect(controls.get_by_label('Категория', exact=True)).to_have_count(0)
    expect(root.get_by_role('button', name='Сгенерировать контент', exact=True)).to_have_count(0)
    root.get_by_role('button', name='Заполнить поля агентом', exact=True).click()
    expect(root.get_by_role('alert')).to_contain_text('Добавьте описание')
    controls.get_by_label('Исходное описание', exact=True).fill('Льняной жакет с поясом. Два кармана.\nКатегория: Пиджаки\nБренд: SOURCE BRAND\nСостав: 100% лён\nЗамеры: Длина 60 см\nАртикул: SOURCE-JACKET\nЦвет: Бежевый')
    controls.get_by_label('Исходные изображения', exact=True).set_input_files({'name':'front.png','mimeType':'image/png','buffer':PNG})
    expect(controls.locator('.ct-source-images img')).to_have_count(1)
    root.get_by_role('button', name='Заполнить поля агентом', exact=True).click()
    expect(controls.get_by_label('Названия товаров — по одному на строку')).to_have_value('Льняной жакет с поясом')
    expect(controls.get_by_label('Категория', exact=True)).to_have_value('Пиджаки')
    expect(controls.get_by_label('Бренд', exact=True)).to_have_value('SOURCE BRAND')
    expect(controls.get_by_label('Состав / материал', exact=True)).to_have_value('100% лён')
    expect(controls.get_by_label('Замеры', exact=True)).to_have_value('Длина 60 см')
    expect(controls.get_by_label('Значение характеристики 1', exact=True)).to_have_value('Бежевый')
    expect(root.get_by_role('button', name='Сгенерировать контент', exact=True)).to_have_count(0)
    page.screenshot(path=str(ARTIFACTS/'creation-review-desktop.png'), full_page=True)
    controls.get_by_label('Названия товаров — по одному на строку').fill('Жакет тестовый')
    controls.get_by_label('Категория', exact=True).fill('Пиджаки')
    controls.get_by_label('Бренд', exact=True).fill('TEST BRAND')
    controls.get_by_label('Артикулы продавца — по одному на строку').fill('TEST-JACKET')
    controls.get_by_label('Замеры', exact=True).fill('Длина по спинке 65 см')
    controls.get_by_label('Состав / материал', exact=True).fill('100% лён')
    controls.get_by_label('Значение характеристики 1', exact=True).fill('Бежевый')
    controls.get_by_role('button', name='Добавить характеристику', exact=True).click()
    controls.get_by_label('Название характеристики 2', exact=True).fill('Тип застёжки')
    controls.get_by_label('Значение характеристики 2', exact=True).fill('Пуговицы')
    root.get_by_role('button', name='К настройкам генерации', exact=True).click()
    controls.get_by_role('checkbox', name='Описание', exact=True).uncheck()
    controls.get_by_role('checkbox', name='Инфографика', exact=True).check()
    controls.get_by_label('Количество rich-блоков', exact=True).select_option('3')
    controls.get_by_label('Изображений на товар', exact=True).select_option('2')
    controls.get_by_label('Палитра инфографики', exact=True).select_option('sand')
    root.get_by_role('button', name='Сгенерировать контент', exact=True).click()
    expect(root.locator('.ct-generated-list article')).to_have_count(1)
    expect(root.locator('.ct-result-images img')).to_have_count(3)
    expect(root.get_by_label('Описание результата 1', exact=True)).to_have_value('Льняной жакет с поясом. Два кармана.')
    root.get_by_label('Название результата 1', exact=True).fill('Жакет после проверки')
    root.evaluate("element => element.scrollIntoView({block:'start'})")
    page.screenshot(path=str(ARTIFACTS/'configurable-generation-desktop.png'), full_page=True)
    root.locator('.ct-generation-result').get_by_role('button', name='Создать карточки', exact=True).click()
    expect(root.locator('.ct-generated-list')).to_have_count(0)
    stored = page.evaluate("JSON.parse(localStorage.getItem('marginpilot.cards.content.v2')).cards.find(c=>c.code==='TEST-JACKET')")
    assert stored['brand']=='TEST BRAND' and stored['measurements']=='Длина по спинке 65 см'
    assert len(stored['rich'])==3 and len(stored['images'])==3
    assert stored['attributes'][1]['value']=='Пуговицы'
    assert stored['images'][0]['src'] in stored['images'][1]['svg']

    # Saved characteristics are editable and survive a reload.
    nav.get_by_role('button', name='Каталог 9', exact=True).click()
    root.get_by_role('button', name='Открыть TEST-JACKET', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_role('button', name='Характеристики', exact=True).click()
    expect(dialog.get_by_label('Бренд', exact=True)).to_have_value('TEST BRAND')
    dialog.get_by_label('Значение характеристики 2', exact=True).fill('Кнопки')
    dialog.get_by_role('button', name='Сохранить карточку', exact=True).click()
    page.reload();page.wait_for_load_state('networkidle')
    assert page.evaluate("JSON.parse(localStorage.getItem('marginpilot.cards.content.v2')).cards.find(c=>c.code==='TEST-JACKET').attributes[1].value")=='Кнопки'

    # Photo-only without a title. Toggling options clears the old preview.
    nav.get_by_role('button', name='Генерация', exact=True).click()
    controls.get_by_label('Исходные изображения', exact=True).set_input_files({'name':'only-photo.png','mimeType':'image/png','buffer':PNG})
    expect(controls.locator('.ct-source-images img')).to_have_count(1)
    root.get_by_role('button', name='Заполнить поля агентом', exact=True).click()
    expect(controls.get_by_label('Бренд', exact=True)).to_have_value('')
    root.get_by_role('button', name='К настройкам генерации', exact=True).click()
    controls.get_by_role('checkbox', name='Rich-контент', exact=True).uncheck()
    root.get_by_role('button', name='Сгенерировать контент', exact=True).click()
    expect(root.locator('.ct-generated-list article')).to_have_count(1)
    expect(root.locator('.ct-rich-preview')).to_have_count(0)
    controls.get_by_role('checkbox', name='Описание', exact=True).uncheck()
    expect(root.locator('.ct-generated-list')).to_have_count(0)
    root.get_by_role('button', name='Подготовить карточки', exact=True).click()
    expect(root.locator('.ct-result-images img')).to_have_count(1)
    root.locator('.ct-generation-result').get_by_role('button', name='Создать карточки', exact=True).click()
    last = page.evaluate("JSON.parse(localStorage.getItem('marginpilot.cards.content.v2')).cards[0]")
    assert last['description']=='' and not last['rich'] and len(last['images'])==1

    # Batch photos must be assigned to a product; none silently leak into another card.
    nav.get_by_role('button', name='Каталог 10', exact=True).click()
    nav.get_by_role('button', name='Генерация', exact=True).click()
    controls.get_by_label('Исходные изображения', exact=True).set_input_files([
        {'name':'one.png','mimeType':'image/png','buffer':PNG},
        {'name':'two.png','mimeType':'image/png','buffer':PNG},
    ])
    expect(controls.locator('.ct-source-images img')).to_have_count(2)
    root.get_by_role('button', name='Заполнить поля агентом', exact=True).click()
    controls.get_by_label('Названия товаров — по одному на строку').fill('Первый\nВторой')
    controls.get_by_label('Артикулы продавца — по одному на строку').fill('')
    root.get_by_role('button', name='1. Исходные данные', exact=True).click()
    controls.get_by_label('Товар для one.png', exact=True).select_option('preview-0')
    controls.get_by_label('Товар для two.png', exact=True).select_option('preview-1')
    root.get_by_role('button', name='К проверке полей', exact=True).click()
    expect(controls.get_by_label('Названия товаров — по одному на строку')).to_have_value('Первый\nВторой')
    root.get_by_role('button', name='К настройкам генерации', exact=True).click()
    root.get_by_role('button', name='Сгенерировать контент', exact=True).click()
    expect(root.locator('.ct-generated-list article')).to_have_count(2)
    expect(root.locator('.ct-generated-list article').first.locator('.ct-result-images img')).to_have_count(1)
    expect(root.locator('.ct-generated-list article').last.locator('.ct-result-images img')).to_have_count(1)

    # Changed sources require analysis again; corrected facts drive generation.
    root.get_by_role('button', name='1. Исходные данные', exact=True).click()
    controls.get_by_label('Исходное описание', exact=True).fill('Название: Новый жакет\nОписание: Исходный текст\nБренд: Старый бренд')
    expect(root.locator('.ct-generated-list')).to_have_count(0)
    expect(root.get_by_role('button', name='3. Генерация и создание', exact=True)).to_be_disabled()
    root.get_by_role('button', name='Заполнить поля агентом', exact=True).click()
    controls.get_by_label('Бренд', exact=True).fill('Исправленный бренд')
    controls.get_by_label('Описание товара', exact=True).fill('Исправленное описание')
    root.get_by_role('button', name='К настройкам генерации', exact=True).click()
    root.get_by_role('button', name='Сгенерировать контент', exact=True).click()
    description = root.get_by_label('Описание результата 1', exact=True).input_value()
    assert 'Исправленный бренд' in description and 'Исправленное описание' in description
    assert 'Старый бренд' not in description and 'Исходный текст' not in description

    page.set_viewport_size({'width':390,'height':844})
    root.evaluate("element => element.scrollIntoView({block:'start'})")
    page.screenshot(path=str(ARTIFACTS/'configurable-generation-mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')

    # A real adapter can fill every field asynchronously; failures allow retry.
    page.set_viewport_size({'width':1440,'height':1080})
    page.evaluate('''async () => {
      const {createCardsWorkspace} = await import('./cards/content-workspace.js');
      const {createContentRepository, generateContent} = await import('./cards/content-store.js');
      const host = document.createElement('div'); host.id = 'agent-test';
      document.body.append(host);
      const repo = createContentRepository({getItem:()=>null,setItem:()=>{}});
      window.agentRepo = repo;
      window.agentCalls = 0;
      const service = {
        analyze: async sources => {
          window.agentSources = sources;
          if (++window.agentCalls === 1) throw Error('Агент временно недоступен');
          return new Promise(resolve => { window.finishAnalysis = resolve; });
        },
        generate: async (cards, options) => {
          window.agentGeneration = cards;
          return generateContent(cards, options);
        }
      };
      ReactDOM.createRoot(host).render(React.createElement(createCardsWorkspace(React, repo, service)));
    }''')
    agent = page.locator('#agent-test')
    agent.get_by_role('button', name='Создать карточки', exact=True).click()
    agent.get_by_label('Исходное описание', exact=True).fill('Товар из источника')
    agent.get_by_label('Исходные изображения', exact=True).set_input_files({'name':'agent.png','mimeType':'image/png','buffer':PNG})
    expect(agent.locator('.ct-source-images img')).to_have_count(1)
    agent.get_by_role('button', name='Заполнить поля агентом', exact=True).click()
    expect(agent.get_by_role('alert')).to_have_text('Агент временно недоступен')
    agent.get_by_role('button', name='Заполнить поля агентом', exact=True).click()
    expect(agent.get_by_role('button', name='Агент заполняет поля…', exact=True)).to_be_disabled()
    page.evaluate('''() => window.finishAnalysis({product:{
      title:'Товар агента',description:'Описание агента',category:'Категория агента',
      brand:'Бренд агента',code:'AGENT-1',composition:'Хлопок',measurements:'60 см',
      attributes:[{id:'color',name:'Цвет',value:'Белый'}]
    }})''')
    expect(agent.get_by_label('Категория', exact=True)).to_have_value('Категория агента')
    agent.get_by_label('Описание товара', exact=True).fill('Проверенное описание')
    agent.get_by_label('Значение характеристики 1', exact=True).fill('Чёрный')
    agent.get_by_role('button', name='К настройкам генерации', exact=True).click()
    agent.get_by_role('button', name='Сгенерировать контент', exact=True).click()
    expect(agent.locator('.ct-generated-list article')).to_have_count(1)
    captured = page.evaluate('({sources:agentSources, input:agentGeneration[0]})')
    assert captured['sources']['description']=='Товар из источника' and len(captured['sources']['images'])==1
    assert captured['input']['generationInput']['description']=='Проверенное описание'
    assert captured['input']['attributes'][0]['value']=='Чёрный'
    assert page.evaluate('async () => (await agentRepo.load()).cards.length') == 8
    agent.locator('.ct-generation-result').get_by_role('button', name='Создать карточки', exact=True).click()
    expect(agent.get_by_role('button', name='Заполнить поля агентом', exact=True)).to_be_visible()
    result = page.evaluate('async () => (await agentRepo.load()).cards.find(c => c.code === "AGENT-1")')
    assert result['brand']=='Бренд агента' and result['attributes'][0]['value']=='Чёрный'
    assert not errors, errors
    print('PASS: 45 source/output combinations, three-step creation, source validation, autofill, corrections, persistence, image-only, batch photo mapping, mobile, async agent adapter and retry.')
    browser.close()
