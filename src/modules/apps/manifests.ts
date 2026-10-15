// 業務アプリ(modules/apps/○○)の manifest の一覧。npm run sync:manifests が読む(docs/DESIGN.md 24 章)。
// 新しいアプリを作ったら、ここに 1 行足す。
import type { AppManifest } from "@/modules/core/apps";
import { manifest as sodatsu } from "./sodatsu/manifest";
import { manifest as todo } from "./todo/manifest";

export const APP_MANIFESTS: readonly AppManifest[] = [sodatsu, todo];
