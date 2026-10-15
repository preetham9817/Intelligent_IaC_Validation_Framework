const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateSecurityScore,
  normalizeCheckovSeverity,
} = require("../security-score");

test("empty Checkov findings produce a perfect score and zero severity counts", async () => {
  const metrics = await import("../../src/scanMetrics.js");

  assert.equal(calculateSecurityScore([]), 100);
  assert.equal(metrics.calculateSecurityScore([]), 100);
  assert.deepEqual(metrics.countFindingSeverities([]), {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    Unrated: 0,
  });
});

test("mixed and unrated findings are counted exactly once and scored deterministically", async () => {
  const metrics = await import("../../src/scanMetrics.js");
  const findings = [
    { severity: "CRITICAL" },
    { severity: "High" },
    { check_result: { severity: "Medium" } },
    { severity: "Low" },
    { severity: "Unrated" },
    {},
    { severity: "unexpected" },
  ];
  const counts = metrics.countFindingSeverities(findings);

  assert.deepEqual(counts, {
    Critical: 1,
    High: 1,
    Medium: 1,
    Low: 1,
    Unrated: 3,
  });
  assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), findings.length);
  assert.equal(calculateSecurityScore(findings), 76);
  assert.equal(metrics.calculateSecurityScore(findings), 76);
  assert.equal(normalizeCheckovSeverity({ severity: "unexpected" }), "Unrated");
});

test("partial AI coverage and AI severity do not affect the Checkov score", async () => {
  const metrics = await import("../../src/scanMetrics.js");
  const findings = [
    {
      check_id: "CKV_TEST_1",
      checkovSeverity: "High",
      severity: "Low",
    },
    {
      check_id: "CKV_TEST_2",
      checkovSeverity: "Unrated",
      severity: "Critical",
    },
  ];
  const partialAnalysis = {
    status: "partial",
    assessments: [
      {
        rule_id: "CKV_TEST_1",
        severity: "Low",
      },
    ],
    errors: [{ rule_id: "CKV_TEST_2" }],
  };
  const score = calculateSecurityScore(findings);

  assert.equal(score, 94);
  assert.equal(metrics.calculateSecurityScore(findings), score);
  assert.deepEqual(metrics.countFindingSeverities(findings), {
    Critical: 1,
    High: 0,
    Medium: 0,
    Low: 1,
    Unrated: 0,
  });
  assert.equal(partialAnalysis.assessments.length, 1);
  assert.equal(partialAnalysis.errors.length, 1);
});
