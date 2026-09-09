export function saveDownloadName({
  name = "存档",
  day = 0,
  preview = false,
  kind = "存档",
  now = new Date(),
}: {
  name?: string;
  day?: number;
  preview?: boolean;
  kind?: string;
  now?: Date;
}) {
  const safe = name.replace(/[\x00-\x1f\\/:*?"<>|]/g, "_").slice(0, 32);
  return `仙途_${preview ? "作者预览_" : ""}${kind}_${safe}_第${day + 1}日_${now.toISOString().replace(/[:.]/g, "-")}.json`;
}
export function downloadSaveText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
