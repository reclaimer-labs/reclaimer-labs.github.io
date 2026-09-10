import { PRODUCTS } from "../data.js";

export const PERIOD = "26 авг — 8 сен 2026";
export const STORAGE_KEY = "marginpilot.cards.v1";
export const STATUS = {
  draft: "Черновик",
  pending: "На согласовании",
  approved: "Согласовано",
  observing: "Наблюдение",
  rejected: "На доработку",
  failed: "Ошибка публикации",
};
const signals = {
  p5: {
    kind: "buyout",
    priority: 1,
    label: "Покупатели ошибаются с размером",
    evidence:
      "В 9 из 24 отзывов о посадке упоминают тесные плечи. Замеры изделия не указаны.",
    action: "Добавить замеры изделия",
    confidence: "Средняя",
    metric: "Выкуп",
    target: 3,
    funnel: [98000, 3920, 510, 196, 55],
    previous: [94000, 3854, 501, 190, 65],
    query: "тренч женский",
    rank: 9,
    oldRank: 10,
    photos: 6,
    tone: "sand",
  },
  p7: {
    kind: "search",
    priority: 2,
    label: "Теряем релевантные переходы",
    evidence:
      "Запрос «футболка женская хлопок» приносит заказы, но состав не раскрыт в описании. Сверьте его с документами товара.",
    action: "Уточнить описание и состав",
    confidence: "Средняя",
    metric: "CTR",
    target: 0.4,
    funnel: [148000, 2960, 622, 360, 169],
    previous: [144000, 3456, 656, 372, 175],
    query: "футболка базовая женская",
    rank: 14,
    oldRank: 11,
    photos: 5,
    tone: "cream",
  },
  p10: {
    kind: "economics",
    priority: 3,
    label: "Сначала проверить экономику",
    evidence:
      "Текущая прибыль на выкуп отрицательная. Рост заказов при этих расходах может увеличить убыток.",
    action: "Проверить цену и расходы",
    confidence: "Высокая",
    metric: "Прибыль",
    target: 0,
    funnel: [91000, 1547, 279, 140, 43],
    previous: [84000, 1680, 294, 138, 45],
    query: "брюки палаццо женские",
    rank: 24,
    oldRank: 19,
    photos: 3,
    tone: "sage",
  },
  p11: {
    kind: "content",
    priority: 4,
    label: "Не хватает информации о посадке",
    evidence:
      "Есть только два ракурса и нет замеров изделия. Вопросы о длине остаются без ответа в контенте.",
    action: "Подготовить контент-план",
    confidence: "Низкая",
    metric: "Корзина",
    target: 1,
    funnel: [25000, 450, 68, 56, 17],
    previous: [29000, 609, 91, 66, 22],
    query: "топ женский в рубчик",
    rank: 52,
    oldRank: 38,
    photos: 2,
    tone: "rose",
  },
  p8: {
    kind: "variants",
    priority: 5,
    label: "Проверить связь цветовых вариантов",
    evidence:
      "Белая и чёрная футболки одной модели размещены отдельно. Совпадение предмета и общих характеристик нужно проверить.",
    action: "Подготовить проверку вариантов",
    confidence: "Низкая",
    metric: "Без прогноза",
    target: 0,
    funnel: [51000, 1122, 247, 168, 74],
    previous: [49000, 1176, 259, 171, 75],
    query: "футболка базовая женская",
    rank: 31,
    oldRank: 30,
    photos: 4,
    tone: "charcoal",
  },
  p4: {
    kind: "content",
    priority: 6,
    label: "Не раскрыта комплектация",
    evidence:
      "В описании не перечислены элементы комплекта. Покупателю сложно понять, что входит в заказ.",
    action: "Уточнить комплектацию",
    confidence: "Средняя",
    metric: "Корзина",
    target: 1,
    funnel: [71000, 2414, 338, 126, 45],
    previous: [68000, 2448, 367, 130, 49],
    query: "костюм женский двойка",
    rank: 18,
    oldRank: 17,
    photos: 5,
    tone: "stone",
  },
  p2: {
    kind: "healthy",
    priority: 7,
    label: "Показатели стабильны",
    evidence:
      "Снижения конверсии за период нет. Можно добавить ракурс со спины в следующей съёмке.",
    action: "Посмотреть карточку",
    confidence: "Средняя",
    metric: "Без прогноза",
    target: 0,
    funnel: [115000, 4830, 821, 252, 106],
    previous: [110000, 4510, 767, 242, 101],
    query: "джинсы mom женские",
    rank: 11,
    oldRank: 12,
    photos: 7,
    tone: "denim",
  },
  p1: {
    kind: "healthy",
    priority: 8,
    label: "Показатели стабильны",
    evidence:
      "Поиск и конверсии без заметного ухудшения. Изменения сейчас не приоритетны.",
    action: "Посмотреть карточку",
    confidence: "Средняя",
    metric: "Без прогноза",
    target: 0,
    funnel: [132000, 6072, 1093, 280, 118],
    previous: [128000, 5760, 1037, 268, 113],
    query: "платье миди лён",
    rank: 6,
    oldRank: 7,
    photos: 8,
    tone: "linen",
  },
};

export function seedCards() {
  return Object.entries(signals).map(([id, s]) => {
    const p = PRODUCTS.find((p) => p.id === id);
    return {
      id,
      nm: p.nm,
      code: p.code,
      title: p.name,
      category: p.cat,
      price: p.price,
      profitUnit: p.profitU,
      stock: p.stockT,
      description: `${p.name}. Размерный ряд: ${p.sizes}. Информация о составе и замерах требует проверки по документам поставщика.`,
      composition: "Не подтверждён",
      measurements: "Не заполнены",
      version: 1,
      ...s,
    };
  });
}

export function queriesFor(card) {
  if (card.isNew) return [];
  const [views, opens, , orders] = card.funnel;
  return [
    {
      phrase: card.query,
      views: Math.round(views * 0.42),
      opens: Math.round(opens * 0.46),
      orders: Math.round(orders * 0.43),
      rank: card.rank,
      previous: card.oldRank,
      coverage: "В названии",
      relevance: "Релевантный",
    },
    {
      phrase:
        card.id === "p7"
          ? "футболка женская хлопок"
          : card.query + " повседневный",
      views: Math.round(views * 0.23),
      opens: Math.round(opens * 0.21),
      orders: Math.round(orders * 0.25),
      rank: card.rank + 9,
      previous: card.oldRank + 5,
      coverage: "Проверить описание",
      relevance: "Проверить свойства",
    },
    {
      phrase: card.query + " купить",
      views: Math.round(views * 0.1),
      opens: Math.round(opens * 0.12),
      orders: Math.round(orders * 0.1),
      rank: card.rank + 4,
      previous: card.oldRank + 4,
      coverage: "В описании",
      relevance: "Релевантный",
    },
  ];
}

export function rate(value, total) {
  return total > 0 ? (value / total) * 100 : null;
}
export function forecast(card) {
  if (card.profitUnit <= 0 || !["search", "buyout"].includes(card.kind))
    return null;
  const [views, opens, , orders, buyouts] = card.funnel;
  const units =
    card.kind === "search"
      ? views * 0.004 * (orders / opens) * (buyouts / orders)
      : orders * 0.03;
  return {
    low: Math.round(units * card.profitUnit * 0.5),
    high: Math.round(units * card.profitUnit),
    formula:
      card.kind === "search"
        ? `${views} показов × +0,4 п.п. CTR × ${((orders / opens) * 100).toFixed(1)}% заказов из переходов × ${((buyouts / orders) * 100).toFixed(1)}% выкупа × ${card.profitUnit} ₽`
        : `${orders} заказов × +3 п.п. выкупа × ${card.profitUnit} ₽`,
    note: "Сценарий на 14 дней при прежних трафике, цене и расходах. Нижняя граница — 50% сценария; это не доверительный интервал и не обещание дохода.",
  };
}

export function suggestedChange(card) {
  if (card.kind === "buyout")
    return {
      description:
        card.description +
        " Перед выбором размера сравните замеры изделия со своей одеждой. Подробную таблицу добавим после проверки замеров.",
    };
  if (card.kind === "search")
    return {
      description: `${card.title}. Базовая футболка для повседневных сочетаний с джинсами, брюками и юбками. Выберите подходящий размер по таблице изделия. Состав уточните по маркировке товара.`,
    };
  if (card.kind === "content")
    return {
      description:
        card.description +
        " Посадка, длина изделия и комплектация будут уточнены после проверки образца.",
    };
  return { description: card.description };
}

// This is the application-facing repository contract. Replace this adapter for production.
// Mutations return a complete snapshot; the UI never writes to WB directly.
export function createMockRepository(storage) {
  let state;
  let storageWarning = false;
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
      if (!storage) storageWarning = true;
    } catch {
      storageWarning = true;
    }
  }
  const fresh = () => ({
    schemaVersion: 1,
    cards: seedCards(),
    changes: [],
    updatedAt: "2026-09-09T07:42:00+03:00",
  });
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    const valid =
      saved?.schemaVersion === 1 &&
      Array.isArray(saved.cards) &&
      Array.isArray(saved.changes) &&
      saved.cards.every(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          Number.isInteger(c.version) &&
          c.version > 0 &&
          Array.isArray(c.funnel) &&
          c.funnel.length === 5 &&
          Array.isArray(c.previous),
      ) &&
      saved.changes.every(
        (c) =>
          c &&
          STATUS[c.status] &&
          saved.cards.some((p) => p.id === c.cardId) &&
          c.before &&
          c.after &&
          Array.isArray(c.events),
      );
    state = valid ? saved : fresh();
    storageWarning = storageWarning || Boolean(saved && !valid);
  } catch {
    state = fresh();
    storageWarning = true;
  }
  const snapshot = () => structuredClone({ ...state, storageWarning });
  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      storageWarning = true;
    }
    return snapshot();
  };
  const cardById = (id) => {
    const c = state.cards.find((c) => c.id === id);
    if (!c) throw new Error("Карточка не найдена. Обновите список.");
    return c;
  };
  const changeById = (id) => {
    const c = state.changes.find((c) => c.id === id);
    if (!c) throw new Error("Изменение не найдено.");
    return c;
  };
  const stamp = () => new Date().toISOString();
  const event = (c, text) => c.events.push({ at: stamp(), text });
  const active = (id) =>
    state.changes.find(
      (c) =>
        c.cardId === id &&
        ["draft", "pending", "approved", "rejected", "failed"].includes(
          c.status,
        ),
    );
  const fields = ["title", "description", "composition", "measurements"];
  return {
    async load() {
      return snapshot();
    },
    async refresh() {
      state.updatedAt = stamp();
      return persist();
    },
    async saveDraft(cardId, patch, owner = "Игорь · менеджер") {
      const card = cardById(cardId);
      let change = active(cardId);
      if (change && !["draft", "rejected"].includes(change.status))
        throw new Error(
          "Верните изменение на доработку перед редактированием.",
        );
      const clean = {};
      fields.forEach((k) => {
        if (typeof patch[k] === "string") clean[k] = patch[k].trim();
      });
      if ("title" in clean && (!clean.title || clean.title.length > 60))
        throw new Error("Название: от 1 до 60 символов.");
      if ("description" in clean && clean.description.length > 2000)
        throw new Error("Описание: не больше 2 000 символов.");
      if (!fields.some((k) => k in clean && clean[k] !== card[k]))
        throw new Error("Нет изменений для сохранения.");
      if (!change) {
        change = {
          id: "CH-" + crypto.randomUUID().slice(0, 8),
          cardId,
          baseVersion: card.version,
          before: Object.fromEntries(fields.map((k) => [k, card[k]])),
          after: {},
          status: "draft",
          owner,
          createdAt: stamp(),
          events: [],
        };
        state.changes.unshift(change);
      }
      change.after = { ...change.before, ...clean };
      change.status = "draft";
      change.owner = owner;
      event(change, "Черновик сохранён");
      return persist();
    },
    async transition(id, next, { fail = false } = {}) {
      const c = changeById(id),
        card = cardById(c.cardId);
      const allowed = {
        draft: ["pending"],
        pending: ["approved", "rejected"],
        approved: ["observing", "rejected"],
        failed: ["observing", "rejected"],
        rejected: ["pending"],
      };
      if (!allowed[c.status]?.includes(next))
        throw new Error("Этот переход статуса недоступен.");
      if (
        next === "pending" &&
        (c.after.description.includes("будут уточнены") ||
          c.after.description.includes("добавим после") ||
          c.after.description.includes("уточните по маркировке"))
      )
        throw new Error(
          "Уберите из описания служебные обещания и уточните факты перед согласованием.",
        );
      if (next === "observing") {
        if (card.isNew)
          throw new Error(
            "Для новой карточки нужны фото, категория WB и обязательные атрибуты. В моке доступен экспорт черновика.",
          );
        if (card.version !== c.baseVersion)
          throw new Error(
            "Версия карточки изменилась. Верните черновик на доработку и сверьте данные.",
          );
        if (fail) {
          c.status = "failed";
          event(
            c,
            "Демо: сервис публикации временно недоступен. Карточка не изменена.",
          );
          return persist();
        }
        Object.assign(card, c.after);
        card.version++;
        c.publishedAt = stamp();
        event(
          c,
          "Демо: изменение применено к локальной карточке. Начато наблюдение, результаты ещё не собраны.",
        );
      } else
        event(
          c,
          {
            pending: "Отправлено на согласование",
            approved: "Согласовано · Елена",
            rejected: "Возвращено на доработку",
          }[next],
        );
      c.status = next;
      return persist();
    },
    async createCard(title, category) {
      if (!title.trim() || title.trim().length > 60)
        throw new Error("Укажите название длиной до 60 символов.");
      const id = "new-" + crypto.randomUUID().slice(0, 8);
      state.cards.unshift({
        id,
        title: title.trim(),
        category,
        code: "DRAFT",
        nm: "Не присвоен",
        description: "",
        composition: "Не подтверждён",
        measurements: "Не заполнены",
        version: 1,
        isNew: true,
        kind: "new",
        priority: 0,
        price: 0,
        profitUnit: 0,
        stock: 0,
        funnel: [0, 0, 0, 0, 0],
        previous: [0, 0, 0, 0, 0],
        photos: 0,
        tone: "linen",
        label: "Новая карточка",
        evidence:
          "Заполните описание, подтвердите характеристики и подготовьте фотографии.",
        action: "Заполнить карточку",
        confidence: "Нет данных",
        metric: "Без прогноза",
        target: 0,
      });
      return { ...persist(), createdId: id };
    },
    async rollback(id) {
      const c = changeById(id),
        card = cardById(c.cardId);
      if (c.status !== "observing")
        throw new Error("Откат доступен после публикации.");
      if (card.version !== c.baseVersion + 1)
        throw new Error(
          "После этой публикации карточка уже менялась. Сверьте текущую версию вручную.",
        );
      return this.saveDraft(c.cardId, c.before, c.owner);
    },
    async reset() {
      state = fresh();
      return persist();
    },
  };
}
