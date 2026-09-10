import {
  ATTRIBUTE_PRESETS,
  copy,
  uid,
  generateContent,
  validateCard,
} from "./content-store.js";

export async function readSourceImages(files) {
  const images = [];
  for (const file of files) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      throw new Error("Загрузите PNG, JPEG или WebP.");
    if (file.size > 2 * 1024 * 1024)
      throw new Error("В моке изображение должно быть не больше 2 МБ.");
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error("Не удалось прочитать " + file.name));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = src;
    try {
      await image.decode();
    } catch {
      throw new Error("Не удалось открыть изображение: " + file.name);
    }
    images.push({
      id: uid(),
      name: file.name,
      alt: file.name,
      source: "upload",
      src,
    });
  }
  return images;
}

export function createCharacteristicsEditor(React, { field, btn }) {
  const h = React.createElement;
  return function CharacteristicsEditor({ value = [], onChange }) {
    const listId = React.useId();
    return h(
      "div",
      { className: "ct-characteristics" },
      h(
        "div",
        { className: "ct-attribute-presets" },
        [
          "Цвет",
          "Размеры",
          "Пол",
          "Сезон",
          "Страна производства",
          "Комплектация",
        ].map((name) =>
          btn(
            "+ " + name,
            () => onChange([...value, { id: uid(), name, value: "" }]),
            "cw-text-button",
            {
              key: name,
              disabled: value.some((a) => a.name === name),
            },
          ),
        ),
      ),
      h(
        "datalist",
        { id: listId },
        ATTRIBUTE_PRESETS.map((name) =>
          h("option", { key: name, value: name }),
        ),
      ),
      value.map((attribute, index) =>
        h(
          "div",
          { className: "ct-attribute-row", key: attribute.id },
          field(
            "Название характеристики " + (index + 1),
            attribute.name,
            (name) =>
              onChange(value.map((a, i) => (i === index ? { ...a, name } : a))),
            {
              list: listId,
              maxLength: 100,
              placeholder: "Например, тип застёжки",
            },
          ),
          field(
            "Значение характеристики " + (index + 1),
            attribute.value,
            (next) =>
              onChange(
                value.map((a, i) => (i === index ? { ...a, value: next } : a)),
              ),
            { maxLength: 1000, placeholder: "Значение" },
          ),
          btn(
            "×",
            () => onChange(value.filter((_, i) => i !== index)),
            "cw-icon-button",
            { "aria-label": "Удалить характеристику " + (index + 1) },
          ),
        ),
      ),
      btn(
        "Добавить характеристику",
        () => onChange([...value, { id: uid(), name: "", value: "" }]),
        "",
        { disabled: value.length >= 100 },
      ),
      h(
        "p",
        { className: "cw-footnote" },
        "Любые характеристики категории: размеры, комплектация, упаковка, баркоды и ваши поля. Значения сохранятся в карточке.",
      ),
    );
  };
}

export function createContentGenerator(
  React,
  ui,
  service = { generate: generateContent },
) {
  const { field, btn, chip, empty, icon, imageSrc } = ui;
  const h = React.createElement;
  const CharacteristicsEditor = createCharacteristicsEditor(React, ui);
  const initial = () => ({
    titles: "",
    codes: "",
    category: "",
    brand: "",
    composition: "",
    measurements: "",
    attributes: [],
    sourceMode: "text",
    description: "",
    references: [],
    useCardText: true,
    useCardImages: true,
    keepPhotos: true,
    parts: ["description", "rich"],
    tone: "Нейтральный",
    brief: "",
    richCount: 2,
    imageCount: 1,
    palette: "sage",
    layout: "cover",
    replace: false,
  });
  const lines = (text) =>
    text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  return function Generator({ cards, selection, onSave, onCreate, onJob }) {
    const [mode, setMode] = React.useState(
      selection.length ? "existing" : "new",
    );
    const [form, setForm] = React.useState(initial);
    const [preview, setPreview] = React.useState(null);
    const [error, setError] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const revision = React.useRef(0);
    const targets = selection.length
      ? cards.filter((c) => selection.includes(c.id))
      : cards;
    const names = lines(form.titles);
    const products =
      mode === "new"
        ? (names.length ? names : ["Новый товар"]).map((title, i) => ({
            id: "preview-" + i,
            title,
          }))
        : targets;
    const usesText = form.sourceMode !== "images",
      usesImages = form.sourceMode !== "text";
    const change = (key, value) => {
      revision.current++;
      setForm((f) => ({ ...f, [key]: value }));
      setPreview(null);
      setError("");
    };
    const checkbox = (label, checked, onChange) =>
      h(
        "label",
        { className: "ct-option" },
        h("input", {
          type: "checkbox",
          checked,
          onChange: (e) => onChange(e.target.checked),
        }),
        label,
      );
    const select = (label, key, options) =>
      h(
        "label",
        { className: "cw-field" },
        h("span", null, label),
        h(
          "select",
          {
            value: form[key],
            "aria-label": label,
            onChange: (e) => change(key, e.target.value),
          },
          options.map(([value, text]) =>
            h("option", { key: value, value }, text),
          ),
        ),
      );
    const section = (number, title, children) =>
      h(
        "section",
        { className: "ct-generation-section" },
        h("h3", null, h("span", null, number), title),
        children,
      );

    async function upload(event) {
      const files = [...event.target.files];
      event.target.value = "";
      if (!files.length) return;
      setUploading(true);
      setError("");
      try {
        if (form.references.length + files.length > 10)
          throw new Error("Загрузите до 10 исходных изображений за раз.");
        const images = await readSourceImages(files);
        change("references", [
          ...form.references,
          ...images.map((image) => ({
            ...image,
            targetId: products.length === 1 ? products[0].id : "",
          })),
        ]);
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading(false);
      }
    }

    async function generate() {
      setBusy(true);
      setError("");
      const currentRevision = revision.current;
      try {
        if (mode === "existing" && !form.parts.length)
          throw new Error("Выберите, какой контент сгенерировать.");
        if (
          !products.length ||
          products.length > 1000 ||
          products.some((p) => p.title.length > 60)
        )
          throw new Error("От 1 до 1 000 товаров, названия до 60 символов.");
        const codes = lines(form.codes);
        if (mode === "new" && codes.length && codes.length !== products.length)
          throw new Error(
            "Укажите по одному артикулу продавца для каждого товара или оставьте список пустым.",
          );
        if (
          usesImages &&
          form.references.some(
            (image) => !products.some((p) => p.id === image.targetId),
          )
        )
          throw new Error("Привяжите каждое исходное изображение к товару.");
        const input = products.map((product, i) => {
          const uploaded = usesImages
            ? form.references
                .filter((image) => image.targetId === product.id)
                .map(({ targetId, ...image }) => image)
            : [];
          const sourceImages = [
            ...(mode === "existing" && form.useCardImages
              ? product.images
              : []),
            ...uploaded,
          ];
          const sourceText = [
            mode === "existing" && form.useCardText ? product.description : "",
            form.description.trim(),
          ]
            .filter(Boolean)
            .join("\n");
          if (
            form.parts.length &&
            form.sourceMode === "images" &&
            !sourceImages.length
          )
            throw new Error(product.title + ": добавьте исходное изображение.");
          if (
            form.parts.length &&
            usesText &&
            !sourceText &&
            !sourceImages.length &&
            !names.length &&
            mode === "new" &&
            !form.composition &&
            !form.attributes.some((a) => a.value.trim()) &&
            !form.brief.trim()
          )
            throw new Error(
              "Добавьте описание, изображения или характеристики товара.",
            );
          const card =
            mode === "new"
              ? {
                  id: product.id,
                  version: 1,
                  code: codes[i] || "",
                  title: product.title,
                  category: form.category || "Не выбрана",
                  brand: form.brand,
                  composition: form.composition,
                  measurements: form.measurements,
                  attributes: copy(form.attributes),
                  description: usesText ? form.description : "",
                  rich: [],
                  images: [],
                }
              : copy(product);
          if (form.keepPhotos) card.images.push(...uploaded);
          const validation = validateCard(card);
          if (validation) throw new Error(product.title + ": " + validation);
          return {
            ...card,
            generationInput: { description: sourceText, images: sourceImages },
          };
        });
        const changes = form.parts.length
          ? await service.generate(input, { ...form })
          : input.map((c) => ({ id: c.id, version: c.version, patch: {} }));
        if (currentRevision !== revision.current) return;
        if (
          changes.length !== input.length ||
          changes.some(
            (change, i) =>
              change.id !== input[i].id || change.version !== input[i].version,
          )
        )
          throw new Error(
            "Генератор вернул несогласованный результат. Повторите запрос.",
          );
        for (const [i, change] of changes.entries()) {
          if (
            mode === "existing" &&
            form.keepPhotos &&
            !change.patch.images &&
            input[i].images.length !== targets[i].images.length
          )
            change.patch.images = input[i].images;
          const validation = validateCard({ ...input[i], ...change.patch });
          if (validation) throw new Error(input[i].title + ": " + validation);
        }
        setPreview({
          input,
          changes,
          mode,
          sourceMode: form.sourceMode,
          parts: [...form.parts],
        });
        if (form.parts.length)
          await onJob({
            kind: "Контент",
            count: input.length,
            status: "Готово к проверке",
            sources: form.sourceMode,
            parts: form.parts,
          });
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }

    async function apply() {
      setBusy(true);
      setError("");
      try {
        if (preview.mode === "new")
          await onCreate(
            preview.input.map(({ generationInput, ...card }, i) => ({
              ...card,
              ...preview.changes[i].patch,
            })),
          );
        else await onSave(preview.changes, "Генерация");
        setPreview(null);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }

    const updatePreview = (index, key, value) =>
      setPreview((p) => ({
        ...p,
        changes: p.changes.map((c, i) =>
          i === index ? { ...c, patch: { ...c.patch, [key]: value } } : c,
        ),
      }));
    return h(
      "div",
      { className: "ct-create-grid ct-configurable-generation" },
      h(
        "section",
        { className: "cw-panel ct-form-panel" },
        h("div", { className: "cw-kicker" }, "СОЗДАНИЕ И ГЕНЕРАЦИЯ"),
        h("h2", null, "Карточка по вашим данным"),
        h(
          "p",
          null,
          "Выберите исходные материалы, заполните характеристики и настройте результат.",
        ),
        h(
          "div",
          { className: "cw-filters" },
          ...[
            ["new", "Новые товары"],
            ["existing", "Существующие · " + targets.length],
          ].map(([id, label]) =>
            btn(
              label,
              () => {
                revision.current++;
                setMode(id);
                setPreview(null);
                setError("");
              },
              mode === id ? "active" : "",
              { disabled: busy || uploading },
            ),
          ),
        ),
        h(
          "fieldset",
          { className: "ct-generation-controls", disabled: busy || uploading },
          section(
            "01",
            "Исходные материалы",
            h(
              React.Fragment,
              null,
              h(
                "div",
                {
                  className: "ct-source-modes",
                  role: "radiogroup",
                  "aria-label": "Источник генерации",
                },
                [
                  ["text", "Описание", "description"],
                  ["images", "Изображения", "photo_library"],
                  ["both", "Описание + изображения", "auto_awesome"],
                ].map(([id, label, glyph]) =>
                  h(
                    "label",
                    {
                      key: id,
                      className: form.sourceMode === id ? "active" : "",
                    },
                    h("input", {
                      type: "radio",
                      name: "generation-source",
                      value: id,
                      checked: form.sourceMode === id,
                      onChange: () => change("sourceMode", id),
                    }),
                    icon(glyph),
                    h("span", null, label),
                  ),
                ),
              ),
              usesText
                ? field(
                    "Исходное описание",
                    form.description,
                    (v) => change("description", v),
                    {
                      area: true,
                      rows: 4,
                      maxLength: 2000,
                      placeholder:
                        "Расскажите о товаре или вставьте готовое описание",
                    },
                  )
                : null,
              mode === "existing" && usesText
                ? checkbox(
                    "Использовать описание каждого товара",
                    form.useCardText,
                    (v) => change("useCardText", v),
                  )
                : null,
              usesImages
                ? h(
                    "div",
                    { className: "ct-source-upload" },
                    h(
                      "label",
                      { className: "ct-upload-zone" },
                      icon("add_photo_alternate"),
                      h(
                        "strong",
                        null,
                        uploading
                          ? "Загрузка…"
                          : "Загрузить исходные изображения",
                      ),
                      h(
                        "small",
                        null,
                        "PNG, JPEG, WebP · до 10 фото, до 2 МБ каждое",
                      ),
                      h("input", {
                        type: "file",
                        multiple: true,
                        accept: "image/png,image/jpeg,image/webp",
                        "aria-label": "Исходные изображения",
                        onChange: upload,
                      }),
                    ),
                    mode === "existing"
                      ? checkbox(
                          "Использовать изображения каждого товара",
                          form.useCardImages,
                          (v) => change("useCardImages", v),
                        )
                      : null,
                    form.references.length
                      ? h(
                          "div",
                          { className: "ct-source-images" },
                          form.references.map((image) =>
                            h(
                              "article",
                              { key: image.id },
                              h("img", { src: image.src, alt: image.name }),
                              h(
                                "div",
                                null,
                                h("strong", null, image.name),
                                h(
                                  "select",
                                  {
                                    "aria-label": "Товар для " + image.name,
                                    value: image.targetId,
                                    onChange: (e) =>
                                      change(
                                        "references",
                                        form.references.map((ref) =>
                                          ref.id === image.id
                                            ? {
                                                ...ref,
                                                targetId: e.target.value,
                                              }
                                            : ref,
                                        ),
                                      ),
                                  },
                                  h("option", { value: "" }, "Выберите товар"),
                                  products.map((p) =>
                                    h(
                                      "option",
                                      { key: p.id, value: p.id },
                                      p.title,
                                    ),
                                  ),
                                ),
                              ),
                              btn(
                                "×",
                                () =>
                                  change(
                                    "references",
                                    form.references.filter(
                                      (ref) => ref.id !== image.id,
                                    ),
                                  ),
                                "cw-icon-button",
                                {
                                  "aria-label":
                                    "Удалить исходное " + image.name,
                                },
                              ),
                            ),
                          ),
                        )
                      : null,
                    checkbox(
                      "Сохранить загруженные фото в галерее",
                      form.keepPhotos,
                      (v) => change("keepPhotos", v),
                    ),
                    h(
                      "p",
                      { className: "cw-footnote" },
                      "Фото привязываются к товарам отдельно. В демо они используются в макете; свойства по изображению не распознаются.",
                    ),
                  )
                : null,
            ),
          ),
          section(
            "02",
            "Товар и характеристики",
            mode === "new"
              ? h(
                  React.Fragment,
                  null,
                  field(
                    "Названия товаров — по одному на строку",
                    form.titles,
                    (v) => change("titles", v),
                    {
                      area: true,
                      rows: 2,
                      placeholder:
                        "Можно оставить пустым и включить генерацию названия",
                    },
                  ),
                  h(
                    "div",
                    { className: "ct-form-columns" },
                    field(
                      "Категория",
                      form.category,
                      (v) => change("category", v),
                      { maxLength: 100, placeholder: "Например, Пиджаки" },
                    ),
                    field("Бренд", form.brand, (v) => change("brand", v), {
                      maxLength: 100,
                    }),
                  ),
                  field(
                    "Артикулы продавца — по одному на строку",
                    form.codes,
                    (v) => change("codes", v),
                    {
                      area: true,
                      rows: 2,
                      placeholder:
                        "Необязательно: автоматически создадим локальные артикулы",
                    },
                  ),
                  field(
                    "Состав / материал",
                    form.composition,
                    (v) => change("composition", v),
                    { maxLength: 500 },
                  ),
                  field(
                    "Замеры",
                    form.measurements,
                    (v) => change("measurements", v),
                    { area: true, rows: 2, maxLength: 1000 },
                  ),
                  h(CharacteristicsEditor, {
                    value: form.attributes,
                    onChange: (v) => change("attributes", v),
                  }),
                  products.length > 1
                    ? h(
                        "div",
                        { className: "cw-note" },
                        "Общие характеристики применятся ко всем " +
                          products.length +
                          " товарам. Индивидуальные значения можно изменить в редакторе после создания.",
                      )
                    : null,
                )
              : h(
                  "div",
                  { className: "cw-note" },
                  "Товаров: " +
                    targets.length +
                    ". Для каждого используются его собственные характеристики. Изменить их можно в редакторе карточки.",
                ),
          ),
          section(
            "03",
            "Что подготовить",
            h(
              React.Fragment,
              null,
              h(
                "fieldset",
                { className: "ct-fieldset" },
                h("legend", null, "Состав результата"),
                [
                  ["title", "Название"],
                  ["description", "Описание"],
                  ["rich", "Rich-контент"],
                  ["images", "Инфографика"],
                ].map(([id, label]) =>
                  h(
                    "label",
                    { key: id },
                    h("input", {
                      type: "checkbox",
                      checked: form.parts.includes(id),
                      onChange: (e) =>
                        change(
                          "parts",
                          e.target.checked
                            ? [...form.parts, id]
                            : form.parts.filter((p) => p !== id),
                        ),
                    }),
                    label,
                  ),
                ),
              ),
              !form.parts.length && mode === "new"
                ? h(
                    "div",
                    { className: "cw-note" },
                    "Карточки будут созданы из заполненных данных без генерации.",
                  )
                : null,
              form.parts.some((p) => p !== "images")
                ? select("Стиль текста", "tone", [
                    ["Нейтральный", "Нейтральный"],
                    ["Лаконичный", "Лаконичный"],
                  ])
                : null,
              form.parts.includes("rich")
                ? select(
                    "Количество rich-блоков",
                    "richCount",
                    [1, 2, 3, 4, 5, 6].map((n) => [n, n + " блоков"]),
                  )
                : null,
              form.parts.includes("images")
                ? h(
                    "div",
                    { className: "ct-form-columns" },
                    select(
                      "Изображений на товар",
                      "imageCount",
                      [1, 2, 3, 4, 5].map((n) => [n, String(n)]),
                    ),
                    select("Шаблон инфографики", "layout", [
                      ["cover", "Обложка"],
                      ["details", "Детали"],
                    ]),
                    select("Палитра инфографики", "palette", [
                      ["sage", "Шалфей"],
                      ["sand", "Песок"],
                      ["ink", "Тёмная"],
                    ]),
                  )
                : null,
              mode === "existing" &&
                form.parts.some((p) => ["rich", "images"].includes(p))
                ? checkbox(
                    "Заменить прежние rich-блоки и изображения выбранных типов",
                    form.replace,
                    (v) => change("replace", v),
                  )
                : null,
              field(
                "Дополнительные факты о товаре",
                form.brief,
                (v) => change("brief", v),
                {
                  area: true,
                  rows: 3,
                  maxLength: 2000,
                  placeholder: "Особенности товара и указания для генерации",
                },
              ),
            ),
          ),
        ),
        h(
          "p",
          { className: "cw-footnote" },
          "Шаблонный демо-генератор. Проверьте названия, факты и изображения перед сохранением.",
        ),
        btn(
          [
            icon("auto_awesome"),
            busy
              ? " Подготовка…"
              : form.parts.length
                ? " Сгенерировать контент"
                : " Подготовить карточки",
          ],
          generate,
          "cw-primary",
          { disabled: busy || uploading },
        ),
        error
          ? h("div", { className: "cw-error", role: "alert" }, error)
          : null,
      ),
      h(
        "section",
        { className: "cw-panel ct-generation-result" },
        h(
          "div",
          { className: "cw-section-title" },
          h("h3", null, "Предпросмотр карточек"),
          chip(
            preview ? preview.input.length + " товаров" : "До сохранения",
            "green",
          ),
        ),
        preview
          ? h(
              React.Fragment,
              null,
              h(
                "div",
                { className: "ct-generated-list" },
                preview.changes.slice(0, 20).map((change, i) => {
                  const card = { ...preview.input[i], ...change.patch };
                  return h(
                    "article",
                    { key: card.id },
                    h(
                      "div",
                      { className: "cw-kicker" },
                      card.category + (card.brand ? " / " + card.brand : ""),
                    ),
                    field(
                      "Название результата " + (i + 1),
                      card.title,
                      (v) => updatePreview(i, "title", v),
                      { maxLength: 60, disabled: busy },
                    ),
                    h(
                      "div",
                      { className: "ct-result-properties" },
                      [
                        card.composition && "Состав: " + card.composition,
                        card.measurements && "Замеры: " + card.measurements,
                        ...card.attributes
                          .filter((a) => a.value)
                          .map((a) => a.name + ": " + a.value),
                      ]
                        .filter(Boolean)
                        .map((text, j) => h("span", { key: j }, text)),
                    ),
                    card.description
                      ? field(
                          "Описание результата " + (i + 1),
                          card.description,
                          (v) => updatePreview(i, "description", v),
                          {
                            area: true,
                            rows: 5,
                            maxLength: 2000,
                            disabled: busy,
                          },
                        )
                      : null,
                    card.rich.length
                      ? h(
                          "div",
                          { className: "ct-rich-preview" },
                          h(
                            "strong",
                            null,
                            "Rich-контент · " + card.rich.length,
                          ),
                          card.rich.map((block) =>
                            h(
                              "div",
                              { key: block.id },
                              h("strong", null, block.title),
                              h("p", null, block.body),
                            ),
                          ),
                        )
                      : null,
                    card.images.length
                      ? h(
                          "div",
                          { className: "ct-result-images" },
                          card.images.map((image) =>
                            h("img", {
                              key: image.id,
                              src: imageSrc(image),
                              alt: image.alt,
                              title: image.name,
                            }),
                          ),
                        )
                      : null,
                    h(
                      "p",
                      { className: "cw-footnote" },
                      "Источники: " +
                        (preview.sourceMode === "images"
                          ? "изображения"
                          : preview.sourceMode === "text"
                            ? "описание"
                            : "описание + изображения") +
                        ". Название и описание можно поправить здесь.",
                    ),
                  );
                }),
              ),
              preview.input.length > 20
                ? h(
                    "p",
                    { className: "cw-footnote" },
                    "Показаны первые 20. Сохранятся все " +
                      preview.input.length +
                      " товаров.",
                  )
                : null,
              h(
                "div",
                { className: "ct-result-footer" },
                h(
                  "span",
                  null,
                  "Характеристики и выбранный контент сохранятся в карточках.",
                ),
                btn("Сохранить результат", apply, "cw-primary", {
                  disabled: busy,
                }),
              ),
            )
          : h(
              React.Fragment,
              null,
              empty(
                "Ваш результат — на ваших условиях",
                "Описание или фото, любые характеристики и только те виды контента, которые нужны товару.",
              ),
              h(
                "div",
                { className: "ct-generation-summary" },
                h("strong", null, "Сейчас выбрано"),
                h(
                  "p",
                  null,
                  products.length +
                    " товаров · " +
                    form.parts.length +
                    " видов контента",
                ),
                h(
                  "p",
                  null,
                  form.parts.includes("rich")
                    ? form.richCount + " rich-блоков на товар"
                    : "Без генерации rich-контента",
                ),
                h(
                  "p",
                  null,
                  form.parts.includes("images")
                    ? form.imageCount + " макетов на товар"
                    : "Без генерации инфографики",
                ),
              ),
            ),
      ),
    );
  };
}
