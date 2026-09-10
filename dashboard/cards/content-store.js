import { seedCards, STORAGE_KEY as LEGACY_KEY } from "./data.js";

export const CONTENT_KEY = "marginpilot.cards.content.v2";
export const FIELDS = [
  "title",
  "description",
  "composition",
  "measurements",
  "rich",
  "images",
  "category",
  "brand",
  "attributes",
];
export const TEXT_FIELDS = {
  title: "Название",
  description: "Описание",
  composition: "Состав",
  measurements: "Замеры",
};
export const copy = (value) => structuredClone(value);
export const uid = () => crypto.randomUUID();
export const ATTRIBUTE_PRESETS = [
  "Цвет",
  "Размеры",
  "Пол",
  "Сезон",
  "Страна производства",
  "Модель",
  "Комплектация",
  "Уход",
  "Длина упаковки, см",
  "Ширина упаковки, см",
  "Высота упаковки, см",
  "Вес с упаковкой, кг",
  "Баркоды",
];
export const normalizeCard = (card) => ({ brand: "", attributes: [], ...card });
const escapeXML = (text) =>
  String(text).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

// Deterministic layout renderer for the prototype; an image-model job replaces this adapter.
export function infographicSVG(
  card,
  {
    headline = card.title,
    caption = "Детали имеют значение",
    palette = "sage",
    layout = "cover",
    photo = "",
  } = {},
) {
  const colors = {
    sage: ["#e9eddf", "#254834", "#b6c397"],
    sand: ["#eee4d5", "#634d36", "#c7ab84"],
    ink: ["#263e3a", "#f3f2e6", "#879d87"],
  };
  const [bg, ink, cloth] = colors[palette] || colors.sage;
  const words = String(headline).split(/\s+/);
  const lines = [""];
  for (const word of words) {
    const i = lines.length - 1;
    if ((lines[i] + " " + word).length > 21 && i < 3) lines.push(word);
    else lines[i] += (lines[i] ? " " : "") + word;
  }
  const safePhoto = /^data:image\/(png|jpeg|webp);base64,/.test(photo)
    ? photo
    : "";
  const artwork = safePhoto
    ? `<image href="${safePhoto}" x="130" y="350" width="640" height="660" preserveAspectRatio="xMidYMid meet"/>`
    : `<g transform="translate(145 345) scale(6)"><ellipse cx="50" cy="100" rx="33" ry="4" fill="${ink}" opacity=".08"/><path d="M32 16 L42 12 Q50 25 58 12 L68 16 L88 38 L73 50 L66 43 L69 94 L31 94 L34 43 L27 50 L12 38Z" fill="${cloth}" stroke="${ink}" stroke-opacity=".28" stroke-width=".6"/><path d="M43 18Q50 29 57 18M38 49L36 86M63 49L65 86" fill="none" stroke="${ink}" opacity=".18" stroke-width=".7"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="${bg}"/><text x="64" y="74" font-family="Arial,sans-serif" font-size="20" letter-spacing="5" fill="${ink}">LOOMA / ${layout === "details" ? "ДЕТАЛИ" : "КОЛЛЕКЦИЯ"}</text>${lines.map((line, i) => `<text x="60" y="${155 + i * 64}" font-family="Arial,sans-serif" font-size="57" font-weight="600" fill="${ink}">${escapeXML(line)}</text>`).join("")}${artwork}<line x1="60" x2="840" y1="1050" y2="1050" stroke="${ink}" opacity=".25"/><text x="60" y="1100" font-family="Arial,sans-serif" font-size="25" fill="${ink}">${escapeXML(caption.slice(0, 53))}</text><text x="60" y="1150" font-family="Arial,sans-serif" font-size="16" fill="${ink}" opacity=".55">${safePhoto ? "МАКЕТ С ВАШИМ ФОТО" : "ДЕМО-МАКЕТ · ИЗОБРАЖЕНИЕ ТОВАРА УСЛОВНОЕ"}</text></svg>`;
}
export const svgURL = (svg) =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
export function makeImage(card, options = {}) {
  return {
    id: uid(),
    name: options.layout === "details" ? "Детали" : "Обложка",
    alt: options.headline || card.title,
    svg: infographicSVG(card, options),
    source: "template",
  };
}
const snapshotContent = (c) =>
  Object.fromEntries(FIELDS.map((k) => [k, copy(c[k])]));

function seed() {
  return seedCards().map((card, i) => {
    const c = {
      id: card.id,
      nm: card.nm,
      code: card.code,
      title: card.title,
      category: card.category,
      brand: "",
      attributes: [],
      composition: card.composition,
      measurements: card.measurements,
      description: card.description,
      version: 1,
      status: "published",
      rich:
        i % 3 === 0
          ? [
              {
                id: uid(),
                title: "В деталях",
                body: "Рассмотрите посадку и детали изделия перед выбором размера.",
              },
            ]
          : [],
      images: [],
      search: card.query,
      rank: card.rank,
    };
    c.images = [makeImage(c, { palette: i % 2 ? "sage" : "sand" })];
    return c;
  });
}

export function validateCard(card) {
  if (!card.title?.trim()) return "Название не может быть пустым.";
  if (card.title.length > 60) return "Название длиннее 60 символов.";
  if (card.description.length > 2000) return "Описание длиннее 2 000 символов.";
  if (card.composition.length > 500 || card.measurements.length > 1000)
    return "Слишком длинное значение характеристики.";
  if (!Array.isArray(card.rich) || card.rich.length > 10)
    return "В моке поддерживается до 10 rich-блоков.";
  if (
    card.rich.some(
      (b) =>
        !b ||
        typeof b.title !== "string" ||
        typeof b.body !== "string" ||
        b.title.length > 150 ||
        b.body.length > 2000,
    )
  )
    return "Проверьте заголовки и тексты rich-блоков.";
  if (!Array.isArray(card.images) || card.images.length > 10)
    return "В моке поддерживается до 10 изображений.";
  if (typeof (card.brand ?? "") !== "string" || (card.brand || "").length > 100)
    return "Бренд: не больше 100 символов.";
  if (typeof card.category !== "string" || card.category.length > 100)
    return "Проверьте категорию товара.";
  const attributes = card.attributes || [];
  if (!Array.isArray(attributes) || attributes.length > 100)
    return "В моке поддерживается до 100 характеристик.";
  const names = new Set();
  for (const attribute of attributes) {
    if (
      !attribute ||
      typeof attribute.name !== "string" ||
      !attribute.name.trim() ||
      attribute.name.length > 100 ||
      typeof attribute.value !== "string" ||
      attribute.value.length > 1000
    )
      return "У каждой характеристики должны быть название до 100 символов и значение до 1 000 символов.";
    const name = attribute.name.trim().toLocaleLowerCase("ru");
    if (names.has(name)) return "Характеристика повторяется: " + attribute.name;
    names.add(name);
  }
  return "";
}

export function createContentRepository(storage) {
  let warning = "";
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      warning = "Локальное хранилище недоступно.";
    }
  }
  let state = { schemaVersion: 2, cards: seed(), history: [], jobs: [] };
  try {
    const saved = JSON.parse(storage?.getItem(CONTENT_KEY) || "null");
    if (saved) {
      if (
        saved.schemaVersion !== 2 ||
        !Array.isArray(saved.cards) ||
        !Array.isArray(saved.history) ||
        !Array.isArray(saved.jobs) ||
        saved.cards.some(
          (c) =>
            typeof c.id !== "string" ||
            !Number.isInteger(c.version) ||
            validateCard(c),
        )
      )
        throw new Error("Некорректный снимок");
      state = { ...saved, cards: saved.cards.map(normalizeCard) };
    } else {
      const old = JSON.parse(storage?.getItem(LEGACY_KEY) || "null");
      if (old?.cards) {
        state.cards = state.cards.map((c) => {
          const prev = old.cards.find((p) => p.id === c.id);
          const draft = old.changes?.find(
            (x) =>
              x.cardId === c.id &&
              !["observing", "rejected"].includes(x.status),
          );
          return prev
            ? {
                ...c,
                ...Object.fromEntries(
                  Object.keys(TEXT_FIELDS).map((k) => [
                    k,
                    draft?.after?.[k] ?? prev[k] ?? c[k],
                  ]),
                ),
                version: prev.version,
                status: draft ? "draft" : "published",
              }
            : c;
        });
      }
    }
  } catch {
    warning =
      "Сохранённые данные не удалось прочитать. Загружен демо-набор; исходное хранилище не удалено.";
  }
  const result = () => copy({ ...state, warning });
  function commit(next) {
    try {
      if (!storage) throw new Error();
      storage.setItem(CONTENT_KEY, JSON.stringify(next));
      warning = "";
    } catch {
      warning =
        "Изменения сохранены только до перезагрузки: хранилище заполнено или недоступно. Экспортируйте тексты в Excel, а изображения и rich — из редактора.";
    }
    state = next;
    return result();
  }
  return {
    async load() {
      return result();
    },
    async saveBatch(changes, source = "Редактор") {
      const next = copy(state),
        seen = new Set();
      for (const item of changes) {
        if (seen.has(item.id)) throw new Error("Один товар указан дважды.");
        seen.add(item.id);
        const index = next.cards.findIndex((c) => c.id === item.id);
        if (index < 0) throw new Error("Товар не найден.");
        const before = next.cards[index];
        if (before.version !== item.version)
          throw new Error(
            `«${before.title}» уже изменён. Откройте свежую версию.`,
          );
        const patch = Object.fromEntries(
          FIELDS.filter((k) => k in item.patch).map((k) => [
            k,
            copy(item.patch[k]),
          ]),
        );
        const after = { ...before, ...patch };
        const error = validateCard(after);
        if (error) throw new Error(`${before.code}: ${error}`);
        if (
          FIELDS.every(
            (k) => JSON.stringify(before[k]) === JSON.stringify(after[k]),
          )
        )
          continue;
        after.status = "draft";
        after.version++;
        next.cards[index] = after;
        next.history.unshift({
          id: uid(),
          cardId: before.id,
          at: new Date().toISOString(),
          source,
          before: snapshotContent(before),
          after: snapshotContent(after),
          version: after.version,
        });
      }
      return commit(next);
    },
    async createMany(rows) {
      if (!rows.length || rows.length > 1000)
        throw new Error("Укажите от 1 до 1 000 товаров.");
      const next = copy(state),
        created = [];
      for (const row of rows) {
        const c = {
          id: "new-" + uid(),
          nm: "",
          code: row.code?.trim() || "NEW-" + uid().slice(0, 6),
          title: row.title?.trim() || "",
          category: row.category || "Не выбрана",
          brand: row.brand || "",
          attributes: copy(row.attributes || []),
          description: row.description || "",
          composition: row.composition || "",
          measurements: row.measurements || "",
          rich: copy(row.rich || []),
          images: copy(row.images || []),
          version: 1,
          status: "new",
          search: "",
          rank: null,
        };
        const error = validateCard(c);
        if (error) throw new Error(error);
        if (next.cards.some((p) => p.code === c.code))
          throw new Error("Артикул продавца уже существует: " + c.code);
        next.cards.unshift(c);
        created.push(c.id);
      }
      return { ...commit(next), created };
    },
    async recordJob(job) {
      const next = copy(state);
      next.jobs.unshift({ id: uid(), at: new Date().toISOString(), ...job });
      return commit(next);
    },
  };
}

/** Serializable multimodal input for a future server/model adapter. No visual recognition in this mock. */
export function buildGenerationRequest(card, options = {}) {
  const sourceMode = options.sourceMode || "both";
  const input = card.generationInput || {};
  return {
    cardId: card.id,
    version: card.version,
    product: {
      title: card.title,
      category: card.category,
      brand: card.brand || "",
      composition: card.composition,
      measurements: card.measurements,
      attributes: copy(card.attributes || []),
    },
    sources: {
      description:
        sourceMode === "images"
          ? ""
          : (input.description ?? card.description ?? ""),
      images:
        sourceMode === "text" ? [] : copy(input.images ?? card.images ?? []),
    },
    instructions: options.brief || "",
    output: {
      parts: options.parts || ["description"],
      tone: options.tone || "Нейтральный",
      richCount: Number(options.richCount || 2),
      imageCount: Number(options.imageCount || 1),
      palette: options.palette || "sage",
      layout: options.layout || "cover",
      replace: !!options.replace,
    },
  };
}

export function generateContent(cards, options = {}) {
  return cards.map((c) => {
    const request = buildGenerationRequest(c, options);
    const { parts, tone, richCount, imageCount, palette, layout, replace } =
      request.output;
    if (
      !Number.isInteger(richCount) ||
      richCount < 1 ||
      richCount > 6 ||
      !Number.isInteger(imageCount) ||
      imageCount < 1 ||
      imageCount > 5
    )
      throw new Error("Выберите 1–6 rich-блоков и 1–5 изображений.");
    const patch = {};
    const facts = [
      c.brand ? "Бренд: " + c.brand + "." : "",
      c.composition && !/не подтвержд|не заполн/i.test(c.composition)
        ? "Состав: " + c.composition + "."
        : "",
      ...(c.attributes || [])
        .filter((a) => a.value.trim())
        .map((a) => a.name + ": " + a.value + "."),
    ].filter(Boolean);
    const sourceText = request.sources.description.trim();
    const body = [sourceText, ...facts, request.instructions.trim()]
      .filter(Boolean)
      .join("\n");
    if (parts.includes("title")) {
      patch.title =
        c.title.startsWith("Новый товар") && sourceText
          ? sourceText
              .split(/[.\n!?]/)[0]
              .trim()
              .slice(0, 60)
          : c.title;
    }
    if (parts.includes("description")) {
      patch.description = [
        patch.title || c.title,
        body,
        tone === "Лаконичный"
          ? ""
          : "Рассмотрите детали изделия на фотографиях и сверьте характеристики перед заказом.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (parts.includes("images")) {
      const media = Array.from({ length: imageCount }, (_, index) =>
        makeImage(
          { ...c, title: patch.title || c.title },
          {
            palette,
            layout: index ? "details" : layout,
            caption: (facts[index] || sourceText || "Детали и посадка").slice(
              0,
              53,
            ),
            photo:
              request.sources.images[
                index % Math.max(1, request.sources.images.length)
              ]?.src || "",
          },
        ),
      );
      patch.images = replace ? media : [...c.images, ...media];
    }
    if (parts.includes("rich")) {
      const media = patch.images || c.images;
      const blocks = Array.from({ length: richCount }, (_, index) => ({
        id: uid(),
        title:
          index === 0
            ? "Знакомьтесь: " + (patch.title || c.title)
            : index === 1
              ? "Характеристики и размеры"
              : "Детали " + (index + 1),
        body:
          index === 0
            ? body || "Детали изделия представлены на фотографиях."
            : index === 1
              ? c.measurements ||
                facts.join("\n") ||
                "Сверьте характеристики перед заказом."
              : facts[index - 2] ||
                sourceText ||
                "Рассмотрите детали изделия на фотографиях.",
        ...(media[index % Math.max(1, media.length)]
          ? { imageId: media[index % media.length].id }
          : {}),
      }));
      patch.rich = replace ? blocks : [...c.rich, ...blocks];
    }
    if (
      replace &&
      patch.images &&
      !patch.rich &&
      c.rich.some((b) => b.imageId)
    ) {
      patch.rich = c.rich.map((b) => ({ ...b, imageId: "" }));
    }
    return { id: c.id, version: c.version, patch };
  });
}

export const EXCEL_HEADERS = [
  "ID",
  "Версия",
  "Артикул WB",
  "Артикул продавца",
  "Название",
  "Описание",
  "Состав",
  "Замеры",
  "Rich 1 — заголовок",
  "Rich 1 — текст",
  "Rich 2 — заголовок",
  "Rich 2 — текст",
];
export function exportRows(cards) {
  return cards.map((c) => [
    c.id,
    c.version,
    c.nm,
    c.code,
    c.title,
    c.description,
    c.composition,
    c.measurements,
    c.rich[0]?.title || "",
    c.rich[0]?.body || "",
    c.rich[1]?.title || "",
    c.rich[1]?.body || "",
  ]);
}
export function parseExcelRows(matrix, cards) {
  if (!matrix.length) throw new Error("Файл пуст.");
  const header = matrix[0].map((x) => String(x ?? "").trim());
  if (new Set(header).size !== header.length)
    throw new Error("Повторяющиеся названия столбцов.");
  if (!["ID", "Артикул WB", "Артикул продавца"].some((k) => header.includes(k)))
    throw new Error("Нужен столбец ID, Артикул WB или Артикул продавца.");
  if (matrix.length > 2001)
    throw new Error("В моке можно импортировать до 2 000 строк за раз.");
  const seen = new Map();
  return matrix
    .slice(1)
    .map((values, i) => {
      const row = Object.fromEntries(
        header.map((k, index) => [k, String(values[index] ?? "")]),
      );
      if (!Object.values(row).some((v) => v.trim())) return null;
      const matches = cards.filter((c) =>
        row.ID
          ? c.id === row.ID
          : row["Артикул WB"]
            ? c.nm === row["Артикул WB"]
            : c.code === row["Артикул продавца"],
      );
      const item = {
        line: i + 2,
        id: matches[0]?.id,
        title: matches[0]?.title || row["Название"] || "Не найден",
        version: matches[0]?.version,
        patch: {},
        errors: [],
        diff: [],
      };
      if (matches.length !== 1) {
        item.errors.push(
          "Не найден единственный товар. Создавайте новые товары через «Генерация».",
        );
        return item;
      }
      const c = matches[0];
      for (const [field, value] of [
        ["ID", c.id],
        ["Артикул WB", c.nm],
        ["Артикул продавца", c.code],
      ])
        if (row[field] && row[field] !== String(value))
          item.errors.push(`Не совпадает ${field}.`);
      if (seen.has(c.id)) {
        const message = "Товар повторяется в файле.";
        const first = seen.get(c.id);
        if (!first.errors.includes(message)) first.errors.push(message);
        item.errors.push(message);
      } else seen.set(c.id, item);
      if (row["Версия"] && Number(row["Версия"]) !== c.version)
        item.errors.push("Файл устарел: версия карточки изменилась.");
      for (const [key, label] of Object.entries(TEXT_FIELDS)) {
        if (header.includes(label)) {
          const value = row[label] === "[ОЧИСТИТЬ]" ? "" : row[label];
          if (value !== c[key]) item.patch[key] = value;
        }
      }
      let rich = copy(c.rich);
      let touched = false;
      for (let n = 0; n < 2; n++)
        for (const [key, label] of [
          ["title", "заголовок"],
          ["body", "текст"],
        ]) {
          const h = `Rich ${n + 1} — ${label}`;
          if (header.includes(h)) {
            if (!rich[n]) rich[n] = { id: uid(), title: "", body: "" };
            rich[n][key] = row[h] === "[ОЧИСТИТЬ]" ? "" : row[h];
            touched = true;
          }
        }
      if (touched) {
        rich = rich.filter((b) => b.title || b.body || b.imageId);
        if (JSON.stringify(rich) !== JSON.stringify(c.rich))
          item.patch.rich = rich;
      }
      const error = validateCard({ ...c, ...item.patch });
      if (error) item.errors.push(error);
      item.diff = Object.entries(item.patch).map(([key, value]) => ({
        field: TEXT_FIELDS[key] || "Rich-контент",
        before:
          key === "rich"
            ? c.rich.map((b) => b.title + ": " + b.body).join("\n")
            : c[key],
        after:
          key === "rich"
            ? value.map((b) => b.title + ": " + b.body).join("\n")
            : value,
      }));
      return item;
    })
    .filter(Boolean);
}
