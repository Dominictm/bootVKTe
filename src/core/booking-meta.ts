export interface BookingMeta {
  platform: "telegram" | "vk";
  userId: string;
  username: string;
}

const META_MARKER = "---META---";
const DESCRIPTION_PREFIX = "Забронировано через бота.";

export function encodeDescription(meta: BookingMeta): string {
  return `${DESCRIPTION_PREFIX}\n${META_MARKER}\n${JSON.stringify(meta)}`;
}

export function decodeDescription(description: string | null | undefined): BookingMeta | null {
  if (!description) return null;
  const idx = description.indexOf(META_MARKER);
  if (idx === -1) return null;
  const jsonPart = description.slice(idx + META_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed.platform === "telegram" || parsed.platform === "vk") &&
      typeof parsed.userId === "string" &&
      typeof parsed.username === "string"
    ) {
      return parsed as BookingMeta;
    }
    return null;
  } catch {
    return null;
  }
}

export function matchesUser(
  meta: BookingMeta | null,
  platform: "telegram" | "vk",
  userId: string
): boolean {
  return meta !== null && meta.platform === platform && meta.userId === userId;
}
