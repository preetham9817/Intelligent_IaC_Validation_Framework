const AI_SEVERITIES = new Map([
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
]);

function normalizeAiSeverity(value) {
  if (typeof value !== "string") {
    return null;
  }

  return AI_SEVERITIES.get(value.trim().toLowerCase()) || null;
}

function normalizeAssessment(content, allowedConfidence) {
  if (typeof content !== "string" || !content.trim()) {
    const error = new Error("Ollama returned an empty assessment.");
    error.name = "AssessmentValidationError";
    throw error;
  }

  const parsed = JSON.parse(content);
  const severity = normalizeAiSeverity(parsed?.severity);
  const confidence =
    typeof parsed?.confidence === "string"
      ? [...allowedConfidence].find(
          (value) => value.toLowerCase() === parsed.confidence.trim().toLowerCase()
        )
      : null;
  const valid =
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    severity &&
    confidence &&
    typeof parsed.reason === "string" &&
    parsed.reason.trim().length > 0 &&
    typeof parsed.recommendation === "string" &&
    parsed.recommendation.trim().length > 0;

  if (!valid) {
    const error = new Error(
      "Ollama response is missing valid severity, confidence, reason, or recommendation fields."
    );
    error.name = "AssessmentValidationError";
    throw error;
  }

  return {
    severity,
    confidence,
    reason: parsed.reason.trim().slice(0, 2000),
    recommendation: parsed.recommendation.trim().slice(0, 2000),
    evidence:
      typeof parsed.evidence === "string"
        ? parsed.evidence.slice(0, 1000)
        : "No additional evidence provided.",
  };
}

module.exports = { normalizeAiSeverity, normalizeAssessment };
