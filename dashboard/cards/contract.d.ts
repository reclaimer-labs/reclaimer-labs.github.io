/** Internal DTOs for the content workspace. WB transport schemas belong in a server adapter. */
export interface RichBlock {
  id: string;
  title: string;
  body: string;
  imageId?: string;
}
export interface CardImage {
  id: string;
  name: string;
  alt: string;
  source: "template" | "upload";
  /** Prototype only. Production should use managed asset URLs/IDs. */
  svg?: string;
  src?: string;
}
export interface CardContent {
  category: string;
  brand: string;
  attributes: ProductAttribute[];
  title: string;
  description: string;
  composition: string;
  measurements: string;
  rich: RichBlock[];
  images: CardImage[];
}
export interface ProductAttribute {
  id: string;
  name: string;
  value: string;
}
export interface Card extends CardContent {
  id: string;
  nm: string;
  code: string;
  version: number;
  /** Local workflow state, not a verified WB publication state. */
  status: "published" | "draft" | "new";
  search?: string;
  rank?: number | null;
}
export interface HistoryEntry {
  id: string;
  cardId: string;
  at: string;
  source: string;
  version: number;
  before: CardContent;
  after: CardContent;
}
export interface GenerationJob {
  id: string;
  at: string;
  [key: string]: unknown;
}
export interface Snapshot {
  schemaVersion: 2;
  cards: Card[];
  history: HistoryEntry[];
  jobs: GenerationJob[];
  warning?: string;
}
export interface CardChange {
  id: string;
  version: number;
  patch: Partial<CardContent>;
}
export interface NewCard {
  title: string;
  code?: string;
  category?: string;
  brand?: string;
  attributes?: ProductAttribute[];
  description?: string;
  composition?: string;
  measurements?: string;
  rich?: RichBlock[];
  images?: CardImage[];
}
export interface ContentRepository {
  load(): Promise<Snapshot>;
  /** Atomic batch; reject on stale version or invalid content. */
  saveBatch(changes: CardChange[], source?: string): Promise<Snapshot>;
  /** Atomic creation of 1..1000 local cards. */
  createMany(rows: NewCard[]): Promise<Snapshot & { created: string[] }>;
  recordJob(job: Record<string, unknown>): Promise<Snapshot>;
}
export interface WorkspaceProps {
  initialQuery?: string;
}
export type GenerationPart = "title" | "description" | "rich" | "images";
export interface GenerationOptions {
  sourceMode: "text" | "images" | "both";
  parts: GenerationPart[];
  brief?: string;
  tone?: string;
  richCount?: number | string;
  imageCount?: number | string;
  palette?: "sage" | "sand" | "ink";
  layout?: "cover" | "details";
  replace?: boolean;
}
export interface GenerationInput extends CardContent {
  id: string;
  version: number;
  generationInput: { description: string; images: CardImage[] };
}
export interface GenerationService {
  /** Return one patch per input in the same order, with its ID and base version. */
  generate(
    cards: GenerationInput[],
    options: GenerationOptions,
  ): CardChange[] | Promise<CardChange[]>;
}
