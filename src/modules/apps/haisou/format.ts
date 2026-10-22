const TIME_ZONE = "Asia/Tokyo";

const savedFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `MM/dd HH:mm`(JST) */
export function formatSaved(d: Date): string {
  const p = Object.fromEntries(savedFormat.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

const stampFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** `yyyy/MM/dd HH:mm:ss`(JST)。シートに日時として書くときに使う。 */
export function formatStamp(d: Date): string {
  const p = Object.fromEntries(stampFormat.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
