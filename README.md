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
