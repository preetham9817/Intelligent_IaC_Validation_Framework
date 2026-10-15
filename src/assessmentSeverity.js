const AI_SEVERITIES = new Map([
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
]);

export function normalizeAiSeverity(value) {
  if (typeof value !== "string") {
    return null;
  }

  return AI_SEVERITIES.get(value.trim().toLowerCase()) || null;
}

export function resolveFindingSeverity(checkovSeverity, aiSeverity) {
  if (checkovSeverity && checkovSeverity !== "Unrated") {
    return checkovSeverity;
  }

  return normalizeAiSeverity(aiSeverity) || "Unrated";
}
