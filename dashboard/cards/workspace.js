import {
  createMockRepository,
  PERIOD,
  STATUS,
  queriesFor,
  rate,
  forecast,
  suggestedChange,
} from "./data.js";

const number = (value) => new Intl.NumberFormat("ru-RU").format(value);
const percent = (value) =>
  value == null ? "—" : number(Math.round(value * 10) / 10) + "%";
const rub = (value) => number(value) + " ₽";
const date = (value) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const kindLabel = {
  buyout: "Выкуп",
  search: "Поиск",
  economics: "Экономика",
  content: "Контент",
  variants: "Варианты",
  healthy: "В порядке",
  new: "Черновик",
};

export function createCardsWorkspace(
  React,
  repository = createMockRepository(),
) {
  const h = React.createElement;
  const icon = (name) =>
    h("span", { className: "cw-icon", "aria-hidden": true }, name);
  const badge = (text, tone = "neutral") =>
    h("span", { className: "cw-badge cw-" + tone }, text);
  const button = (text, onClick, style = "", extra = {}) =>
    h(
      "button",
      { type: "button", className: "cw-button " + style, onClick, ...extra },
      text,
    );
  const art = (card, large = false) =>
    h(
      "div",
      {
        className: `cw-art cw-art-${card.tone}${large ? " cw-art-large" : ""}`,
        "aria-label": "Схематичное изображение товара",
        role: "img",
      },
      h(
        "svg",
        { viewBox: "0 0 100 110", "aria-hidden": true },
        h("ellipse", {
          cx: 50,
          cy: 101,
          rx: 31,
          ry: 4,
          fill: "#17231c",
          opacity: ".08",
        }),
        h("path", {
          d:
            card.category === "Брюки" || card.category === "Джинсы"
              ? "M28 16 L72 16 L79 94 L55 94 L50 44 L45 94 L21 94 Z"
              : card.category === "Платья"
                ? "M36 12 L45 17 L55 17 L64 12 L74 29 L66 36 L61 32 L66 57 L82 96 L18 96 L34 57 L39 32 L34 36 L26 29 Z"
                : "M32 16 L42 12 Q50 25 58 12 L68 16 L88 38 L73 50 L66 43 L69 94 L31 94 L34 43 L27 50 L12 38 Z",
          fill: "var(--garment)",
          stroke: "var(--garment-line)",
          strokeWidth: 1.3,
          strokeLinejoin: "round",
        }),
        h("path", {
          d: "M43 18 Q50 29 57 18 M38 49 L36 86 M63 49 L65 86",
          fill: "none",
          stroke: "var(--garment-line)",
          opacity: ".5",
          strokeWidth: 1.2,
        }),
      ),
      large ? h("span", null, "Эскиз · фото не подключены") : null,
    );
  const empty = (title, copy, action) =>
    h(
      "div",
      { className: "cw-empty" },
      icon("fact_check"),
      h("h3", null, title),
      h("p", null, copy),
      action,
    );

  function Dialog({ title, subtitle, children, onClose, wide = false }) {
    const ref = React.useRef();
    const closeRef = React.useRef(onClose);
    closeRef.current = onClose;
    React.useEffect(() => {
      const previous = document.activeElement,
        old = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      ref.current?.querySelector("button")?.focus();
      const key = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeRef.current();
        }
        if (e.key === "Tab") {
          const items = [
            ...ref.current.querySelectorAll(
              "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]",
            ),
          ];
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
          if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      };
      document.addEventListener("keydown", key);
      return () => {
        document.body.style.overflow = old;
        document.removeEventListener("keydown", key);
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
          button(icon("close"), onClose, "cw-icon-button", {
            "aria-label": "Закрыть панель",
          }),
        ),
        children,
      ),
    );
  }

  function Editor({
    card,
    change,
    onSave,
    onClose,
    openStudio,
    openFinance,
    busy,
    onTransition,
    onRollback,
    fail,
    initialTab = "diagnosis",
    externalError,
  }) {
    const [tab, setTab] = React.useState(initialTab);
    const [draft, setDraft] = React.useState(
      change?.after || {
        title: card.title,
        description: card.description,
        composition: card.composition,
        measurements: card.measurements,
      },
    );
    const [owner, setOwner] = React.useState(
      change?.owner || "Игорь · менеджер",
    );
    const [dirty, setDirty] = React.useState(false);
    const [confirmClose, setConfirmClose] = React.useState(false);
    const [validation, setValidation] = React.useState("");
    const [templateUsed, setTemplateUsed] = React.useState(false);
    const changeable = !change || ["draft", "rejected"].includes(change.status);
    const projection = forecast(card);
    const close = () => (dirty ? setConfirmClose(true) : onClose());
    const tabs = [
      ["diagnosis", "Диагностика"],
      ["content", "Контент"],
      ["queries", "Запросы"],
      ["diff", "Изменения"],
    ];
    const update = (key, value) => {
      setDraft((v) => ({ ...v, [key]: value }));
      setDirty(true);
    };
    const save = async () => {
      setValidation("");
      try {
        await onSave(card.id, draft, owner);
        setDirty(false);
        setTab("diff");
      } catch (e) {
        setValidation(e.message);
      }
    };
    const metrics = [
      ["Показы", card.funnel[0], card.previous[0]],
      ["Переходы", card.funnel[1], card.previous[1]],
      ["В корзину", card.funnel[2], card.previous[2]],
      ["Заказы", card.funnel[3], card.previous[3]],
      ["Выкупы¹", card.funnel[4], card.previous[4]],
    ];
    const fields = [
      ["title", "Название", 60],
      ["description", "Описание", 2000],
      ["composition", "Состав", 250],
      ["measurements", "Замеры изделия", 500],
    ];
    return h(
      Dialog,
      {
        title: card.title,
        subtitle: `${card.isNew ? "НОВАЯ КАРТОЧКА" : "WB · " + card.nm} / ВЕРСИЯ ${card.version}`,
        onClose: close,
        wide: true,
      },
      h(
        "nav",
        { className: "cw-detail-tabs", "aria-label": "Разделы карточки" },
        tabs.map(([id, label]) =>
          button(label, () => setTab(id), tab === id ? "active" : "", {
            "aria-pressed": tab === id,
            key: id,
          }),
        ),
      ),
      h(
        "div",
        { className: "cw-dialog-body" },
        externalError
          ? h("div", { className: "cw-error", role: "alert" }, externalError)
          : null,
        tab === "diagnosis"
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "cw-product-intro" },
                art(card, true),
                h(
                  "div",
                  null,
                  badge(
                    kindLabel[card.kind],
                    card.kind === "economics" ? "red" : "green",
                  ),
                  h("h3", null, card.label),
                  h("p", null, card.evidence),
                  h(
                    "div",
                    { className: "cw-inline-stats" },
                    h(
                      "span",
                      null,
                      "Цена ",
                      h("strong", null, card.isNew ? "—" : rub(card.price)),
                    ),
                    h(
                      "span",
                      null,
                      "На выкуп ",
                      h(
                        "strong",
                        { className: card.profitUnit < 0 ? "cw-red-text" : "" },
                        card.isNew ? "—" : rub(card.profitUnit),
                      ),
                    ),
                    h(
                      "span",
                      null,
                      "Остаток ",
                      h("strong", null, card.stock + " шт."),
                    ),
                  ),
                ),
              ),
              h(
                "div",
                { className: "cw-section-title" },
                h("h3", null, "Где теряем покупателя"),
                h("span", null, PERIOD),
              ),
              h(
                "div",
                { className: "cw-funnel" },
                metrics.map(([label, value, previous], i) =>
                  h(
                    "div",
                    { key: label },
                    h("span", null, label),
                    h("strong", null, card.isNew ? "—" : number(value)),
                    h(
                      "div",
                      { className: "cw-funnel-bar" },
                      h("i", { style: { width: 100 - i * 17 + "%" } }),
                    ),
                    h(
                      "small",
                      null,
                      i
                        ? percent(rate(value, card.funnel[i - 1])) +
                            " от предыдущего шага"
                        : "Все источники",
                    ),
                    h(
                      "small",
                      {
                        className:
                          value < previous ? "cw-red-text" : "cw-green-text",
                      },
                      previous
                        ? ((value - previous) / previous >= 0 ? "+" : "") +
                            number(
                              Math.round(((value - previous) / previous) * 100),
                            ) +
                            "% к предыдущим 14 дням"
                        : "Нет сравнения",
                    ),
                  ),
                ),
              ),
              h(
                "p",
                { className: "cw-footnote" },
                "¹ Выкупы в демо относятся к заказам выбранного периода. В реальном отчёте незавершённые заказы требуют ожидания. Данные синтетические.",
              ),
              projection
                ? h(
                    "div",
                    { className: "cw-scenario" },
                    h(
                      "div",
                      null,
                      h(
                        "div",
                        { className: "cw-kicker" },
                        "СЦЕНАРИЙ · НЕ ПРОГНОЗ МОДЕЛИ",
                      ),
                      h("h3", null, "Что может дать изменение"),
                      h(
                        "p",
                        null,
                        "Если " +
                          (card.kind === "search"
                            ? "CTR вырастет на 0,4 п.п."
                            : "выкуп вырастет на 3 п.п.") +
                          " при прочих равных.",
                      ),
                    ),
                    h(
                      "strong",
                      null,
                      "+" + number(projection.low) + "–" + rub(projection.high),
                    ),
                    h(
                      "details",
                      null,
                      h("summary", null, "Расчёт и допущения"),
                      h("p", null, projection.formula),
                      h("p", null, projection.note),
                    ),
                  )
                : null,
              card.kind === "variants"
                ? h(
                    "div",
                    { className: "cw-note" },
                    icon("info"),
                    h(
                      "p",
                      null,
                      "Объединение — отдельная операция после проверки предмета и характеристик. Рейтинг рассчитывается по артикулам; общий рейтинг зависит от опции WB. Рост позиции не гарантирован. Здесь можно подготовить задачу, склейка не выполняется.",
                    ),
                  )
                : null,
              h(
                "div",
                { className: "cw-section-title" },
                h("h3", null, "Следующий шаг"),
                badge("Уверенность: " + card.confidence),
              ),
              h(
                "div",
                { className: "cw-next" },
                h(
                  "div",
                  null,
                  h("strong", null, card.action),
                  h(
                    "p",
                    null,
                    card.kind === "economics"
                      ? "Пересчитайте цену и расходы до масштабирования трафика."
                      : "Сначала проверьте факты, затем подготовьте конкретную правку.",
                  ),
                ),
                card.kind === "economics"
                  ? button(
                      "Открыть финансы ↗",
                      () => openFinance(card.id),
                      "cw-primary",
                    )
                  : button(
                      "Подготовить изменение →",
                      () => setTab("content"),
                      "cw-primary",
                    ),
              ),
              h(
                "p",
                { className: "cw-footnote" },
                "Источники для интеграции: WB Analytics · Content · отзывы · финансовая модель MarginPilot. Сейчас все показатели — демо.",
              ),
            )
          : null,
        tab === "content"
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "cw-section-title" },
                h(
                  "div",
                  null,
                  h("h3", null, "Редактор карточки"),
                  h(
                    "p",
                    null,
                    "Сохранение создаёт черновик. Опубликованная версия остаётся прежней.",
                  ),
                ),
                badge(
                  change ? STATUS[change.status] : "Локальный черновик",
                  "amber",
                ),
              ),
              !changeable
                ? h(
                    "div",
                    { className: "cw-note" },
                    "Изменение уже отправлено. Верните его на доработку в разделе «Изменения».",
                  )
                : null,
              fields.map(([key, label, max]) =>
                h(
                  "label",
                  { className: "cw-field", key },
                  h(
                    "span",
                    null,
                    label,
                    h("small", null, `${(draft[key] || "").length} / ${max}`),
                  ),
                  key === "title"
                    ? h("input", {
                        value: draft[key] || "",
                        maxLength: max,
                        disabled: !changeable,
                        onChange: (e) => update(key, e.target.value),
                      })
                    : h("textarea", {
                        rows: key === "description" ? 5 : 2,
                        value: draft[key] || "",
                        maxLength: max,
                        disabled: !changeable,
                        onChange: (e) => update(key, e.target.value),
                      }),
                ),
              ),
              h(
                "div",
                { className: "cw-editor-actions" },
                button(
                  [icon("auto_awesome"), " Подставить демо-заготовку"],
                  () => {
                    setDraft((v) => ({ ...v, ...suggestedChange(card) }));
                    setDirty(true);
                    setTemplateUsed(true);
                  },
                  "",
                  { disabled: !changeable },
                ),
                h("span", null, "Без обращения к AI · факты нужно проверить"),
              ),
              templateUsed
                ? h(
                    "p",
                    { className: "cw-warning" },
                    "В заготовке есть служебные формулировки. Замените их проверенными фактами перед согласованием.",
                  )
                : null,
              h(
                "div",
                { className: "cw-media-brief" },
                icon("photo_library"),
                h(
                  "div",
                  null,
                  h("strong", null, "Фото и инфографика"),
                  h(
                    "p",
                    null,
                    card.photos +
                      " фото в демо · обложка, посадка, детали, замеры. Отдельная студия открывается после сохранения текста.",
                  ),
                ),
                button("Открыть студию ↗", () => {
                  if (dirty) {
                    setValidation("Сохраните текст перед переходом в студию.");
                    return;
                  }
                  openStudio(card.isNew ? "new" : card.id);
                }),
              ),
              h(
                "label",
                { className: "cw-field" },
                h("span", null, "Ответственный"),
                h(
                  "select",
                  {
                    value: owner,
                    disabled: !changeable,
                    onChange: (e) => {
                      setOwner(e.target.value);
                      setDirty(true);
                    },
                  },
                  [
                    "Игорь · менеджер",
                    "Елена · владелец",
                    "Анна · контент",
                  ].map((v) => h("option", { key: v }, v)),
                ),
              ),
              validation
                ? h("div", { className: "cw-error", role: "alert" }, validation)
                : null,
              h(
                "footer",
                { className: "cw-editor-footer" },
                h(
                  "span",
                  null,
                  dirty
                    ? "Есть несохранённые изменения"
                    : "Все изменения сохранены",
                ),
                button(
                  busy ? "Сохраняем…" : "Сохранить черновик",
                  save,
                  "cw-primary",
                  { disabled: busy || !changeable },
                ),
              ),
            )
          : null,
        tab === "queries"
          ? h(
              React.Fragment,
              null,
              h("h3", null, "Как покупатели находят товар"),
              h(
                "p",
                { className: "cw-muted" },
                "Запросы из демо-отчёта магазина. Показы не равны частотности всего рынка.",
              ),
              queryTable(card),
              h(
                "div",
                { className: "cw-note" },
                "Добавляйте только запросы, соответствующие реальному товару. Наличие ключа не гарантирует рост позиции.",
              ),
              button(
                "Перейти к описанию →",
                () => setTab("content"),
                "cw-primary",
              ),
            )
          : null,
        tab === "diff"
          ? change
            ? h(
                React.Fragment,
                null,
                h(
                  "div",
                  { className: "cw-section-title" },
                  h("h3", null, change.id),
                  badge(
                    STATUS[change.status],
                    change.status === "failed"
                      ? "red"
                      : change.status === "observing"
                        ? "green"
                        : "amber",
                  ),
                ),
                h(
                  "p",
                  { className: "cw-muted" },
                  change.owner + " · исходная версия " + change.baseVersion,
                ),
                fields
                  .filter(([key]) => change.before[key] !== change.after[key])
                  .map(([key, label]) =>
                    h(
                      "div",
                      { className: "cw-diff", key },
                      h("h4", null, label),
                      h(
                        "div",
                        null,
                        h(
                          "section",
                          null,
                          h("small", null, "БЫЛО"),
                          h("p", null, change.before[key] || "Не заполнено"),
                        ),
                        h(
                          "section",
                          null,
                          h("small", null, "СТАНЕТ"),
                          h("p", null, change.after[key] || "Не заполнено"),
                        ),
                      ),
                    ),
                  ),
                h(
                  "div",
                  { className: "cw-timeline" },
                  change.events.map((e, i) =>
                    h(
                      "div",
                      { key: i },
                      h("time", null, date(e.at)),
                      h("span", null, e.text),
                    ),
                  ),
                ),
                change.status === "observing"
                  ? h(
                      "div",
                      { className: "cw-note" },
                      "Начато наблюдение на 14 дней. Факт эффекта ещё не рассчитан. Сравнение до/после само по себе не доказывает влияние правки.",
                    )
                  : null,
                h(
                  "div",
                  { className: "cw-editor-actions" },
                  ["draft", "rejected"].includes(change.status)
                    ? button(
                        "Отправить на согласование",
                        () => onTransition(change.id, "pending"),
                        "cw-primary",
                        { disabled: busy || dirty },
                      )
                    : null,
                  change.status === "pending"
                    ? button(
                        "Согласовать · демо",
                        () => onTransition(change.id, "approved"),
                        "cw-primary",
                        { disabled: busy },
                      )
                    : null,
                  ["pending", "approved", "failed"].includes(change.status)
                    ? button(
                        "На доработку",
                        () => onTransition(change.id, "rejected"),
                        "",
                        { disabled: busy },
                      )
                    : null,
                  ["approved", "failed"].includes(change.status)
                    ? button(
                        change.status === "failed"
                          ? "Повторить публикацию · демо"
                          : "Применить в демо",
                        () => onTransition(change.id, "observing", { fail }),
                        "cw-primary",
                        { disabled: busy || card.isNew },
                      )
                    : null,
                  change.status === "observing"
                    ? button(
                        "Подготовить откат",
                        () => onRollback(change.id),
                        "",
                        { disabled: busy },
                      )
                    : null,
                  button("Скачать JSON", () =>
                    download(change, change.id + ".json"),
                  ),
                ),
                card.isNew
                  ? h(
                      "p",
                      { className: "cw-footnote" },
                      "Создание в WB потребует фото, предмета и обязательных характеристик. Сейчас доступен переносимый черновик.",
                    )
                  : null,
              )
            : empty(
                "Пока нет изменений",
                "Сохраните правку в редакторе — здесь появится сравнение до/после.",
                button(
                  "Открыть редактор",
                  () => setTab("content"),
                  "cw-primary",
                ),
              )
          : null,
        confirmClose
          ? h(
              "div",
              { className: "cw-unsaved", role: "alert" },
              h("strong", null, "Текст ещё не сохранён"),
              h("p", null, "Закрыть панель и потерять несохранённые правки?"),
              button("Продолжить редактирование", () => setConfirmClose(false)),
              button("Закрыть без сохранения", onClose),
            )
          : null,
      ),
    );
  }

  function download(data, filename) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function queryTable(card) {
    const queries = queriesFor(card);
    return queries.length
      ? h(
          "div",
          { className: "cw-table-wrap" },
          h(
            "table",
            { className: "cw-query-table" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                [
                  "Запрос",
                  "Показы",
                  "CTR",
                  "Заказы",
                  "Позиция",
                  "В карточке",
                ].map((t) => h("th", { key: t }, t)),
              ),
            ),
            h(
              "tbody",
              null,
              queries.map((q) =>
                h(
                  "tr",
                  { key: q.phrase },
                  h(
                    "td",
                    null,
                    h("strong", null, q.phrase),
                    h("small", null, q.relevance),
                  ),
                  h("td", null, number(q.views)),
                  h("td", null, percent(rate(q.opens, q.views))),
                  h("td", null, q.orders),
                  h(
                    "td",
                    null,
                    "#" + q.rank,
                    h("small", null, "ранее #" + q.previous),
                  ),
                  h(
                    "td",
                    null,
                    badge(
                      q.coverage,
                      q.coverage === "Проверить описание" ? "amber" : "neutral",
                    ),
                  ),
                ),
              ),
            ),
          ),
        )
      : empty(
          "Запросов пока нет",
          "Они появятся после публикации и накопления данных.",
        );
  }

  function NewCard({ onCreate, onClose, busy }) {
    const [title, setTitle] = React.useState(""),
      [category, setCategory] = React.useState("Пиджаки"),
      [error, setError] = React.useState("");
    return h(
      Dialog,
      { title: "Новая карточка", subtitle: "ЧЕРНОВИК ТОВАРА", onClose },
      h(
        "form",
        {
          className: "cw-dialog-body",
          onSubmit: async (e) => {
            e.preventDefault();
            try {
              await onCreate(title, category);
            } catch (e) {
              setError(e.message);
            }
          },
        },
        h(
          "p",
          { className: "cw-muted" },
          "Начните с товара. Состав, замеры и контент можно заполнить в редакторе.",
        ),
        h(
          "label",
          { className: "cw-field" },
          h("span", null, "Название товара"),
          h("input", {
            required: true,
            maxLength: 60,
            value: title,
            onChange: (e) => setTitle(e.target.value),
            placeholder: "Например, жакет женский «Лея»",
          }),
        ),
        h(
          "label",
          { className: "cw-field" },
          h("span", null, "Категория для демо"),
          h(
            "select",
            { value: category, onChange: (e) => setCategory(e.target.value) },
            ["Пиджаки", "Платья", "Футболки", "Брюки", "Джинсы", "Другое"].map(
              (c) => h("option", { key: c }, c),
            ),
          ),
        ),
        error ? h("p", { role: "alert", className: "cw-error" }, error) : null,
        h(
          "button",
          { type: "submit", className: "cw-button cw-primary", disabled: busy },
          "Создать черновик",
        ),
      ),
    );
  }

  return function CardsWorkspace({
    openStudio = () => {},
    openFinance = () => {},
    initialQuery = "",
  }) {
    const [snapshot, setSnapshot] = React.useState(null),
      [error, setError] = React.useState(""),
      [busy, setBusy] = React.useState(false);
    const [view, setView] = React.useState("queue"),
      [query, setQuery] = React.useState(initialQuery),
      [filter, setFilter] = React.useState("all"),
      [sort, setSort] = React.useState("priority");
    const [selected, setSelected] = React.useState([]),
      [inspect, setInspect] = React.useState(null),
      [newOpen, setNewOpen] = React.useState(false),
      [notice, setNotice] = React.useState("");
    const [scenario, setScenario] = React.useState("normal"),
      [queryCard, setQueryCard] = React.useState("p7"),
      [resetOpen, setResetOpen] = React.useState(false);
    const [requestedChange, setRequestedChange] = React.useState(null);
    const lock = React.useRef(false);
    const load = () => {
      setError("");
      repository
        .load()
        .then(setSnapshot)
        .catch((e) => setError(e.message));
    };
    React.useEffect(load, []);
    React.useEffect(() => {
      if (initialQuery) {
        setQuery(initialQuery);
        setView("catalog");
      }
    }, [initialQuery]);
    React.useEffect(() => {
      if (notice) {
        const timer = setTimeout(() => setNotice(""), 4200);
        return () => clearTimeout(timer);
      }
    }, [notice]);
    async function mutate(action, message) {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        const next = await action();
        setSnapshot(next);
        if (message) setNotice(message);
        return next;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setBusy(false);
        lock.current = false;
      }
    }
    const run = (action, message) => mutate(action, message).catch(() => {});
    const open = (id, changeId = null) => {
      setRequestedChange(changeId);
      setInspect(id);
    };
    if (!snapshot)
      return h(
        "div",
        { className: "cw" },
        empty(
          error ? "Не удалось загрузить карточки" : "Загружаем карточки…",
          error || "Подготавливаем рабочее пространство",
          error ? button("Повторить", load) : null,
        ),
      );
    const cards = snapshot.cards,
      changes = snapshot.changes;
    const actionable = cards.filter(
      (c) => !["healthy", "new"].includes(c.kind),
    );
    const activeChange = (id) =>
      changes.find((c) => c.cardId === id && c.status !== "observing");
    const inspectCard = cards.find((c) => c.id === inspect);
    const inspectChange = requestedChange
      ? changes.find((c) => c.id === requestedChange)
      : activeChange(inspect) || changes.find((c) => c.cardId === inspect);
    const countStatus = (status) =>
      changes.filter((c) => c.status === status).length;
    const pending = countStatus("pending"),
      observing = countStatus("observing");
    const filtered = cards.filter(
      (c) =>
        (c.title + " " + c.code + " " + c.nm)
          .toLowerCase()
          .includes(query.toLowerCase().trim()) &&
        (filter === "all" ||
          (filter === "attention" &&
            !["healthy", "new"].includes(c.kind) &&
            !activeChange(c.id) &&
            !changes.some(
              (x) => x.cardId === c.id && x.status === "observing",
            )) ||
          (filter === "draft" && (c.isNew || activeChange(c.id))) ||
          c.kind === filter),
    );
    const rows = [...filtered].sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "ru")
        : sort === "profit"
          ? a.profitUnit - b.profitUnit
          : a.priority - b.priority,
    );
    const displayRows = scenario === "empty" ? [] : rows;
    const goto = (v, f = "all") => {
      setView(v);
      setFilter(f);
      setQuery("");
      setSelected([]);
    };
    const queue = actionable.filter(
      (c) =>
        !activeChange(c.id) &&
        !changes.some((x) => x.cardId === c.id && x.status === "observing"),
    );
    const first = queue[0];
    const searchProduct = cards.find((c) => c.id === queryCard) || cards[0];
    const save = async (id, patch, owner) => {
      const next = await mutate(
        () => repository.saveDraft(id, patch, owner),
        "Черновик сохранён на этом устройстве",
      );
      setRequestedChange(
        next.changes.find((c) => c.cardId === id && c.status === "draft")?.id,
      );
    };
    async function bulk() {
      // Sequential saves keep a partial failure visible and preserve completed drafts.
      const ids = [...selected];
      let completed = 0;
      for (const id of ids) {
        const card = cards.find((c) => c.id === id);
        if (activeChange(id)) continue;
        try {
          await mutate(() =>
            repository.saveDraft(id, {
              description:
                card.description +
                "\nПроверьте характеристики по образцу товара.",
            }),
          );
          completed++;
        } catch {
          break;
        }
      }
      setNotice(
        `Создано черновиков: ${completed}. Проверьте текст перед согласованием.`,
      );
      setSelected([]);
      setView("changes");
    }
    return h(
      "div",
      { className: "cw" },
      h(
        "div",
        { className: "cw-topline" },
        h(
          "span",
          { className: "cw-kicker" },
          "КОНТЕНТ, КОТОРЫЙ РАБОТАЕТ НА ПРИБЫЛЬ",
        ),
        h(
          "span",
          { className: "cw-demo" },
          h("i"),
          "Демо-магазин · изменения локальные",
        ),
      ),
      h(
        "header",
        { className: "cw-heading" },
        h(
          "div",
          null,
          h("h1", null, "Каждой карточке — следующий шаг"),
          h(
            "p",
            null,
            "Находите потери в воронке, улучшайте контент и проверяйте результат.",
          ),
        ),
        h(
          "div",
          { className: "cw-actions" },
          button([icon("palette"), " Студия"], () => openStudio("p7")),
          button(
            [icon("add"), " Новая карточка"],
            () => setNewOpen(true),
            "cw-primary",
          ),
        ),
      ),
      h(
        "nav",
        { className: "cw-nav", "aria-label": "Рабочее пространство карточек" },
        [
          ["queue", "Очередь улучшений", queue.length],
          ["catalog", "Все карточки", cards.length],
          ["queries", "Поисковые запросы", null],
          ["changes", "Изменения", changes.length],
        ].map(([id, label, count]) =>
          button(
            [
              label,
              count != null
                ? h("span", { className: "cw-tab-count", key: "count" }, count)
                : null,
            ],
            () => goto(id),
            view === id ? "active" : "",
            { "aria-pressed": view === id, key: id },
          ),
        ),
        h("span", { className: "cw-period" }, icon("calendar_today"), PERIOD),
      ),
      error
        ? h(
            "div",
            { className: "cw-error", role: "alert" },
            h("span", null, error),
            button("Закрыть", () => setError("")),
          )
        : null,
      snapshot.storageWarning
        ? h(
            "div",
            { className: "cw-warning" },
            "Локальное хранилище недоступно или сохранённые данные повреждены. Используйте экспорт JSON для сохранения работы.",
          )
        : null,
      scenario === "stale"
        ? h(
            "div",
            { className: "cw-warning" },
            "Данные устарели. Рекомендации требуют повторной проверки; согласование и применение временно недоступны.",
            button("Обновить демо-данные", () =>
              run(async () => {
                const next = await repository.refresh();
                setScenario("normal");
                return next;
              }, "Демо-снимок обновлён"),
            ),
          )
        : null,
      view === "queue"
        ? h(
            React.Fragment,
            null,
            h(
              "div",
              { className: "cw-summary" },
              [
                [
                  "Требуют внимания",
                  queue.length,
                  "карточек с конкретным действием",
                  "attention",
                  "priority_high",
                ],
                [
                  "Ждут согласования",
                  pending,
                  "правки проверяет владелец",
                  "pending",
                  "fact_check",
                ],
                [
                  "Наблюдаем результат",
                  observing,
                  "после применения изменений",
                  "observing",
                  "monitoring",
                ],
                [
                  "В порядке",
                  cards.filter((c) => c.kind === "healthy").length,
                  "нет срочных сигналов",
                  "healthy",
                  "check_circle",
                ],
              ].map(([label, count, copy, id, ic]) =>
                button(
                  h(
                    React.Fragment,
                    null,
                    h("span", { className: "cw-stat-label" }, label, icon(ic)),
                    h("strong", null, count.toString().padStart(2, "0")),
                    h("small", null, copy),
                  ),
                  () =>
                    id === "attention"
                      ? goto("catalog", "attention")
                      : id === "healthy"
                        ? goto("catalog", "healthy")
                        : goto("changes", id),
                  "cw-stat",
                  { "aria-label": `${label}: ${count}`, key: id },
                ),
              ),
            ),
            h(
              "div",
              { className: "cw-workgrid" },
              h(
                "main",
                null,
                first
                  ? h(
                      "article",
                      { className: "cw-feature" },
                      h(
                        "div",
                        { className: "cw-feature-copy" },
                        h(
                          "div",
                          { className: "cw-kicker" },
                          "01 / СТОИТ НАЧАТЬ ЗДЕСЬ",
                        ),
                        h("h2", null, first.label),
                        h("p", null, first.evidence),
                        h(
                          "div",
                          { className: "cw-feature-meta" },
                          h("span", null, first.title),
                          h(
                            "span",
                            null,
                            "Выкуп " +
                              percent(rate(first.funnel[4], first.funnel[3])),
                          ),
                        ),
                        button(
                          [first.action, " ", icon("arrow_forward")],
                          () => open(first.id),
                          "cw-mint",
                        ),
                      ),
                      art(first, true),
                    )
                  : empty(
                      "Очередь разобрана",
                      "Подготовленные правки находятся в разделе «Изменения».",
                      button(
                        "Открыть изменения",
                        () => goto("changes"),
                        "cw-primary",
                      ),
                    ),
                h(
                  "section",
                  { className: "cw-panel" },
                  h(
                    "div",
                    { className: "cw-section-title" },
                    h(
                      "div",
                      null,
                      h("h3", null, "Приоритеты на сегодня"),
                      h(
                        "p",
                        null,
                        "По сигналам в данных и ограничениям товара",
                      ),
                    ),
                    button(
                      "Весь каталог ↗",
                      () => goto("catalog"),
                      "cw-text-button",
                    ),
                  ),
                  queue.slice(first ? 1 : 0).map((card, i) =>
                    h(
                      "article",
                      { className: "cw-task", key: card.id },
                      h(
                        "span",
                        { className: "cw-rank" },
                        String(i + 2).padStart(2, "0"),
                      ),
                      art(card),
                      h(
                        "div",
                        { className: "cw-task-copy" },
                        h(
                          "button",
                          {
                            className: "cw-product-link",
                            onClick: () => open(card.id),
                          },
                          card.title,
                        ),
                        h("p", null, card.label),
                        badge(
                          kindLabel[card.kind],
                          card.kind === "economics" ? "red" : "neutral",
                        ),
                      ),
                      h(
                        "div",
                        { className: "cw-task-metric" },
                        h(
                          "strong",
                          {
                            className: card.profitUnit < 0 ? "cw-red-text" : "",
                          },
                          card.kind === "economics"
                            ? rub(card.profitUnit)
                            : card.kind === "search"
                              ? percent(rate(card.funnel[1], card.funnel[0]))
                              : card.photos + " фото",
                        ),
                        h(
                          "small",
                          null,
                          card.kind === "economics"
                            ? "на один выкуп"
                            : card.kind === "search"
                              ? "CTR за 14 дней"
                              : "в карточке",
                        ),
                      ),
                      button(
                        icon("arrow_forward"),
                        () => open(card.id),
                        "cw-icon-button",
                        { "aria-label": "Разобрать: " + card.title },
                      ),
                    ),
                  ),
                  h(
                    "div",
                    { className: "cw-panel-footer" },
                    icon("info"),
                    "Приоритет — рекомендация. Причину и допущения можно проверить в карточке.",
                  ),
                ),
              ),
              h(
                "aside",
                { className: "cw-sidebar" },
                h(
                  "section",
                  { className: "cw-panel cw-route" },
                  h("div", { className: "cw-kicker" }, "ВАШ РАБОЧИЙ ЦИКЛ"),
                  h("h3", null, "От сигнала к результату"),
                  [
                    ["1", "Найти причину", "Воронка, запросы и отзывы"],
                    ["2", "Подготовить правку", "Текст, характеристики, фото"],
                    ["3", "Проверить и согласовать", "Сравнение до / после"],
                    ["4", "Измерить результат", "Наблюдение и история"],
                  ].map(([n, title, copy]) =>
                    h(
                      "div",
                      { className: "cw-route-step", key: n },
                      h("span", null, n),
                      h(
                        "div",
                        null,
                        h("strong", null, title),
                        h("p", null, copy),
                      ),
                    ),
                  ),
                ),
                h(
                  "section",
                  { className: "cw-insight" },
                  icon("lightbulb"),
                  h("h3", null, "Больше трафика ≠ больше прибыли"),
                  h(
                    "p",
                    null,
                    "У «Рима» отрицательная прибыль на выкуп. Сначала проверьте цену и расходы, затем усиливайте карточку.",
                  ),
                  button(
                    "Посмотреть расчёт ↗",
                    () => open("p10"),
                    "cw-text-button",
                  ),
                ),
                h(
                  "section",
                  { className: "cw-source" },
                  h("div", null, h("i"), "Демонстрационный снимок"),
                  h("p", null, "Каталог · воронка · поисковые запросы"),
                  h("small", null, "Обновлён " + date(snapshot.updatedAt)),
                  button(
                    "Обновить",
                    () =>
                      run(() => repository.refresh(), "Демо-снимок обновлён"),
                    "cw-text-button",
                    { disabled: busy },
                  ),
                ),
              ),
            ),
          )
        : null,
      view === "catalog"
        ? h(
            "section",
            { className: "cw-panel cw-catalog" },
            h(
              "div",
              { className: "cw-catalog-tools" },
              h(
                "label",
                { className: "cw-search" },
                icon("search"),
                h("input", {
                  "aria-label": "Поиск карточек",
                  placeholder: "Название, артикул WB или продавца",
                  value: query,
                  onChange: (e) => setQuery(e.target.value),
                }),
              ),
              h(
                "select",
                {
                  "aria-label": "Сортировка карточек",
                  value: sort,
                  onChange: (e) => setSort(e.target.value),
                },
                h("option", { value: "priority" }, "Сначала приоритетные"),
                h("option", { value: "profit" }, "По прибыли на выкуп"),
                h("option", { value: "title" }, "По названию"),
              ),
              button([icon("download"), " Экспорт"], () =>
                download(displayRows, "marginpilot-cards.json"),
              ),
            ),
            h(
              "div",
              { className: "cw-filters" },
              [
                ["all", "Все"],
                ["attention", "Требуют внимания"],
                ["search", "Поиск"],
                ["content", "Контент"],
                ["economics", "Экономика"],
                ["variants", "Варианты"],
                ["draft", "Черновики"],
                ["healthy", "В порядке"],
              ].map(([id, label]) =>
                button(
                  label,
                  () => {
                    setFilter(id);
                    setSelected([]);
                  },
                  filter === id ? "active" : "",
                  { "aria-pressed": filter === id, key: id },
                ),
              ),
            ),
            selected.length
              ? h(
                  "div",
                  { className: "cw-bulk" },
                  h("strong", null, `Выбрано: ${selected.length}`),
                  button("Подготовить черновики", bulk, "", { disabled: busy }),
                  button("Скачать выбранные", () =>
                    download(
                      cards.filter((c) => selected.includes(c.id)),
                      "selected-cards.json",
                    ),
                  ),
                  button(
                    "Снять выбор",
                    () => setSelected([]),
                    "cw-text-button",
                  ),
                )
              : null,
            displayRows.length
              ? h(
                  "div",
                  { className: "cw-table-wrap" },
                  h(
                    "table",
                    { className: "cw-catalog-table" },
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
                            "aria-label": "Выбрать видимые карточки",
                            checked: displayRows.every((c) =>
                              selected.includes(c.id),
                            ),
                            onChange: (e) =>
                              setSelected(
                                e.target.checked
                                  ? displayRows.map((c) => c.id)
                                  : [],
                              ),
                          }),
                        ),
                        [
                          "Товар",
                          "CTR / корзина",
                          "Выкуп",
                          "На выкуп",
                          "Что улучшить",
                          "Работа",
                        ].map((label) => h("th", { key: label }, label)),
                      ),
                    ),
                    h(
                      "tbody",
                      null,
                      displayRows.map((card) =>
                        h(
                          "tr",
                          { key: card.id },
                          h(
                            "td",
                            null,
                            h("input", {
                              type: "checkbox",
                              "aria-label": "Выбрать " + card.title,
                              checked: selected.includes(card.id),
                              onChange: (e) =>
                                setSelected((v) =>
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
                              { className: "cw-product-cell" },
                              art(card),
                              h(
                                "div",
                                null,
                                h(
                                  "button",
                                  {
                                    className: "cw-product-link",
                                    onClick: () => open(card.id),
                                  },
                                  card.title,
                                ),
                                h("small", null, card.nm + " · " + card.code),
                              ),
                            ),
                          ),
                          h(
                            "td",
                            null,
                            percent(rate(card.funnel[1], card.funnel[0])),
                            h(
                              "small",
                              null,
                              percent(rate(card.funnel[2], card.funnel[1])) +
                                " в корзину",
                            ),
                          ),
                          h(
                            "td",
                            null,
                            percent(rate(card.funnel[4], card.funnel[3])),
                          ),
                          h(
                            "td",
                            {
                              className:
                                card.profitUnit < 0 ? "cw-red-text" : "",
                            },
                            card.isNew ? "—" : rub(card.profitUnit),
                          ),
                          h(
                            "td",
                            null,
                            h(
                              "span",
                              { className: "cw-table-issue" },
                              card.label,
                            ),
                            badge(
                              kindLabel[card.kind],
                              card.kind === "economics" ? "red" : "neutral",
                            ),
                          ),
                          h(
                            "td",
                            null,
                            button(
                              activeChange(card.id)
                                ? STATUS[activeChange(card.id).status]
                                : "Разобрать →",
                              () => open(card.id),
                              "cw-small-button",
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                )
              : empty(
                  "Карточки не найдены",
                  "Измените поисковый запрос или сбросьте фильтры.",
                  button(
                    "Сбросить фильтры",
                    () => {
                      setQuery("");
                      setFilter("all");
                      setScenario("normal");
                    },
                    "cw-primary",
                  ),
                ),
            h(
              "div",
              { className: "cw-panel-footer" },
              `Показано ${displayRows.length} из ${cards.length} · прибыль на выкуп из демо-финмодели · CTR: переходы / показы`,
            ),
          )
        : null,
      view === "queries"
        ? h(
            "section",
            { className: "cw-panel cw-query-panel" },
            h(
              "div",
              { className: "cw-section-title" },
              h(
                "div",
                null,
                h("h2", null, "Запросы, которые приводят покупателей"),
                h(
                  "p",
                  null,
                  "От видимости в поиске — к заказу. Демо-данные за " + PERIOD,
                ),
              ),
              h(
                "select",
                {
                  "aria-label": "Товар для поисковых запросов",
                  value: searchProduct.id,
                  onChange: (e) => setQueryCard(e.target.value),
                },
                cards.map((c) =>
                  h("option", { value: c.id, key: c.id }, c.title),
                ),
              ),
            ),
            h(
              "div",
              { className: "cw-query-summary" },
              art(searchProduct),
              h(
                "div",
                null,
                h("h3", null, searchProduct.title),
                h(
                  "p",
                  null,
                  "Источник в реальном проекте: отчёт WB «Поисковые запросы: ваши товары»",
                ),
              ),
              button(
                "Редактировать карточку →",
                () => open(searchProduct.id),
                "cw-primary",
              ),
            ),
            queryTable(searchProduct),
            h(
              "div",
              { className: "cw-note" },
              icon("info"),
              "Это выборка запросов вашего товара, а не объём всего рынка. Запросы со свойствами товара требуют проверки. Позиция зависит также от региона, доставки, цены и рекламы.",
            ),
          )
        : null,
      view === "changes"
        ? h(
            "section",
            { className: "cw-panel cw-changes" },
            h(
              "div",
              { className: "cw-section-title" },
              h(
                "div",
                null,
                h("h2", null, "Изменения под контролем"),
                h(
                  "p",
                  null,
                  "Версии, согласования и наблюдение в одном журнале.",
                ),
              ),
              button("Экспорт журнала", () =>
                download(changes, "marginpilot-changes.json"),
              ),
            ),
            h(
              "div",
              { className: "cw-filters" },
              [
                ["all", "Все"],
                ["draft", "Черновики"],
                ["pending", "На согласовании"],
                ["approved", "Согласовано"],
                ["observing", "Наблюдение"],
                ["failed", "Ошибки"],
              ].map(([id, label]) =>
                button(
                  label,
                  () => setFilter(id),
                  filter === id ? "active" : "",
                  { "aria-pressed": filter === id, key: id },
                ),
              ),
            ),
            changes.filter((c) => filter === "all" || c.status === filter)
              .length
              ? changes
                  .filter((c) => filter === "all" || c.status === filter)
                  .map((change) => {
                    const card = cards.find((c) => c.id === change.cardId);
                    return h(
                      "article",
                      { className: "cw-change-row", key: change.id },
                      art(card),
                      h(
                        "div",
                        { className: "cw-change-copy" },
                        h(
                          "button",
                          {
                            className: "cw-product-link",
                            onClick: () => open(card.id, change.id),
                          },
                          card.title,
                        ),
                        h("small", null, change.id + " · " + change.owner),
                        h(
                          "p",
                          null,
                          change.status === "observing"
                            ? "Наблюдение начато · фактического результата пока нет"
                            : change.events[change.events.length - 1]?.text,
                        ),
                      ),
                      badge(
                        STATUS[change.status],
                        change.status === "failed"
                          ? "red"
                          : change.status === "observing"
                            ? "green"
                            : "amber",
                      ),
                      button(
                        "Открыть →",
                        () => open(card.id, change.id),
                        "cw-small-button",
                      ),
                    );
                  })
              : empty(
                  "Здесь будет история вашей работы",
                  "Подготовьте правку из очереди улучшений. Сохранённый черновик появится в журнале.",
                  button(
                    "К очереди улучшений",
                    () => goto("queue"),
                    "cw-primary",
                  ),
                ),
            h(
              "div",
              { className: "cw-panel-footer" },
              icon("verified_user"),
              "Демо: согласование и применение моделируются на этом устройстве. Изменения в Wildberries не отправляются.",
            ),
          )
        : null,
      h(
        "footer",
        { className: "cw-bottom" },
        h("span", null, "MarginPilot / Карточки · прототип v1"),
        h(
          "details",
          null,
          h("summary", null, "Сценарии демо"),
          h(
            "div",
            { className: "cw-demo-controls" },
            h(
              "select",
              {
                "aria-label": "Сценарий демо",
                value: scenario,
                onChange: (e) => {
                  setScenario(e.target.value);
                  if (e.target.value === "empty") setView("catalog");
                },
              },
              [
                ["normal", "Обычная работа"],
                ["empty", "Пустой каталог"],
                ["stale", "Данные устарели"],
                ["fail", "Ошибка публикации"],
              ].map(([value, label]) =>
                h("option", { value, key: value }, label),
              ),
            ),
            button("Скачать всё", () =>
              download(snapshot, "marginpilot-cards-workspace.json"),
            ),
            button("Сбросить демо", () => setResetOpen(true)),
          ),
        ),
      ),
      notice
        ? h(
            "div",
            { className: "cw-toast", role: "status" },
            icon("check_circle"),
            notice,
          )
        : null,
      inspectCard
        ? h(Editor, {
            key: inspectCard.id + (requestedChange || ""),
            card: inspectCard,
            change: inspectChange,
            initialTab: requestedChange ? "diff" : "diagnosis",
            externalError: error,
            onClose: () => setInspect(null),
            onSave: save,
            busy,
            openStudio,
            openFinance,
            fail: scenario === "fail",
            onTransition: (id, status, options) => {
              if (scenario === "stale") {
                setError("Обновите данные перед согласованием и применением.");
                return;
              }
              run(() => repository.transition(id, status, options));
            },
            onRollback: (id) =>
              run(async () => {
                const next = await repository.rollback(id);
                setRequestedChange(
                  next.changes.find(
                    (c) => c.cardId === inspect && c.status === "draft",
                  )?.id,
                );
                return next;
              }, "Создан черновик отката. Он требует согласования."),
          })
        : null,
      newOpen
        ? h(NewCard, {
            onClose: () => setNewOpen(false),
            busy,
            onCreate: async (title, category) => {
              const next = await mutate(
                () => repository.createCard(title, category),
                "Создан локальный черновик товара",
              );
              setNewOpen(false);
              open(next.createdId);
              setView("catalog");
              setFilter("draft");
            },
          })
        : null,
      resetOpen
        ? h(
            Dialog,
            {
              title: "Сбросить демонстрацию?",
              subtitle: "ТОЛЬКО ДАННЫЕ ВКЛАДКИ «КАРТОЧКИ»",
              onClose: () => setResetOpen(false),
            },
            h(
              "div",
              { className: "cw-dialog-body" },
              h(
                "p",
                null,
                "Локальные карточки и история изменений будут заменены исходным демо-набором. Сначала можно скачать копию.",
              ),
              h(
                "div",
                { className: "cw-actions" },
                button("Скачать копию", () =>
                  download(snapshot, "cards-backup.json"),
                ),
                button(
                  "Сбросить",
                  () =>
                    run(async () => {
                      const next = await repository.reset();
                      setResetOpen(false);
                      setInspect(null);
                      setSelected([]);
                      setScenario("normal");
                      setView("queue");
                      return next;
                    }),
                  "cw-primary",
                  { disabled: busy },
                ),
              ),
            ),
          )
        : null,
    );
  };
}
