const penalties = require("../shared/score-penalties.json");

const severityNames = new Set(["critical", "high", "medium", "low"]);

function normalizeCheckovSeverity(finding) {
  const rawSeverity =
    finding?.checkovSeverity ??
    finding?.severity ??
    finding?.check_result?.severity;

  if (typeof rawSeverity !== "string") {
    return "Unrated";
  }

  const severity = rawSeverity.trim().toLowerCase();
  return severityNames.has(severity)
    ? `${severity[0].toUpperCase()}${severity.slice(1)}`
    : "Unrated";
}

function calculateSecurityScore(findings) {
  const totalPenalty = findings.reduce((total, finding) => {
    const severity = normalizeCheckovSeverity(finding).toLowerCase();
    return total + penalties[severity || "unrated"];
  }, 0);

  return Math.max(0, 100 - totalPenalty);
}

module.exports = { calculateSecurityScore, normalizeCheckovSeverity };
