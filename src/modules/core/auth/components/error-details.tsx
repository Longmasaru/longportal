/** エラーの文と、見直すところの箇条書き(フォーム上部の通知の中身)。 */
export function ErrorDetails({ error, hints }: { error: string; hints?: string[] }) {
  return (
    <>
      <p className="font-bold">{error}</p>
      {hints?.length ? (
        <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-5 text-sm">
          {hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
