import type { Guide } from "../types";
import { freeeKintai } from "./freee-kintai";

// 手順書の一覧。新しい手順書は guides/ にファイルを足し、ここに 1 つ加える(docs/DESIGN.md 43 章)。
export const GUIDES: readonly Guide[] = [freeeKintai];
