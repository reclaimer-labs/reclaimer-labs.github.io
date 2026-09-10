import {
  createContentRepository,
  copy,
  uid,
  TEXT_FIELDS,
  generateContent,
  makeImage,
  svgURL,
  EXCEL_HEADERS,
  exportRows,
  parseExcelRows,
  infographicProductDescription,
  buildInfographicPrompt,
} from "./content-store.js";
import {
  createContentGenerator,
  createCharacteristicsEditor,
} from "./content-generation.js";

const API_DOC = "https://dev.wildberries.ru/en/openapi/analytics";
const imageSrc = (i) => i.src || svgURL(i.svg);
const short = (v, n = 105) => (v.length > n ? v.slice(0, n) + "…" : v);
const stamp = (iso) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function saveFile(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function excelLibrary() {
  if (!globalThis.XLSX)
    throw new Error(
      "Модуль Excel не загрузился. Проверьте подключение и обновите страницу.",
    );
  return globalThis.XLSX;
}
function downloadExcel(cards) {
  const X = excelLibrary(),
    book = X.utils.book_new(),
    sheet = X.utils.aoa_to_sheet([EXCEL_HEADERS, ...exportRows(cards)]);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 8 },
    { wch: 16 },
    { wch: 22 },
    { wch: 45 },
    { wch: 75 },
    { wch: 35 },
    { wch: 35 },
    ...Array.from({ length: 4 }, () => ({ wch: 45 })),
  ];
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  X.utils.book_append_sheet(book, sheet, "Карточки");
  X.utils.book_append_sheet(
    book,
    X.utils.aoa_to_sheet([
      ["Как редактировать"],
      [
        "Сохраните ID и Версию. Артикулы используются для сопоставления, их изменение не поддерживается.",
      ],
      [
        "Пустая ячейка очищает поле; отсутствие столбца оставляет поле без изменений.",
      ],
      [
        "Можно удалять строки и столбцы, кроме идентификатора. Импорт покажет сравнение до/после.",
      ],
      [
        "Rich-блоки 1–2 редактируются здесь. Остальные блоки и изображения остаются в редакторе сайта.",
      ],
      [
        "Формулы не поддерживаются: вставляйте значения. Новые товары создавайте через Генерацию.",
      ],
      ["Демонстрационный шаблон MarginPilot, не официальный шаблон WB."],
    ]),
    "Инструкция",
  );
  saveFile(
    X.write(book, { type: "array", bookType: "xlsx" }),
    "MarginPilot-карточки.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
async function readExcel(file, cards) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Файл больше 10 МБ. Разделите его на несколько файлов.");
  const X = excelLibrary(),
    book = X.read(await file.arrayBuffer(), {
      type: "array",
      cellFormula: true,
    });
  const sheet = book.Sheets["Карточки"] || book.Sheets[book.SheetNames[0]];
  if (!sheet?.["!ref"]) throw new Error("Лист пуст.");
  const range = X.utils.decode_range(sheet["!ref"]);
  if (range.e.r > 2000 || range.e.c > 40)
    throw new Error("В моке поддерживается до 2 000 строк и 41 столбца.");
  for (const [key, value] of Object.entries(sheet))
    if (!key.startsWith("!") && value.f)
      throw new Error(`Ячейка ${key} содержит формулу. Вставьте её значение.`);
  return parseExcelRows(
    X.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }),
    cards,
  );
}
async function downloadPNG(image) {
  const source = new Image();
  source.src = imageSrc(image);
  await source.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 900, 1200);
  const scale = Math.min(900 / source.width, 1200 / source.height);
  ctx.drawImage(
    source,
    (900 - source.width * scale) / 2,
    (1200 - source.height * scale) / 2,
    source.width * scale,
    source.height * scale,
  );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Не удалось сохранить PNG.");
  saveFile(blob, (image.name || "инфографика") + ".png", "image/png");
}

export function createCardsWorkspace(
  React,
  repository = createContentRepository(),
  generationService = { generate: generateContent },
) {
  const h = React.createElement;
  const icon = (name) =>
    h("span", { className: "cw-icon", "aria-hidden": true }, name);
  const btn = (label, click, style = "", props = {}) =>
    h(
      "button",
      {
        type: "button",
        className: "cw-button " + style,
        onClick: click,
        ...props,
      },
      label,
    );
  const chip = (text, tone = "neutral") =>
    h("span", { className: "cw-badge cw-" + tone }, text);
  const field = (label, value, onChange, { area = false, ...props } = {}) =>
    h(
      "label",
      { className: "cw-field" },
      h("span", null, label),
      h(area ? "textarea" : "input", {
        "aria-label": label,
        value,
        "aria-label": label,
        onChange: (e) => onChange(e.target.value),
        ...props,
      }),
    );
  const CharacteristicsEditor = createCharacteristicsEditor(React, {
    field,
    btn,
  });
  const thumb = (c) =>
    c.images[0]
      ? h("img", { className: "ct-thumb", src: imageSrc(c.images[0]), alt: "" })
      : h(
          "span",
          { className: "ct-thumb ct-noimage" },
          icon("add_photo_alternate"),
        );
  const empty = (title, body, action) =>
    h(
      "div",
      { className: "cw-empty" },
      icon("inventory_2"),
      h("h3", null, title),
      h("p", null, body),
      action,
    );
  function Modal({ title, subtitle, children, onClose, wide = false }) {
    const ref = React.useRef(),
      close = React.useRef(onClose);
    close.current = onClose;
    React.useEffect(() => {
      const previous = document.activeElement,
        overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      ref.current?.querySelector("button")?.focus();
      const listener = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close.current();
        }
        if (e.key === "Tab") {
          const a = [
            ...ref.current.querySelectorAll(
              "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
            ),
          ];
          if (e.shiftKey && document.activeElement === a[0]) {
            e.preventDefault();
            a.at(-1)?.focus();
          }
          if (!e.shiftKey && document.activeElement === a.at(-1)) {
            e.preventDefault();
            a[0]?.focus();
          }
        }
      };
      document.addEventListener("keydown", listener);
      return () => {
        document.body.style.overflow = overflow;
        document.removeEventListener("keydown", listener);
        if (previous?.isConnected) previous.focus();
      };
    }, []);
    return h(
      "div",
      {
        className: "cw-overlay",
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      h(
        "div",
        {
          className: "cw-dialog" + (wide ? " cw-dialog-wide" : ""),
          role: "dialog",
          "aria-modal": true,
          "aria-label": title,
          ref,
        },
        h(
          "header",
          { className: "cw-dialog-head" },
          h(
            "div",
            null,
            h("div", { className: "cw-kicker" }, subtitle),
            h("h2", null, title),
          ),
          btn(icon("close"), onClose, "cw-icon-button", {
            "aria-label": "Закрыть панель",
          }),
        ),
        children,
      ),
    );
  }
  function Gallery({ card, images, onChange, onError }) {
    const [active, setActive] = React.useState(0);
    const current = images[Math.min(active, images.length - 1)];
    async function upload(e) {
      const files = [...e.target.files];
      e.target.value = "";
      try {
        if (images.length + files.length > 10)
          throw new Error("Не больше 10 изображений в демо-карточке.");
        const added = [];
        for (const file of files) {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
            throw new Error("Поддерживаются PNG, JPEG и WebP.");
          if (file.size > 2 * 1024 * 1024)
            throw new Error("В демо загружайте изображения до 2 МБ.");
          const src = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const check = new Image();
          check.src = src;
          await check.decode();
          added.push({
            id: uid(),
            name: file.name,
            alt: card.title,
            src,
            source: "upload",
          });
        }
        onChange([...images, ...added]);
      } catch (err) {
        onError(err.message);
      }
    }
    const move = (offset) => {
      const index = images.indexOf(current),
        target = index + offset;
      if (target < 0 || target >= images.length) return;
      const next = copy(images);
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
      setActive(target);
    };
    return h(
      "div",
      { className: "ct-gallery" },
      h(
        "div",
        { className: "ct-gallery-preview" },
        current
          ? h("img", { src: imageSrc(current), alt: current.alt })
          : empty(
              "Добавьте изображения",
              "Загрузите фото или создайте макет во вкладке «Инфографика».",
            ),
      ),
      h(
        "div",
        null,
        h(
          "div",
          { className: "cw-section-title" },
          h("h3", null, "Галерея товара"),
          chip(images.length + " / 10"),
        ),
        h(
          "div",
          { className: "ct-filmstrip" },
          images.map((image, index) =>
            btn(
              h("img", { src: imageSrc(image), alt: image.name }),
              () => setActive(index),
              image.id === current?.id ? "active" : "",
              { "aria-label": "Изображение " + (index + 1), key: image.id },
            ),
          ),
        ),
        h(
          "label",
          { className: "cw-button" },
          icon("upload"),
          "Загрузить фото",
          h("input", {
            type: "file",
            accept: "image/png,image/jpeg,image/webp",
            multiple: true,
            onChange: upload,
            hidden: true,
          }),
        ),
        current
          ? h(
              React.Fragment,
              null,
              field("Название изображения", current.name, (value) =>
                onChange(
                  images.map((i) =>
                    i.id === current.id ? { ...i, name: value } : i,
                  ),
                ),
              ),
              field("Описание изображения", current.alt, (value) =>
                onChange(
                  images.map((i) =>
                    i.id === current.id ? { ...i, alt: value } : i,
                  ),
                ),
              ),
              h(
                "div",
                { className: "cw-actions" },
                btn("←", () => move(-1), "", {
                  "aria-label": "Переместить изображение влево",
                  disabled: images.indexOf(current) === 0,
                }),
                btn("→", () => move(1), "", {
                  "aria-label": "Переместить изображение вправо",
                  disabled: images.indexOf(current) === images.length - 1,
                }),
                btn("Удалить", () => {
                  onChange(images.filter((i) => i.id !== current.id));
                  setActive(0);
                }),
                btn("Скачать PNG", () =>
                  downloadPNG(current).catch((e) => onError(e.message)),
                ),
              ),
            )
          : null,
        h(
          "p",
          { className: "cw-footnote" },
          "Первое изображение — обложка. Изменения галереи сохраняются вместе с карточкой.",
        ),
      ),
    );
  }
  function Editor({
    card,
    onClose,
    onSave,
    onGenerate,
    onStudio,
    initialTab = "text",
  }) {
    const [draft, setDraft] = React.useState(copy(card)),
      [tab, setTab] = React.useState(initialTab),
      [error, setError] = React.useState(""),
      [busy, setBusy] = React.useState(false),
      [discard, setDiscard] = React.useState(false);
    const dirty = JSON.stringify(draft) !== JSON.stringify(card);
    const change = (key, value) =>
      setDraft((d) => ({
        ...d,
        [key]: value,
        ...(key === "images"
          ? {
              rich: d.rich.map((block) =>
                block.imageId &&
                !value.some((image) => image.id === block.imageId)
                  ? { ...block, imageId: "" }
                  : block,
              ),
            }
          : {}),
      }));
    const close = () => (dirty ? setDiscard(true) : onClose());
    const navigate = (callback) => {
      if (dirty) {
        setError("Сохраните правки перед переходом.");
        return;
      }
      callback(card.id);
    };
    async function save() {
      setBusy(true);
      try {
        await onSave(
          [{ id: card.id, version: card.version, patch: draft }],
          "Редактор",
        );
        onClose();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }
    return h(
      Modal,
      {
        title: card.title,
        subtitle: `${card.code} · WB ${card.nm || "не присвоен"} · версия ${card.version}`,
        onClose: close,
        wide: true,
      },
      h(
        "nav",
        { className: "cw-detail-tabs", "aria-label": "Редактор карточки" },
        [
          ["text", "Текст и свойства"],
          ["attributes", "Характеристики"],
          ["rich", "Rich-контент"],
          ["images", "Изображения"],
        ].map(([id, label]) =>
          btn(label, () => setTab(id), tab === id ? "active" : "", {
            key: id,
            "aria-pressed": tab === id,
          }),
        ),
      ),
      h(
        "div",
        { className: "cw-dialog-body" },
        error
          ? h("div", { className: "cw-error", role: "alert" }, error)
          : null,
        tab === "text"
          ? h(
              "div",
              { className: "ct-edit-layout" },
              h(
                "div",
                null,
                field("Название", draft.title, (v) => change("title", v), {
                  maxLength: 60,
                }),
                field(
                  "Описание",
                  draft.description,
                  (v) => change("description", v),
                  { area: true, rows: 9, maxLength: 2000 },
                ),
                h(
                  "div",
                  { className: "ct-two-fields" },
                  field("Состав", draft.composition, (v) =>
                    change("composition", v),
                  ),
                  field(
                    "Замеры",
                    draft.measurements,
                    (v) => change("measurements", v),
                    { area: true, rows: 3 },
                  ),
                ),
              ),
              h(
                "aside",
                { className: "ct-editor-aside" },
                thumb(card),
                h("h3", null, "Текст за пару кликов"),
                h(
                  "p",
                  null,
                  "Подготовьте описание из характеристик товара, затем отредактируйте результат.",
                ),
                btn([icon("auto_awesome"), " Сгенерировать текст"], () =>
                  navigate(onGenerate),
                ),
                h(
                  "small",
                  null,
                  "Демо-генератор использует только заполненные факты.",
                ),
              ),
            )
          : null,
        tab === "attributes"
          ? h(
              "div",
              { className: "ct-card-properties" },
              h(
                "div",
                { className: "ct-form-columns" },
                field(
                  "Категория",
                  draft.category,
                  (v) => change("category", v),
                  { maxLength: 100 },
                ),
                field("Бренд", draft.brand || "", (v) => change("brand", v), {
                  maxLength: 100,
                }),
              ),
              h(CharacteristicsEditor, {
                value: draft.attributes || [],
                onChange: (v) => change("attributes", v),
              }),
            )
          : null,
        tab === "rich"
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "cw-section-title" },
                h(
                  "div",
                  null,
                  h("h3", null, "История товара в блоках"),
                  h(
                    "p",
                    null,
                    "Текст, преимущества, инструкция или подбор размера.",
                  ),
                ),
                btn(
                  "Добавить блок",
                  () =>
                    change("rich", [
                      ...draft.rich,
                      { id: uid(), title: "", body: "" },
                    ]),
                  "",
                  { disabled: draft.rich.length >= 10 },
                ),
              ),
              draft.rich.length
                ? draft.rich.map((block, index) =>
                    h(
                      "section",
                      { className: "ct-rich-block", key: block.id },
                      h(
                        "div",
                        { className: "cw-section-title" },
                        chip("Блок " + (index + 1)),
                        h(
                          "div",
                          { className: "cw-actions" },
                          btn(
                            "↑",
                            () => {
                              const next = copy(draft.rich);
                              [next[index - 1], next[index]] = [
                                next[index],
                                next[index - 1],
                              ];
                              change("rich", next);
                            },
                            "",
                            {
                              disabled: index === 0,
                              "aria-label": "Поднять блок " + (index + 1),
                            },
                          ),
                          btn("Удалить блок", () =>
                            change(
                              "rich",
                              draft.rich.filter((b) => b.id !== block.id),
                            ),
                          ),
                        ),
                      ),
                      field(
                        "Заголовок блока " + (index + 1),
                        block.title,
                        (value) =>
                          change(
                            "rich",
                            draft.rich.map((b) =>
                              b.id === block.id ? { ...b, title: value } : b,
                            ),
                          ),
                        { maxLength: 150 },
                      ),
                      field(
                        "Текст блока " + (index + 1),
                        block.body,
                        (value) =>
                          change(
                            "rich",
                            draft.rich.map((b) =>
                              b.id === block.id ? { ...b, body: value } : b,
                            ),
                          ),
                        { area: true, rows: 4, maxLength: 2000 },
                      ),
                      h(
                        "label",
                        { className: "cw-field" },
                        h("span", null, "Изображение блока " + (index + 1)),
                        h(
                          "select",
                          {
                            value: block.imageId || "",
                            onChange: (e) =>
                              change(
                                "rich",
                                draft.rich.map((b) =>
                                  b.id === block.id
                                    ? { ...b, imageId: e.target.value }
                                    : b,
                                ),
                              ),
                          },
                          h("option", { value: "" }, "Без изображения"),
                          draft.images.map((image) =>
                            h(
                              "option",
                              { value: image.id, key: image.id },
                              image.name,
                            ),
                          ),
                        ),
                      ),
                      block.imageId &&
                        draft.images.find((i) => i.id === block.imageId)
                        ? h("img", {
                            className: "ct-rich-image",
                            src: imageSrc(
                              draft.images.find((i) => i.id === block.imageId),
                            ),
                            alt: "Изображение rich-блока",
                          })
                        : null,
                    ),
                  )
                : empty(
                    "Rich-контент ещё не создан",
                    "Добавьте блоки вручную или подготовьте их генератором.",
                  ),
              btn("Скачать rich-контент", () =>
                saveFile(
                  JSON.stringify(
                    { cardId: card.id, rich: draft.rich, images: draft.images },
                    null,
                    2,
                  ),
                  card.code + "-rich.json",
                  "application/json",
                ),
              ),
              h(
                "div",
                { className: "cw-note" },
                "Структура сохраняется в проекте и экспортируется. Автоматическая загрузка rich-контента в WB пока не подтверждена документацией API.",
              ),
            )
          : null,
        tab === "images"
          ? h(Gallery, {
              card,
              images: draft.images,
              onChange: (images) => change("images", images),
              onError: setError,
            })
          : null,
        h(
          "footer",
          { className: "cw-editor-footer" },
          h(
            "span",
            null,
            dirty ? "Есть несохранённые изменения" : "Изменений нет",
          ),
          h(
            "div",
            { className: "cw-actions" },
            tab === "images"
              ? btn("Создать инфографику", () => navigate(onStudio))
              : null,
            btn(
              busy ? "Сохраняем…" : "Сохранить карточку",
              save,
              "cw-primary",
              { disabled: busy || !dirty },
            ),
          ),
        ),
      ),
      discard
        ? h(
            "div",
            { className: "ct-discard", role: "alert" },
            h("strong", null, "Закрыть без сохранения?"),
            btn("Продолжить редактирование", () => setDiscard(false)),
            btn("Закрыть без сохранения", onClose),
          )
        : null,
    );
  }
  function Batch({ cards, onClose, onSave }) {
    const [key, setKey] = React.useState("description"),
      [mode, setMode] = React.useState("append"),
      [value, setValue] = React.useState(""),
      [review, setReview] = React.useState(false),
      [error, setError] = React.useState(""),
      [busy, setBusy] = React.useState(false);
    const next = (c) =>
      mode === "append" ? [c[key], value].filter(Boolean).join("\n") : value;
    return h(
      Modal,
      {
        title: "Массовое редактирование",
        subtitle: cards.length + " товаров",
        onClose,
        wide: true,
      },
      h(
        "div",
        { className: "cw-dialog-body" },
        h(
          "div",
          { className: "ct-two-fields" },
          h(
            "label",
            { className: "cw-field" },
            h("span", null, "Поле"),
            h(
              "select",
              {
                value: key,
                "aria-label": "Поле",
                onChange: (e) => {
                  setKey(e.target.value);
                  setReview(false);
                },
              },
              Object.entries(TEXT_FIELDS).map(([id, label]) =>
                h("option", { value: id, key: id }, label),
              ),
            ),
          ),
          h(
            "label",
            { className: "cw-field" },
            h("span", null, "Действие"),
            h(
              "select",
              {
                value: mode,
                "aria-label": "Действие",
                onChange: (e) => {
                  setMode(e.target.value);
                  setReview(false);
                },
              },
              h("option", { value: "append" }, "Добавить в конец"),
              h("option", { value: "replace" }, "Заменить значение"),
            ),
          ),
        ),
        field(
          "Новое значение",
          value,
          (v) => {
            setValue(v);
            setReview(false);
          },
          { area: true, rows: 5 },
        ),
        review
          ? h(
              "div",
              { className: "ct-review-list" },
              cards.map((c) =>
                h(
                  "div",
                  { className: "cw-diff", key: c.id },
                  h("h4", null, c.title),
                  h(
                    "div",
                    null,
                    h(
                      "section",
                      null,
                      h("small", null, "БЫЛО"),
                      h("p", null, c[key] || "Пусто"),
                    ),
                    h(
                      "section",
                      null,
                      h("small", null, "СТАНЕТ"),
                      h("p", null, next(c) || "Пусто"),
                    ),
                  ),
                ),
              ),
            )
          : null,
        error
          ? h("div", { className: "cw-error", role: "alert" }, error)
          : null,
        h(
          "div",
          { className: "cw-actions" },
          btn("Посмотреть изменения", () => setReview(true)),
          btn(
            "Применить к " + cards.length + " товарам",
            async () => {
              setBusy(true);
              try {
                await onSave(
                  cards.map((c) => ({
                    id: c.id,
                    version: c.version,
                    patch: { [key]: next(c) },
                  })),
                  "Массовая правка",
                );
                onClose();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            },
            "cw-primary",
            { disabled: !review || busy },
          ),
        ),
      ),
    );
  }
  const Generator = createContentGenerator(
    React,
    { field, btn, chip, empty, icon, imageSrc },
    generationService,
  );
  function Studio({ cards, selection, onSave }) {
    const [id, setId] = React.useState(selection[0] || cards[0]?.id),
      [headline, setHeadline] = React.useState(""),
      [caption, setCaption] = React.useState("Детали и посадка"),
      [palette, setPalette] = React.useState("sage"),
      [layout, setLayout] = React.useState("cover"),
      [descriptions, setDescriptions] = React.useState({}),
      [instructions, setInstructions] = React.useState(""),
      [copied, setCopied] = React.useState(false),
      [result, setResult] = React.useState(null),
      [error, setError] = React.useState(""),
      [busy, setBusy] = React.useState(false),
      [bulk, setBulk] = React.useState(false);
    const card = cards.find((c) => c.id === id) || cards[0];
    if (!card) return empty("Нет товаров", "Сначала создайте карточку.");
    const options = {
      headline: headline || card.title,
      caption,
      palette,
      layout,
      photo: card.images.find((i) => i.src)?.src || "",
      productDescription:
        descriptions[card.id] ?? infographicProductDescription(card),
      instructions,
    };
    const resultIndex = result
      ? Math.max(
          0,
          result.cards.findIndex((c) => c.id === card.id),
        )
      : 0;
    const preview = result?.images[resultIndex] || makeImage(card, options);
    const prompt = result
      ? preview.prompt
      : buildInfographicPrompt(card, options);
    const change = (setter) => (value) => {
      setter(value);
      setResult(null);
      setCopied(false);
      setError("");
    };
    const generate = () => {
      const targets =
        bulk && selection.length
          ? cards.filter((c) => selection.includes(c.id))
          : [card];
      if (
        targets.some(
          (c) =>
            !(descriptions[c.id] ?? infographicProductDescription(c)).trim(),
        )
      ) {
        setError("Заполните описание товара для каждой инфографики.");
        return;
      }
      setError("");
      setCopied(false);
      setResult({
        cards: targets,
        images: targets.map((c) => {
          const settings = {
            ...options,
            headline: targets.length > 1 ? c.title : options.headline,
            photo: c.images.find((i) => i.src)?.src || "",
            productDescription:
              descriptions[c.id] ?? infographicProductDescription(c),
          };
          return makeImage(c, {
            ...settings,
            prompt: buildInfographicPrompt(c, settings),
          });
        }),
      });
    };
    async function save() {
      setBusy(true);
      try {
        const changes = result.cards.map((c, i) => ({
          id: c.id,
          version: c.version,
          patch: { images: [...c.images, result.images[i]] },
        }));
        await onSave(changes, "Инфографика");
        setResult(null);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }
    return h(
      "div",
      { className: "ct-studio" },
      h(
        "aside",
        { className: "cw-panel ct-form-panel" },
        h("div", { className: "cw-kicker" }, "СТУДИЯ ИНФОГРАФИКИ"),
        h("h2", null, "Единый стиль для всей коллекции"),
        h(
          "label",
          { className: "cw-field" },
          h("span", null, "Товар"),
          h(
            "select",
            {
              value: card.id,
              "aria-label": "Товар",
              onChange: (e) => {
                setId(e.target.value);
                setHeadline("");
                setResult(null);
                setCopied(false);
                setError("");
              },
            },
            cards.map((c) => h("option", { value: c.id, key: c.id }, c.title)),
          ),
        ),
        field(
          "Описание товара для инфографики",
          options.productDescription,
          (value) =>
            change(setDescriptions)({ ...descriptions, [card.id]: value }),
          {
            area: true,
            rows: 6,
            maxLength: 3000,
            placeholder:
              "Что за товар, как выглядит, материал, цвет, форма, важные детали и комплектация",
          },
        ),
        h(
          "p",
          { className: "cw-footnote" },
          "Описание взято из карточки. Уточните детали для промпта — исходный текст карточки не изменится.",
        ),
        btn(
          "Взять описание из карточки",
          () =>
            change(setDescriptions)({
              ...descriptions,
              [card.id]: infographicProductDescription(card),
            }),
          "cw-text-button",
        ),
        field(
          "Пожелания к изображению",
          instructions,
          change(setInstructions),
          {
            area: true,
            rows: 3,
            maxLength: 1500,
            placeholder: "Фон, ракурс, детали, на которых нужен акцент",
          },
        ),
        field("Заголовок", headline, change(setHeadline), {
          placeholder: card.title,
          maxLength: 70,
        }),
        field("Подпись", caption, change(setCaption), { maxLength: 53 }),
        h(
          "fieldset",
          { className: "ct-fieldset" },
          h("legend", null, "Макет"),
          [
            ["cover", "Обложка"],
            ["details", "Детали"],
          ].map(([id, label]) =>
            btn(
              label,
              () => change(setLayout)(id),
              layout === id ? "cw-primary" : "",
              { key: id },
            ),
          ),
        ),
        h(
          "fieldset",
          { className: "ct-fieldset" },
          h("legend", null, "Палитра"),
          [
            ["sage", "Шалфей"],
            ["sand", "Песок"],
            ["ink", "Графит"],
          ].map(([id, label]) =>
            btn(
              label,
              () => change(setPalette)(id),
              "ct-palette ct-" + id + (palette === id ? " active" : ""),
              { "aria-pressed": palette === id, key: id },
            ),
          ),
        ),
        selection.length > 1
          ? h(
              "label",
              { className: "ct-check" },
              h("input", {
                type: "checkbox",
                checked: bulk,
                onChange: (e) => {
                  setBulk(e.target.checked);
                  setResult(null);
                  setCopied(false);
                },
              }),
              "Применить стиль к выбранным: " + selection.length,
            )
          : null,
        h(
          "p",
          { className: "cw-footnote" },
          "900 × 1 200 px · PNG. В демо собирается макет с вашим загруженным фото либо условным изображением товара.",
        ),
        btn(
          [icon("auto_awesome"), " Сгенерировать инфографику"],
          generate,
          "cw-primary",
          { disabled: busy },
        ),
        error
          ? h("div", { className: "cw-error", role: "alert" }, error)
          : null,
      ),
      h(
        "section",
        { className: "ct-canvas-stage" },
        h(
          "div",
          { className: "ct-canvas-top" },
          chip(
            result ? "Готово · " + result.images.length : "Предпросмотр",
            result ? "green" : "neutral",
          ),
          h("span", null, "3:4 · 900 × 1 200"),
        ),
        h("img", {
          className: "ct-canvas-image",
          src: imageSrc(preview),
          alt: "Предпросмотр инфографики",
        }),
        h(
          "div",
          { className: "ct-canvas-bottom" },
          btn("Скачать PNG", () =>
            downloadPNG(preview).catch((e) => setError(e.message)),
          ),
          btn("Добавить в карточки", save, "cw-primary", {
            disabled: !result || busy,
          }),
        ),
        h(
          "section",
          { className: "ct-studio-prompt" },
          h("h3", null, "Промпт для генерации"),
          h(
            "p",
            null,
            result
              ? "Промпт сохранится вместе с изображением: " +
                  result.cards[resultIndex].title
              : "Собирается из описания товара, характеристик и настроек макета.",
          ),
          field("Промпт для инфографики", prompt, () => {}, {
            area: true,
            rows: 12,
            readOnly: true,
          }),
          h(
            "div",
            { className: "ct-prompt-actions" },
            btn(copied ? "Скопировано" : "Копировать промпт", async () => {
              try {
                await navigator.clipboard.writeText(prompt);
                setCopied(true);
              } catch {
                setError(
                  "Не удалось скопировать. Выделите текст промпта или скачайте TXT.",
                );
              }
            }),
            btn("Скачать TXT", () =>
              saveFile(
                prompt,
                "Промпт-инфографики.txt",
                "text/plain;charset=utf-8",
              ),
            ),
          ),
          h(
            "small",
            null,
            "В моке формируется промпт и шаблонный макет. Интерпретация описания и пожеланий изображением требует подключения модели.",
          ),
        ),
      ),
      h(
        "aside",
        { className: "ct-studio-tips" },
        h("h3", null, "Фото → макет → карточка"),
        h(
          "p",
          null,
          "Загрузите фотографию товара в редакторе. Студия подставит её в макет и сохранит результат в галерею.",
        ),
        h(
          "div",
          { className: "ct-mini-mock" },
          h("img", {
            src: svgURL(
              makeImage(card, {
                palette: "sand",
                layout: "details",
                headline: card.title,
              }).svg,
            ),
            alt: "Пример альтернативного макета",
          }),
        ),
        h(
          "small",
          null,
          "Генерация новой предметной фотографии требует отдельной модели. Здесь показана компоновка инфографики.",
        ),
      ),
    );
  }
  function Excel({ cards, selection, onSave }) {
    const [rows, setRows] = React.useState(null),
      [filename, setFilename] = React.useState(""),
      [chosen, setChosen] = React.useState([]),
      [error, setError] = React.useState(""),
      [busy, setBusy] = React.useState(false);
    const targets = selection.length
      ? cards.filter((c) => selection.includes(c.id))
      : cards;
    async function upload(e) {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      setRows(null);
      setChosen([]);
      setError("");
      try {
        const parsed = await readExcel(file, cards);
        setFilename(file.name);
        setRows(parsed);
        setChosen(
          parsed
            .filter((r) => !r.errors.length && r.diff.length)
            .map((r) => r.line),
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }
    const apply = async () => {
      setBusy(true);
      try {
        await onSave(
          rows
            .filter((r) => chosen.includes(r.line))
            .map(({ id, version, patch }) => ({ id, version, patch })),
          "Excel: " + filename,
        );
        setRows(null);
        setChosen([]);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    };
    return h(
      "section",
      { className: "cw-panel ct-excel" },
      h(
        "div",
        { className: "ct-excel-head" },
        h(
          "div",
          null,
          h("div", { className: "cw-kicker" }, "МАССОВАЯ РАБОТА С КОНТЕНТОМ"),
          h("h2", null, "Редактируйте привычным способом"),
          h(
            "p",
            null,
            "Выгрузите товары, измените текст в Excel и загрузите файл обратно.",
          ),
        ),
        icon("table_view"),
      ),
      h(
        "div",
        { className: "ct-excel-steps" },
        [
          ["01", "Скачать Excel", "Все товары или только выбранные"],
          ["02", "Изменить ячейки", "Название, описание, состав, rich-блоки"],
          [
            "03",
            "Проверить и применить",
            "Сопоставление по ID и сравнение версий",
          ],
        ].map(([n, title, text]) =>
          h(
            "div",
            { key: n },
            h("span", null, n),
            h("h3", null, title),
            h("p", null, text),
          ),
        ),
      ),
      h(
        "div",
        { className: "ct-excel-actions" },
        btn(
          [icon("download"), " Скачать Excel · " + targets.length],
          () => {
            try {
              downloadExcel(targets);
            } catch (e) {
              setError(e.message);
            }
          },
          "cw-primary",
        ),
        h(
          "label",
          { className: "cw-button" },
          icon("upload"),
          "Загрузить Excel",
          h("input", {
            type: "file",
            accept: ".xlsx,.xls,.csv",
            onChange: upload,
            disabled: busy,
            hidden: true,
            "aria-label": "Загрузить Excel",
          }),
        ),
      ),
      h(
        "div",
        { className: "cw-note" },
        "Пустая ячейка очищает поле. Удалённый столбец оставляет его без изменений. Фото редактируются на сайте; Excel содержит первые два rich-блока. Импорт обновляет существующие товары.",
      ),
      error ? h("div", { className: "cw-error", role: "alert" }, error) : null,
      rows
        ? h(
            React.Fragment,
            null,
            h(
              "div",
              { className: "cw-section-title" },
              h(
                "div",
                null,
                h("h3", null, filename),
                h(
                  "p",
                  null,
                  rows.length +
                    " строк · " +
                    rows.filter((r) => r.errors.length).length +
                    " с ошибками · " +
                    chosen.length +
                    " выбрано",
                ),
              ),
              btn(
                "Применить изменения · " + chosen.length,
                apply,
                "cw-primary",
                { disabled: busy || !chosen.length },
              ),
            ),
            h(
              "div",
              { className: "ct-import-review" },
              rows.map((row) =>
                h(
                  "article",
                  { key: row.line },
                  h(
                    "div",
                    { className: "cw-section-title" },
                    h(
                      "label",
                      { className: "ct-check" },
                      h("input", {
                        type: "checkbox",
                        disabled: !!row.errors.length || !row.diff.length,
                        checked: chosen.includes(row.line),
                        onChange: (e) =>
                          setChosen((v) =>
                            e.target.checked
                              ? [...v, row.line]
                              : v.filter((n) => n !== row.line),
                          ),
                        "aria-label": "Импортировать строку " + row.line,
                      }),
                      h(
                        "strong",
                        null,
                        "Строка " + row.line + " · " + row.title,
                      ),
                    ),
                    chip(
                      row.errors.length
                        ? "Ошибка"
                        : row.diff.length
                          ? row.diff.length + " полей"
                          : "Без изменений",
                      row.errors.length ? "red" : "green",
                    ),
                  ),
                  row.errors.length
                    ? h("p", { className: "cw-red-text" }, row.errors.join(" "))
                    : row.diff.map((d) =>
                        h(
                          "div",
                          { className: "cw-diff", key: d.field },
                          h("h4", null, d.field),
                          h(
                            "div",
                            null,
                            h(
                              "section",
                              null,
                              h("small", null, "БЫЛО"),
                              h("p", null, d.before || "Пусто"),
                            ),
                            h(
                              "section",
                              null,
                              h("small", null, "СТАНЕТ"),
                              h("p", null, d.after || "Пусто"),
                            ),
                          ),
                        ),
                      ),
                ),
              ),
            ),
          )
        : h(
            "div",
            { className: "ct-drop-note" },
            icon("upload_file"),
            h(
              "p",
              null,
              "Выберите файл .xlsx, .xls или .csv — до 2 000 строк. Изменения сначала появятся в предпросмотре.",
            ),
          ),
    );
  }

  return function ContentWorkspace({ initialQuery = "" }) {
    const [state, setState] = React.useState(null),
      [view, setView] = React.useState("catalog"),
      [query, setQuery] = React.useState(initialQuery),
      [filter, setFilter] = React.useState("all"),
      [selection, setSelection] = React.useState([]),
      [page, setPage] = React.useState(0),
      [editor, setEditor] = React.useState(null),
      [batch, setBatch] = React.useState(false),
      [inline, setInline] = React.useState(null),
      [error, setError] = React.useState(""),
      [notice, setNotice] = React.useState(""),
      [busy, setBusy] = React.useState(false),
      [history, setHistory] = React.useState(false),
      [apiAccess, setApiAccess] = React.useState("demo");
    const lock = React.useRef(false);
    const load = () =>
      repository
        .load()
        .then(setState)
        .catch((e) => setError(e.message));
    React.useEffect(() => {
      load();
    }, []);
    React.useEffect(() => {
      setQuery(initialQuery);
      if (initialQuery) setView("catalog");
      setPage(0);
    }, [initialQuery]);
    React.useEffect(() => {
      if (notice) {
        const timer = setTimeout(() => setNotice(""), 3500);
        return () => clearTimeout(timer);
      }
    }, [notice]);
    async function mutate(action, message) {
      if (lock.current)
        throw new Error("Дождитесь завершения текущего действия.");
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        const next = await action();
        setState(next);
        if (message) setNotice(message);
        return next;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
    const save = (changes, source) =>
      mutate(
        () => repository.saveBatch(changes, source),
        "Сохранено товаров: " + changes.length,
      );
    const run = (fn) =>
      Promise.resolve()
        .then(fn)
        .catch((e) => setError(e.message));
    if (!state)
      return h(
        "div",
        { className: "cw" },
        empty(
          error || "Загружаем карточки…",
          "",
          error ? btn("Повторить", load) : null,
        ),
      );
    const cards = state.cards,
      chosen = cards.filter((c) => selection.includes(c.id));
    const filtered = cards.filter(
      (c) =>
        (c.title + " " + c.code + " " + c.nm)
          .toLowerCase()
          .includes(query.toLowerCase().trim()) &&
        (filter === "all" ||
          (filter === "draft" && c.status !== "published") ||
          (filter === "rich" && !c.rich.length) ||
          (filter === "images" && c.images.length < 2) ||
          (filter === "description" && !c.description)),
    );
    const pageCount = Math.max(1, Math.ceil(filtered.length / 20)),
      safePage = Math.min(page, pageCount - 1),
      visible = filtered.slice(safePage * 20, safePage * 20 + 20);
    const go = (id) => {
      if (inline) {
        setError("Сохраните или отмените быструю правку.");
        return;
      }
      setView(id);
    };
    const openGenerate = (id) => {
      setEditor(null);
      setSelection([id]);
      setView("generate");
    };
    const openStudio = (id) => {
      setEditor(null);
      setSelection([id]);
      setView("studio");
    };
    const showEditor = (id, tab = "text") => {
      if (inline) {
        setError("Сохраните или отмените быструю правку.");
        return;
      }
      setEditor({ id, tab });
    };
    async function saveInline() {
      await save(
        [
          {
            id: inline.id,
            version: inline.version,
            patch: { [inline.field]: inline.value },
          },
        ],
        "Быстрая правка",
      );
      setInline(null);
    }
    const editable = (card, key) =>
      inline?.id === card.id && inline.field === key
        ? h(
            "div",
            { className: "ct-inline" },
            h(key === "description" ? "textarea" : "input", {
              autoFocus: true,
              value: inline.value,
              "aria-label": "Быстрая правка: " + TEXT_FIELDS[key],
              onChange: (e) =>
                setInline((v) => ({ ...v, value: e.target.value })),
              onKeyDown: (e) => {
                if (e.key === "Escape") setInline(null);
                if (e.key === "Enter" && (key !== "description" || e.ctrlKey)) {
                  e.preventDefault();
                  run(saveInline);
                }
              },
            }),
            h(
              "div",
              null,
              btn("Сохранить", () => run(saveInline), "cw-primary", {
                disabled: busy,
              }),
              btn("Отмена", () => setInline(null)),
            ),
          )
        : btn(
            h(
              React.Fragment,
              null,
              h(
                "span",
                null,
                card[key]
                  ? short(card[key])
                  : "Добавить " + TEXT_FIELDS[key].toLowerCase(),
              ),
              icon("edit"),
            ),
            () => {
              if (inline) {
                setError("Сначала завершите текущую правку.");
                return;
              }
              setInline({
                id: card.id,
                version: card.version,
                field: key,
                value: card[key],
              });
            },
            "ct-cell-edit",
            {
              "aria-label": `Редактировать ${TEXT_FIELDS[key].toLowerCase()}: ${card.code}`,
            },
          );
    return h(
      "div",
      { className: "cw ct" },
      h(
        "div",
        { className: "cw-topline" },
        h("span", { className: "cw-kicker" }, "РАБОЧЕЕ ПРОСТРАНСТВО КОНТЕНТА"),
        h(
          "span",
          { className: "cw-demo" },
          h("i"),
          "Демо · изменения сохраняются локально",
        ),
      ),
      h(
        "header",
        { className: "ct-heading" },
        h(
          "div",
          null,
          h("h1", null, "Ваши товары. Ваш контент."),
          h(
            "p",
            null,
            "Создавайте карточки, редактируйте сотни товаров и собирайте инфографику в одном месте.",
          ),
        ),
        h(
          "div",
          { className: "cw-actions" },
          btn([icon("table_view"), " Excel"], () => go("excel")),
          btn(
            [icon("auto_awesome"), " Создать карточки"],
            () => {
              setSelection([]);
              go("generate");
            },
            "cw-primary",
          ),
        ),
      ),
      h(
        "nav",
        { className: "cw-nav", "aria-label": "Разделы контента" },
        [
          ["catalog", "Каталог", cards.length],
          ["generate", "Генерация", null],
          ["studio", "Инфографика", null],
          ["excel", "Excel", null],
          ["queries", "Поисковые запросы", null],
        ].map(([id, label, count]) =>
          btn(
            [
              label,
              count !== null
                ? h("span", { className: "cw-tab-count", key: "n" }, count)
                : null,
            ],
            () => go(id),
            view === id ? "active" : "",
            { "aria-pressed": view === id, key: id },
          ),
        ),
        btn("История", () => setHistory(true), "ct-history-button"),
      ),
      error
        ? h(
            "div",
            { className: "cw-error", role: "alert" },
            error,
            btn("Закрыть", () => setError("")),
          )
        : null,
      state.warning
        ? h("div", { className: "cw-warning" }, state.warning)
        : null,
      view === "catalog"
        ? h(
            React.Fragment,
            null,
            h(
              "div",
              { className: "ct-shortcuts" },
              btn(
                h(
                  React.Fragment,
                  null,
                  icon("auto_awesome"),
                  h(
                    "span",
                    null,
                    h("strong", null, "Создать с AI"),
                    h("small", null, "Карточки и описания из фактов"),
                  ),
                  icon("arrow_forward"),
                ),
                () => {
                  setSelection([]);
                  go("generate");
                },
              ),
              btn(
                h(
                  React.Fragment,
                  null,
                  icon("palette"),
                  h(
                    "span",
                    null,
                    h("strong", null, "Собрать инфографику"),
                    h("small", null, "Макеты и единый стиль коллекции"),
                  ),
                  icon("arrow_forward"),
                ),
                () => go("studio"),
              ),
              btn(
                h(
                  React.Fragment,
                  null,
                  icon("table_view"),
                  h(
                    "span",
                    null,
                    h("strong", null, "Массовые правки в Excel"),
                    h("small", null, "Выгрузить → изменить → загрузить"),
                  ),
                ),
                () => go("excel"),
              ),
            ),
            h(
              "section",
              { className: "cw-panel ct-catalog" },
              h(
                "div",
                { className: "cw-catalog-tools" },
                h(
                  "label",
                  { className: "cw-search" },
                  icon("search"),
                  h("input", {
                    "aria-label": "Поиск карточек",
                    placeholder: "Название или артикул",
                    value: query,
                    onChange: (e) => {
                      setQuery(e.target.value);
                      setPage(0);
                    },
                  }),
                ),
                h(
                  "span",
                  { className: "ct-catalog-count" },
                  filtered.length + " товаров",
                ),
                btn("Скачать Excel", () =>
                  run(() => downloadExcel(chosen.length ? chosen : filtered)),
                ),
              ),
              h(
                "div",
                { className: "cw-filters" },
                [
                  ["all", "Все товары"],
                  ["draft", "Черновики"],
                  ["description", "Без описания"],
                  ["rich", "Без rich-контента"],
                  ["images", "Мало изображений"],
                ].map(([id, label]) =>
                  btn(
                    label,
                    () => {
                      setFilter(id);
                      setPage(0);
                    },
                    filter === id ? "active" : "",
                    { key: id, "aria-pressed": filter === id },
                  ),
                ),
              ),
              selection.length
                ? h(
                    "div",
                    { className: "cw-bulk" },
                    h("strong", null, "Выбрано: " + selection.length),
                    btn("Генерировать для выбранных", () => go("generate")),
                    btn("Изменить поле", () => setBatch(true)),
                    btn("Инфографика", () => go("studio")),
                    btn("Excel", () => go("excel")),
                    btn(
                      "Снять выбор",
                      () => setSelection([]),
                      "cw-text-button",
                    ),
                  )
                : h(
                    "div",
                    { className: "ct-table-hint" },
                    icon("edit_note"),
                    "Нажмите на название или описание для быстрой правки. Выберите товары для массовых действий.",
                  ),
              visible.length
                ? h(
                    "div",
                    { className: "cw-table-wrap" },
                    h(
                      "table",
                      { className: "ct-table" },
                      h(
                        "thead",
                        null,
                        h(
                          "tr",
                          null,
                          h(
                            "th",
                            null,
                            h("input", {
                              type: "checkbox",
                              "aria-label": "Выбрать страницу",
                              checked: visible.every((c) =>
                                selection.includes(c.id),
                              ),
                              onChange: (e) =>
                                setSelection((v) =>
                                  e.target.checked
                                    ? [
                                        ...new Set([
                                          ...v,
                                          ...visible.map((c) => c.id),
                                        ]),
                                      ]
                                    : v.filter(
                                        (id) =>
                                          !visible.some((c) => c.id === id),
                                      ),
                                ),
                            }),
                          ),
                          [
                            "Товар / название",
                            "Описание",
                            "Rich-контент",
                            "Изображения",
                            "Статус",
                            "",
                          ].map((t, i) => h("th", { key: i }, t)),
                        ),
                      ),
                      h(
                        "tbody",
                        null,
                        visible.map((card) =>
                          h(
                            "tr",
                            { key: card.id },
                            h(
                              "td",
                              null,
                              h("input", {
                                type: "checkbox",
                                "aria-label": "Выбрать " + card.code,
                                checked: selection.includes(card.id),
                                onChange: (e) =>
                                  setSelection((v) =>
                                    e.target.checked
                                      ? [...v, card.id]
                                      : v.filter((id) => id !== card.id),
                                  ),
                              }),
                            ),
                            h(
                              "td",
                              null,
                              h(
                                "div",
                                { className: "ct-product" },
                                thumb(card),
                                h(
                                  "div",
                                  null,
                                  editable(card, "title"),
                                  h(
                                    "small",
                                    null,
                                    card.code +
                                      " · " +
                                      (card.nm || "Новый товар"),
                                  ),
                                ),
                              ),
                            ),
                            h(
                              "td",
                              null,
                              editable(card, "description"),
                              h(
                                "small",
                                null,
                                card.description.length + " / 2 000 символов",
                              ),
                            ),
                            h(
                              "td",
                              null,
                              btn(
                                card.rich.length
                                  ? card.rich.length + " блоков"
                                  : "Создать",
                                () => showEditor(card.id, "rich"),
                                "ct-rich-button",
                              ),
                              h(
                                "div",
                                { className: "ct-rich-bars" },
                                Array.from({ length: 3 }, (_, i) =>
                                  h("i", {
                                    className:
                                      i < card.rich.length ? "filled" : "",
                                    key: i,
                                  }),
                                ),
                              ),
                            ),
                            h(
                              "td",
                              null,
                              h(
                                "div",
                                { className: "ct-image-stack" },
                                card.images.slice(0, 3).map((img) =>
                                  h("img", {
                                    key: img.id,
                                    src: imageSrc(img),
                                    alt: "",
                                  }),
                                ),
                              ),
                              btn(
                                card.images.length + " изображений",
                                () => showEditor(card.id, "images"),
                                "ct-rich-button",
                                { "aria-label": "Изображения " + card.code },
                              ),
                            ),
                            h(
                              "td",
                              null,
                              chip(
                                card.status === "published"
                                  ? "Опубликована"
                                  : card.status === "new"
                                    ? "Новый товар"
                                    : "Черновик",
                                card.status === "published"
                                  ? "neutral"
                                  : "amber",
                              ),
                            ),
                            h(
                              "td",
                              null,
                              btn(
                                icon("open_in_new"),
                                () => showEditor(card.id),
                                "cw-icon-button",
                                { "aria-label": "Открыть " + card.code },
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                : empty(
                    "Ничего не найдено",
                    "Измените запрос или фильтр.",
                    btn("Сбросить фильтры", () => {
                      setQuery("");
                      setFilter("all");
                    }),
                  ),
              h(
                "footer",
                { className: "ct-pagination" },
                btn(
                  "Выбрать все по фильтру · " + filtered.length,
                  () => setSelection(filtered.map((c) => c.id)),
                  "cw-text-button",
                ),
                h(
                  "div",
                  null,
                  btn("←", () => setPage(Math.max(0, safePage - 1)), "", {
                    disabled: safePage === 0,
                    "aria-label": "Предыдущая страница",
                  }),
                  h("span", null, safePage + 1 + " / " + pageCount),
                  btn("→", () => setPage(safePage + 1), "", {
                    disabled: safePage + 1 === pageCount,
                    "aria-label": "Следующая страница",
                  }),
                ),
              ),
            ),
          )
        : null,
      view === "generate"
        ? h(Generator, {
            cards,
            selection,
            onSave: save,
            onCreate: (rows) =>
              mutate(() => repository.createMany(rows), "Карточки созданы"),
            onJob: (job) => mutate(() => repository.recordJob(job)),
          })
        : null,
      view === "studio" ? h(Studio, { cards, selection, onSave: save }) : null,
      view === "excel" ? h(Excel, { cards, selection, onSave: save }) : null,
      view === "queries"
        ? h(
            "section",
            { className: "cw-panel ct-queries" },
            h(
              "div",
              { className: "cw-section-title" },
              h(
                "div",
                null,
                h("h2", null, "Запросы для ваших описаний"),
                h(
                  "p",
                  null,
                  "Слова, по которым покупатели уже находят ваши товары.",
                ),
              ),
              h(
                "select",
                {
                  "aria-label": "Доступ к поисковым запросам",
                  value: apiAccess,
                  onChange: (e) => setApiAccess(e.target.value),
                },
                h("option", { value: "demo" }, "Демо-данные"),
                h("option", { value: "nojam" }, "Без подписки «Джем»"),
                h("option", { value: "noaccess" }, "Нет доступа к аналитике"),
              ),
            ),
            h(
              "div",
              { className: "cw-note" },
              "Источник: WB Analytics API · токен «Аналитика» + подписка «Джем». Доступны топ запросов по своим товарам и CSV-выгрузки. ",
              h(
                "a",
                { href: API_DOC, target: "_blank", rel: "noreferrer" },
                "Документация WB ↗",
              ),
            ),
            apiAccess !== "demo"
              ? empty(
                  apiAccess === "nojam"
                    ? "Нужна подписка «Джем»"
                    : "Нужен доступ к аналитике",
                  "Редактор, генерация и Excel продолжают работать. Поисковые запросы станут доступны после подключения.",
                )
              : h(
                  "div",
                  { className: "cw-table-wrap" },
                  h(
                    "table",
                    { className: "ct-search-table" },
                    h(
                      "thead",
                      null,
                      h(
                        "tr",
                        null,
                        [
                          "Товар",
                          "Поисковая фраза",
                          "Средняя позиция · демо",
                          "Работа с текстом",
                        ].map((t) => h("th", { key: t }, t)),
                      ),
                    ),
                    h(
                      "tbody",
                      null,
                      cards
                        .filter((c) => c.search)
                        .map((c) =>
                          h(
                            "tr",
                            { key: c.id },
                            h("td", null, c.title),
                            h("td", null, h("strong", null, c.search)),
                            h("td", null, c.rank ? "#" + c.rank : "—"),
                            h(
                              "td",
                              null,
                              btn("Открыть описание", () => showEditor(c.id)),
                            ),
                          ),
                        ),
                    ),
                  ),
                ),
            h(
              "p",
              { className: "cw-footnote" },
              "Показаны синтетические примеры. API не подключён. Это не полная база ключевых слов рынка и не гарантия попадания в поиск.",
            ),
          )
        : null,
      h(
        "footer",
        { className: "cw-bottom" },
        h("span", null, "MarginPilot · Контент-центр"),
        h(
          "span",
          null,
          "Шаблонная генерация · " +
            state.jobs.length +
            " запусков · " +
            state.history.length +
            " сохранений",
        ),
      ),
      editor && cards.find((c) => c.id === editor.id)
        ? h(Editor, {
            key: editor.id,
            initialTab: editor.tab,
            card: cards.find((c) => c.id === editor.id),
            onClose: () => setEditor(null),
            onSave: save,
            onGenerate: openGenerate,
            onStudio: openStudio,
          })
        : null,
      batch
        ? h(Batch, {
            cards: chosen,
            onClose: () => setBatch(false),
            onSave: save,
          })
        : null,
      history
        ? h(
            Modal,
            {
              title: "История контента",
              subtitle: "Сохранения на этом устройстве",
              onClose: () => setHistory(false),
              wide: true,
            },
            h(
              "div",
              { className: "cw-dialog-body" },
              state.history.length
                ? state.history.slice(0, 100).map((item) =>
                    h(
                      "article",
                      { className: "ct-history-row", key: item.id },
                      h(
                        "div",
                        null,
                        h("strong", null, item.after.title),
                        h(
                          "small",
                          null,
                          stamp(item.at) +
                            " · " +
                            item.source +
                            " · v" +
                            item.version,
                        ),
                      ),
                      h(
                        "details",
                        null,
                        h("summary", null, "Что изменилось"),
                        Object.entries({
                          ...TEXT_FIELDS,
                          category: "Категория",
                          brand: "Бренд",
                          attributes: "Характеристики",
                        })
                          .filter(
                            ([key]) =>
                              JSON.stringify(item.before[key]) !==
                              JSON.stringify(item.after[key]),
                          )
                          .map(([key, label]) =>
                            h(
                              "div",
                              { key },
                              h("strong", null, label),
                              h(
                                "p",
                                null,
                                key === "attributes"
                                  ? (item.before.attributes || [])
                                      .map((a) => a.name + ": " + a.value)
                                      .join("; ") +
                                      " → " +
                                      (item.after.attributes || [])
                                        .map((a) => a.name + ": " + a.value)
                                        .join("; ")
                                  : (item.before[key] || "—") +
                                      " → " +
                                      (item.after[key] || "—"),
                              ),
                            ),
                          ),
                        chip("Сохранено", "green"),
                      ),
                    ),
                  )
                : empty(
                    "История пока пуста",
                    "Здесь появятся правки из редактора, генератора и Excel.",
                  ),
            ),
          )
        : null,
      notice
        ? h(
            "div",
            { className: "cw-toast", role: "status" },
            icon("check_circle"),
            notice,
          )
        : null,
    );
  };
}
