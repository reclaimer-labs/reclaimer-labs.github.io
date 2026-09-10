# MarginPilot — mock project

Интерактивный мок MarginPilot для Wildberries: лендинг и операционный dashboard.

## Структура

- `index.html` — маркетинговый лендинг.
- `dashboard/` — интерактивный интерфейс продукта.

## Локальный запуск

Из этой папки запустите сервер с корректным MIME-типом для ES-модулей:

```powershell
python -c "import http.server,mimetypes; mimetypes.add_type('application/javascript','.js'); http.server.ThreadingHTTPServer(('127.0.0.1',8001),http.server.SimpleHTTPRequestHandler).serve_forever()"
```

Откройте:

- `http://127.0.0.1:8001/` — лендинг;
- `http://127.0.0.1:8001/dashboard/` — dashboard.

## Новая вкладка «Карточки»

Открыть напрямую: [dashboard/#cards](http://127.0.0.1:8001/dashboard/#cards).

- [Анализ продукта, рынка и запросов пользователей](dashboard/cards/analysis.md).
- [Устройство мока и перенос в реальный проект](dashboard/cards/README.md).
- Модуль: `dashboard/cards/` — React-компонент, стили, демо-адаптер, контракт данных и браузерные проверки.

## Публикация

GitHub Pages использует workflow [.github/workflows/pages.yml](.github/workflows/pages.yml): при push в main проверяется синтаксис JavaScript и публикуются статические HTML, JS и CSS без обработки Jekyll. В Settings → Pages источником должен быть GitHub Actions. Ручной повтор доступен через workflow_dispatch.

Публичный сайт: [reclaimer-labs.github.io](https://reclaimer-labs.github.io/). Документация, тесты и локальные артефакты в пакет публикации не включаются.
