/** 画面に渡すメモ・予定 */
export type CalendarEntry = {
  id: string;
  date: string;
  time: string | null;
  title: string;
  note: string;
};

export type EntryFormState = { error?: string; ok?: number } | undefined;
