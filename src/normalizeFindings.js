import {
  normalizeAiSeverity,
  resolveFindingSeverity,
} from "./assessmentSeverity.js";
import { normalizeCheckovSeverity } from "./scanMetrics.js";

function findAiAssessment(assessments, finding, index, ruleCounts) {
  const ruleId = finding.check_id;
  if (typeof ruleId !== "string" || !ruleId) {
    return null;
  }

  const indexedMatches = assessments.filter(
    (assessment) =>
      assessment.rule_id === ruleId && assessment.finding_index === index
  );
  if (indexedMatches.length === 1) {
    return indexedMatches[0];
  }
  if (indexedMatches.length > 1) {
    return null;
  }

  const legacyMatches = assessments.filter(
    (assessment) =>
      assessment.rule_id === ruleId &&
      assessment.finding_index === undefined
  );
  return ruleCounts.get(ruleId) === 1 && legacyMatches.length === 1
    ? legacyMatches[0]
    : null;
}

export function normalizeCheckovFindings(
  responseData,
  aiAnalysis = responseData?.aiAnalysis
) {
  const reports = Array.isArray(responseData)
    ? responseData
    : [responseData];
  const failedChecks = reports.flatMap((report) =>
    Array.isArray(report?.results?.failed_checks)
      ? report.results.failed_checks
      : []
  );
  const aiAssessments = Array.isArray(aiAnalysis?.assessments)
    ? aiAnalysis.assessments.filter(
        (assessment) =>
          assessment && typeof assessment === "object" && !Array.isArray(assessment)
      )
    : [];
  const ruleCounts = new Map();

  for (const check of failedChecks) {
    if (typeof check?.check_id === "string" && check.check_id) {
      ruleCounts.set(
        check.check_id,
        (ruleCounts.get(check.check_id) || 0) + 1
      );
    }
  }

  return failedChecks.map((rawCheck, index) => {
    const check =
      rawCheck && typeof rawCheck === "object" && !Array.isArray(rawCheck)
        ? rawCheck
        : {};
    const lineRange = Array.isArray(check.file_line_range)
      ? check.file_line_range
      : [];
    const aiAssessment = findAiAssessment(
      aiAssessments,
      check,
      index,
      ruleCounts
    );
    const checkovSeverity = normalizeCheckovSeverity(check);
    const aiSeverity = normalizeAiSeverity(aiAssessment?.severity);
    const severity = resolveFindingSeverity(
      checkovSeverity,
      aiAssessment?.severity
    );

    return {
      id: `${check.check_id || "check"}-${index}`,
      severity,
      checkovSeverity,
      severitySource:
        checkovSeverity !== "Unrated"
          ? "Checkov"
          : aiSeverity
            ? "Ollama"
            : "Unavailable",
      title:
        check.check_name ||
        check.check_id ||
        "Security check failed",
      resource: check.resource || "Unknown resource",
      file: check.file_path || "Unknown file",
      line: lineRange[0] || "—",
      source: "Checkov",
      rule: check.check_id || "",
      description:
        aiAssessment?.reason ||
        check.description ||
        check.check_name ||
        "Checkov detected a failed security check.",
      recommendation:
        aiAssessment?.recommendation ||
        (check.guideline
          ? `Review the Checkov guideline: ${check.guideline}`
          : "Review the failed security check and update the infrastructure configuration."),
      code: JSON.stringify(check.code_block || [], null, 2),
      aiSeverity,
      aiConfidence: aiAssessment?.confidence || null,
      aiReason: aiAssessment?.reason || null,
      aiRecommendation: aiAssessment?.recommendation || null,
      aiEvidence: aiAssessment?.evidence || null,
      aiSource: aiAssessment?.source || null,
    };
  });
}
