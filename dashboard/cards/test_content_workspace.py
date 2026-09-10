"""Content-center acceptance tests. Uses a fresh browser; requires localhost:8001."""
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ARTIFACTS=Path(__file__).parent/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1080})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8001/dashboard/#cards')
    page.wait_for_load_state('networkidle')
    root=page.locator('.ct')
    nav=root.get_by_role('navigation',name='Разделы контента')
    expect(root.locator('.ct-table tbody tr')).to_have_count(8)
    page.screenshot(path=str(ARTIFACTS/'content-desktop.png'),full_page=True)

    checks=page.evaluate('''async()=>{
      const m=await import('./cards/content-store.js');
      const mem={value:null,getItem(){return this.value},setItem(k,v){this.value=v}};
      const r=m.createContentRepository(mem),s=await r.load(),c=s.cards[0];const checks={};
      try{await r.saveBatch([{id:c.id,version:0,patch:{description:'test'}}]);checks.conflict=false}catch{checks.conflict=true}
      const second=s.cards[1];
      try{await r.saveBatch([{id:c.id,version:c.version,patch:{description:'new'}},{id:second.id,version:second.version,patch:{title:''}}]);}catch{}
      checks.atomicBatch=(await r.load()).cards[0].description===c.description;
      const exported=[m.EXCEL_HEADERS,...m.exportRows(s.cards)];
      checks.excelRoundtrip=m.parseExcelRows(exported,s.cards).every(r=>!r.errors.length&&!r.diff.length);
      const partial=m.parseExcelRows([['ID','Описание'],[c.id,'']],s.cards)[0];checks.partialColumns=Object.keys(partial.patch).join(',')==='description';
      checks.blankClears=partial.patch.description==='';
      const stale=m.parseExcelRows([['ID','Версия','Описание'],[c.id,0,'stale']],s.cards)[0];checks.staleExcel=stale.errors.length>0;
      const unknown=m.parseExcelRows([['ID','Описание'],['unknown','text']],s.cards)[0];checks.unknownID=unknown.errors.length>0;
      const badTitle=m.parseExcelRows([['ID','Название'],[c.id,'']],s.cards)[0];checks.titleRequired=badTitle.errors.length>0;
      const generated=m.generateContent([c],{parts:['description','rich','images'],brief:'Съёмный пояс.'})[0];
      checks.factsUsed=generated.patch.description.includes('Съёмный пояс.');
      const created=await r.createMany([{title:'Новый товар',description:generated.patch.description,rich:generated.patch.rich,images:generated.patch.images}]);
      const saved=await m.createContentRepository(mem).load();checks.generatedPersists=saved.cards.find(x=>x.id===created.created[0]).images.length===generated.patch.images.length;
      const before=(await r.load()).cards.length;
      try{await r.createMany([{title:'Валидный'},{title:''}]);}catch{}
      checks.atomicCreation=(await r.load()).cards.length===before;
      const duplicates=m.parseExcelRows([['ID','Описание'],[c.id,'first'],[c.id,'second']],s.cards);
      checks.duplicateRows=duplicates.every(row=>row.errors.length>0);
      return checks;
    }''')
    assert all(checks.values()),checks

    # Inline editing is a real persisted update.
    root.get_by_role('button',name='Редактировать описание: LM-CT-002',exact=True).click()
    root.get_by_label('Быстрая правка: Описание').fill('Новое описание из быстрой правки.')
    root.get_by_role('button',name='Сохранить',exact=True).click()
    expect(root.get_by_text('Новое описание из быстрой правки.',exact=True)).to_be_visible()
    page.reload();page.wait_for_load_state('networkidle')
    expect(root.get_by_text('Новое описание из быстрой правки.',exact=True)).to_be_visible()

    # Rich editor and safe closing with Escape.
    root.locator('.ct-table tbody tr').first.get_by_role('button',name='1 блоков',exact=True).click()
    dialog=page.get_by_role('dialog')
    expect(dialog.get_by_role('button',name='Добавить блок',exact=True)).to_be_visible()
    dialog.get_by_label('Заголовок блока 1').fill('Точные замеры')
    page.keyboard.press('Escape')
    expect(dialog.get_by_text('Закрыть без сохранения?',exact=True)).to_be_visible()
    dialog.get_by_role('button',name='Продолжить редактирование').click()
    dialog.get_by_label('Изображение блока 1').select_option(index=1)
    dialog.get_by_role('button',name='Сохранить карточку',exact=True).click()
    expect(dialog).to_have_count(0)

    # Batch field editing.
    root.get_by_label('Выбрать LM-CT-002',exact=True).check()
    root.get_by_label('Выбрать LM-TS-021',exact=True).check()
    root.get_by_role('button',name='Изменить поле',exact=True).click()
    dialog.get_by_label('Поле',exact=True).select_option('composition')
    dialog.get_by_label('Действие',exact=True).select_option('replace')
    dialog.get_by_label('Новое значение',exact=True).fill('95% хлопок, 5% эластан')
    expect(dialog.get_by_role('button',name='Применить к 2 товарам')).to_be_disabled()
    dialog.get_by_role('button',name='Посмотреть изменения').click()
    expect(dialog.locator('.cw-diff')).to_have_count(2)
    dialog.get_by_role('button',name='Применить к 2 товарам').click()
    expect(dialog).to_have_count(0)
    root.get_by_role('button',name='Снять выбор',exact=True).click()

    # Generate two new products, including rich content and image layouts.
    root.get_by_role('button',name='Создать карточки',exact=True).click()
    root.get_by_label('Исходное описание',exact=True).fill('Льняной жакет')
    root.get_by_role('button',name='Заполнить поля агентом',exact=True).click()
    root.get_by_label('Названия товаров — по одному на строку').fill('Жакет Лея\nЖакет Мира')
    root.get_by_label('Артикулы продавца — по одному на строку').fill('')
    root.get_by_label('Состав / материал',exact=True).fill('55% лён, 45% вискоза')
    root.get_by_role('button',name='К настройкам генерации',exact=True).click()
    root.get_by_label('Дополнительные факты о товаре').fill('Съёмный пояс в комплекте.')
    root.get_by_role('checkbox',name='Инфографика',exact=True).check()
    root.get_by_role('button',name='Сгенерировать контент',exact=True).click()
    expect(root.locator('.ct-generated-list article')).to_have_count(2)
    expect(root.locator('.ct-generated-list').get_by_text('Съёмный пояс в комплекте.',exact=False).first).to_be_visible()
    page.screenshot(path=str(ARTIFACTS/'content-generation.png'),full_page=True)
    root.locator('.ct-generation-result').get_by_role('button',name='Создать карточки',exact=True).click()
    nav.get_by_role('button',name='Каталог 10',exact=True).click()
    expect(root.locator('.ct-table tbody tr')).to_have_count(10)

    # Studio produces a downloadable 900x1200 PNG and attaches it to the card.
    nav.get_by_role('button',name='Инфографика',exact=True).click()
    root.get_by_label('Товар',exact=True).select_option('p5')
    root.get_by_label('Заголовок',exact=True).fill('Тренч для города')
    root.get_by_role('button',name='Песок',exact=True).click()
    root.get_by_role('button',name='Сгенерировать инфографику',exact=True).click()
    expect(root.get_by_role('button',name='Добавить в карточки',exact=True)).to_be_enabled()
    page.screenshot(path=str(ARTIFACTS/'content-studio.png'),full_page=True)
    with page.expect_download() as download:
        root.get_by_role('button',name='Скачать PNG',exact=True).click()
    data=Path(download.value.path()).read_bytes()
    assert data[:8]==b'\x89PNG\r\n\x1a\n'
    assert int.from_bytes(data[16:20],'big')==900 and int.from_bytes(data[20:24],'big')==1200
    root.get_by_role('button',name='Добавить в карточки',exact=True).click()
    expect(root.get_by_role('button',name='Добавить в карточки',exact=True)).to_be_disabled()

    # Excel: download actual workbook, edit it, upload valid+invalid rows, review and apply.
    nav.get_by_role('button',name='Excel',exact=True).click()
    with page.expect_download() as download:
        root.get_by_role('button',name='Скачать Excel · 10',exact=True).click()
    encoded=base64.b64encode(Path(download.value.path()).read_bytes()).decode()
    modified=page.evaluate('''encoded=>{
      const book=XLSX.read(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),{type:'array'});
      const rows=XLSX.utils.sheet_to_json(book.Sheets['Карточки'],{header:1,defval:''});
      const good=[...rows[1]];good[5]='Описание после Excel';
      const invalid=[...rows[2]];invalid[4]='';
      const missing=[...rows[3]];missing[0]='missing-id';
      const stale=[...rows[4]];stale[1]=0;
      book.Sheets['Карточки']=XLSX.utils.aoa_to_sheet([rows[0],good,invalid,missing,stale]);
      return Array.from(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})));
    }''',encoded)
    root.get_by_label('Загрузить Excel',exact=True).set_input_files({'name':'changes.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':bytes(modified)})
    expect(root.locator('.ct-import-review article')).to_have_count(4)
    expect(root.get_by_role('button',name='Применить изменения · 1',exact=True)).to_be_enabled()
    expect(root.locator('.ct-import-review').get_by_text('Ошибка',exact=True)).to_have_count(3)
    page.screenshot(path=str(ARTIFACTS/'content-excel.png'),full_page=True)
    root.get_by_role('button',name='Применить изменения · 1',exact=True).click()
    expect(root.locator('.ct-import-review')).to_have_count(0)
    nav.get_by_role('button',name='Каталог 10',exact=True).click()
    expect(root.get_by_text('Описание после Excel',exact=True)).to_be_visible()

    # Search API availability is separate from content tools.
    nav.get_by_role('button',name='Поисковые запросы',exact=True).click()
    root.get_by_label('Доступ к поисковым запросам').select_option('nojam')
    expect(root.get_by_role('heading',name='Нужна подписка «Джем»')).to_be_visible()
    root.get_by_label('Доступ к поисковым запросам').select_option('demo')
    expect(root.locator('.ct-search-table tbody tr')).to_have_count(8)
    nav.get_by_role('button',name='Каталог 10',exact=True).click()
    root.get_by_label('Поиск карточек').fill('does-not-exist')
    expect(root.get_by_role('heading',name='Ничего не найдено')).to_be_visible()
    root.get_by_role('button',name='Сбросить фильтры',exact=True).click()

    # Persisted images and text remain available on mobile; drawer contains focus.
    page.set_viewport_size({'width':390,'height':844});page.reload();page.wait_for_load_state('networkidle')
    page.screenshot(path=str(ARTIFACTS/'content-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    root.get_by_role('button',name='Открыть LM-CT-002',exact=True).click()
    dialog.get_by_role('button',name='Изображения',exact=True).click()
    expect(dialog.locator('.ct-filmstrip img')).to_have_count(2)
    for _ in range(20):page.keyboard.press('Tab')
    assert page.evaluate("!!document.activeElement.closest('[role=dialog]')")
    page.keyboard.press('Escape');expect(dialog).to_have_count(0)

    # Large catalogs: pagination and selecting all filtered products, not only the page.
    page.evaluate('''async()=>{
      const m=await import('./cards/content-store.js');
      await m.createContentRepository().createMany(Array.from({length:250},(_,i)=>({title:'Партия '+String(i+1).padStart(3,'0'),code:'BATCH-'+i})));
    }''')
    page.set_viewport_size({'width':1440,'height':1080});page.reload();page.wait_for_load_state('networkidle')
    expect(root.locator('.ct-table tbody tr')).to_have_count(20)
    root.get_by_label('Следующая страница').click()
    expect(root.locator('.ct-pagination').get_by_text('2 / 13',exact=True)).to_be_visible()
    root.get_by_label('Поиск карточек').fill('Партия')
    root.get_by_role('button',name='Выбрать все по фильтру · 250',exact=True).click()
    expect(root.get_by_text('Выбрано: 250',exact=True)).to_be_visible()
    assert not errors,errors
    print('PASS: inline editing, rich blocks, bulk editing, generation, PNG, Excel roundtrip/errors, API gating, persistence, mobile, keyboard.')
    print(json.dumps(checks))
    browser.close()
