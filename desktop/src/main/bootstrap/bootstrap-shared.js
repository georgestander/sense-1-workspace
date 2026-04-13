export function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

export function coerceString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function firstString(...values) {
  for (const value of values) {
    const candidate = coerceString(value);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}
