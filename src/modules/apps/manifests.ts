// 業務アプリ(modules/apps/○○)の manifest の一覧。npm run sync:manifests が読む(docs/DESIGN.md 24 章)。
// 新しいアプリを作ったら、ここに 1 行足す。
import type { AppManifest } from "@/modules/core/apps";
import { manifest as arigato } from "./arigato/manifest";
import { manifest as bots } from "./bots/manifest";
import { manifest as calendar } from "./calendar/manifest";
import { manifest as haisou } from "./haisou/manifest";
import { manifest as hr } from "./hr/manifest";
import { manifest as kentei } from "./kentei/manifest";
import { manifest as kyokasho } from "./kyokasho/manifest";
import { manifest as nippo } from "./nippo/manifest";
import { manifest as meyasubako } from "./meyasubako/manifest";
import { manifest as nakama } from "./nakama/manifest";
import { manifest as sodatsu } from "./sodatsu/manifest";
import { manifest as soshikizu } from "./soshikizu/manifest";
import { manifest as todo } from "./todo/manifest";

export const APP_MANIFESTS: readonly AppManifest[] = [sodatsu, arigato, todo, calendar, haisou, kyokasho, hr, soshikizu, nippo, bots, meyasubako, nakama, kentei];
