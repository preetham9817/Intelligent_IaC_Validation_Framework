import penalties from "../shared/score-penalties.json" with { type: "json" };

const SEVERITIES = ["Critical", "High", "Medium", "Low", "Unrated"];

function normalizeDisplayedSeverity(finding) {
  const rawSeverity = finding?.severity;
  if (typeof rawSeverity === "string") {
    const severity = rawSeverity.trim().toLowerCase();
    const normalized = SEVERITIES.find(
      (candidate) => candidate.toLowerCase() === severity
    );
    return normalized || "Unrated";
  }

  return normalizeCheckovSeverity(finding);
}

export function normalizeCheckovSeverity(finding) {
  const rawSeverity =
    finding?.checkovSeverity ??
    finding?.severity ??
    finding?.check_result?.severity;

  if (typeof rawSeverity !== "string") {
    return "Unrated";
  }

  const severity = rawSeverity.trim().toLowerCase();
  return ["critical", "high", "medium", "low"].includes(severity)
    ? `${severity[0].toUpperCase()}${severity.slice(1)}`
    : "Unrated";
}

export function countFindingSeverities(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));

  for (const finding of findings) {
    counts[normalizeDisplayedSeverity(finding)] += 1;
  }

  return counts;
}

export function calculateSecurityScore(findings) {
  const totalPenalty = findings.reduce((total, finding) => {
    const severity = normalizeCheckovSeverity(finding).toLowerCase();
    return total + penalties[severity || "unrated"];
  }, 0);

  return Math.max(0, 100 - totalPenalty);
}
