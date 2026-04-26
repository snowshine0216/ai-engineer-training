// The leading # strip is belt-and-suspenders: all capture groups start with [A-Za-z0-9] so
// no captured value can begin with # or ：:. The trailing punctuation strip is load-bearing.
const normalizeMatch = (value: string): string =>
  value.trim().replace(/^[#：:]+/, "").replace(/[。.,，;；!?！？]+$/u, "");

const PATTERNS = [
  /订单号?\s*[：:]?\s*([A-Za-z0-9][A-Za-z0-9-]{2,31})/u,
  /order(?:\s+id)?\s*[#：:]?\s*([A-Za-z0-9][A-Za-z0-9-]{2,31})/iu,
  /#([A-Za-z0-9][A-Za-z0-9-]{2,31})/u,
] as const;

export const extractOrderNumber = (text: string): string | null => {
  const normalizedText = text.trim();
  if (normalizedText.length === 0) return null;

  for (const pattern of PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) return normalizeMatch(match[1]);
  }

  return null;
};
