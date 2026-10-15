const assert = require("node:assert/strict");
const test = require("node:test");
const { assessFindingsWithOllama } = require("../server");
const {
  listScanReports,
  readScanReport,
  summarizeScanReport,
} = require("../scan-reports");
const { uploadScanReport } = require("../scan-report-storage");
const { normalizeAssessment } = require("../assessment-severity");

const validAssessment = JSON.stringify({
  severity: "Medium",
  confidence: "High",
  reason: "The finding identifies a concrete configuration weakness.",
  recommendation: "Apply the recommended Terraform security setting.",
  evidence: "The resource configuration does not set the required option.",
});

function ollamaResponse(content) {
  return new Response(JSON.stringify({ message: { content } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function finding(checkId) {
  return {
    check_id: checkId,
    check_name: `Finding ${checkId}`,
    resource: `aws_instance.${checkId}`,
    resource_type: "aws_instance",
  };
}

test("S3 upload success returns saved metadata with a unique prefixed JSON object", async () => {
  const requests = [];
  const logs = [];
  const report = {
    originalFilename: "main.tf",
    securityScore: 46,
    checkovFindings: Array.from({ length: 21 }, (_, index) => ({
      check_id: `CKV_TEST_${index}`,
    })),
  };
  const result = await uploadScanReport({
    s3Client: {
      async send(command) {
        requests.push(command.input);
      },
    },
    bucket: "intellvalidate-reports-project",
    region: "us-east-1",
    report,
    createId: () => "scan-id",
    logger: {
      log: (message) => logs.push(message),
      error: () => {},
    },
  });

  assert.equal(result.status, "saved");
  assert.equal(result.bucket, "intellvalidate-reports-project");
  assert.equal(result.region, "us-east-1");
  assert.equal(result.objectKey, "scan-reports/scan-id.json");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].Key, result.objectKey);
  assert.equal(requests[0].ContentType, "application/json");
  assert.equal(requests[0].ServerSideEncryption, "AES256");
  const persistedReport = JSON.parse(requests[0].Body);
  assert.equal(persistedReport.securityScore, 46);
  assert.equal(persistedReport.checkovFindings.length, 21);
  assert.deepEqual(persistedReport.cloudStorage, {
    status: "saved",
    bucket: "intellvalidate-reports-project",
    region: "us-east-1",
    objectKey: "scan-reports/scan-id.json",
  });
  assert.match(logs[0], /s3:\/\/intellvalidate-reports-project\/scan-reports\/scan-id.json/);
});

test("S3 upload failure returns failed status and logs AWS error details", async () => {
  const logs = [];
  const result = await uploadScanReport({
    s3Client: {
      async send() {
        const error = new Error("Access denied to test object");
        error.name = "AccessDenied";
        throw error;
      },
    },
    bucket: "intellvalidate-reports-project",
    region: "us-east-1",
    report: {},
    createId: () => "failed-id",
    logger: {
      log: () => {},
      error: (message) => logs.push(message),
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.bucket, "intellvalidate-reports-project");
  assert.equal(result.region, "us-east-1");
  assert.equal(result.objectKey, undefined);
  assert.match(result.message, /AWS denied the report upload/);
  assert.match(logs[0], /AccessDenied.*Access denied to test object/);
});

test("missing S3 response metadata is not reported as a successful upload", async () => {
  const { getCloudStorageResult } = await import(
    "../../src/cloudStorageStatus.js"
  );
  assert.equal(getCloudStorageResult({ success: true }), null);
  assert.equal(getCloudStorageResult({ cloudStorage: { status: "unknown" } }), null);
  assert.deepEqual(
    getCloudStorageResult({
      cloudStorage: { status: "unknown" },
      storage: {
        status: "saved",
        objectKey: "scan-reports/legacy.json",
      },
    }),
    {
      status: "saved",
      objectKey: "scan-reports/legacy.json",
    }
  );
});

test("malformed Ollama JSON is retried once with a shorter output limit", async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const requests = [];
  const responses = ['{"severity":"High","reason":"truncated', validAssessment];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return ollamaResponse(responses.shift());
  };
  console.warn = () => {};

  try {
    const result = await assessFindingsWithOllama([finding("CKV_TEST_1")]);

    assert.equal(result.status, "completed");
    assert.equal(result.assessedCount, 1);
    assert.equal(result.assessments[0].severity, "Medium");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.num_predict, 500);
    assert.equal(requests[1].options.num_predict, 280);
    assert.ok(
      requests[1].messages[0].content.length <
        requests[0].messages[0].content.length
    );
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("valid Ollama JSON is accepted without retry", async () => {
  const originalFetch = global.fetch;
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return ollamaResponse(validAssessment);
  };

  try {
    const result = await assessFindingsWithOllama([finding("CKV_VALID_1")]);

    assert.equal(requestBodies.length, 1);
    assert.equal(result.status, "completed");
    assert.equal(result.assessments.length, 1);
    assert.deepEqual(
      {
        severity: result.assessments[0].severity,
        confidence: result.assessments[0].confidence,
        reason: result.assessments[0].reason,
        recommendation: result.assessments[0].recommendation,
        evidence: result.assessments[0].evidence,
      },
      JSON.parse(validAssessment)
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("uppercase and lowercase Ollama severities normalize to canonical values", async () => {
  const originalFetch = global.fetch;
  const originalConsole = console.warn;
  const severities = ["CRITICAL", "high", "MeDiUm", "low"];
  const responses = severities.map((severity) =>
    JSON.stringify({
      severity,
      confidence: "HIGH",
      reason: "Evidence-based assessment.",
      recommendation: "Apply the appropriate security fix.",
    })
  );
  global.fetch = async () => ollamaResponse(responses.shift());
  console.warn = () => {};

  try {
    const result = await assessFindingsWithOllama(
      severities.map((_, index) => finding(`CKV_CASE_${index}`))
    );

    assert.equal(result.status, "completed");
    assert.equal(result.assessedCount, 4);
    assert.deepEqual(
      result.assessments.map((assessment) => assessment.severity),
      ["Critical", "High", "Medium", "Low"]
    );
    assert.ok(result.assessments.every((assessment) => assessment.confidence === "High"));
  } finally {
    global.fetch = originalFetch;
    console.warn = originalConsole;
  }
});

test("missing and invalid Ollama severity are rejected rather than guessed", () => {
  const allowedConfidence = new Set(["High", "Medium", "Low"]);
  for (const response of [
    JSON.stringify({
      confidence: "High",
      reason: "Evidence exists.",
      recommendation: "Apply a fix.",
    }),
    JSON.stringify({
      severity: "Unrated",
      confidence: "High",
      reason: "Evidence exists.",
      recommendation: "Apply a fix.",
    }),
    JSON.stringify({
      severity: "Informational",
      confidence: "High",
      reason: "Evidence exists.",
      recommendation: "Apply a fix.",
    }),
  ]) {
    assert.throws(
      () => normalizeAssessment(response, allowedConfidence),
      /missing valid severity/
    );
  }
});

test("persistently malformed JSON fails after the bounded retry", async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    return ollamaResponse('{"severity":"High","reason":"truncated');
  };
  console.warn = () => {};

  try {
    const result = await assessFindingsWithOllama([finding("CKV_BAD_JSON")]);

    assert.equal(requestCount, 2);
    assert.equal(result.status, "unavailable");
    assert.equal(result.assessedCount, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].rule_id, "CKV_BAD_JSON");
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("an individual Ollama request failure is recorded without retry", async () => {
  const originalFetch = global.fetch;
  const originalError = console.error;
  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    return new Response("unavailable", { status: 503 });
  };
  console.error = () => {};

  try {
    const result = await assessFindingsWithOllama([finding("CKV_HTTP_FAIL")]);

    assert.equal(requestCount, 1);
    assert.equal(result.status, "unavailable");
    assert.equal(result.assessments.length, 0);
    assert.equal(result.errors[0].rule_id, "CKV_HTTP_FAIL");
    assert.match(result.errors[0].error, /Ollama HTTP 503/);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
  }
});

test("partial AI coverage retains successful assessment and reports failure counts", async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requestBodies.push(request);
    const prompt = request.messages[0].content;

    if (prompt.includes("CKV_PARTIAL_FAIL")) {
      return ollamaResponse("not-json");
    }

    return ollamaResponse(validAssessment);
  };
  console.warn = () => {};
  console.error = () => {};

  try {
    const result = await assessFindingsWithOllama([
      finding("CKV_PARTIAL_OK"),
      finding("CKV_PARTIAL_FAIL"),
    ]);

    assert.equal(requestBodies.length, 3);
    assert.equal(result.status, "partial");
    assert.equal(result.assessedCount, 1);
    assert.equal(result.requestedCount, 2);
    assert.equal(result.assessments[0].rule_id, "CKV_PARTIAL_OK");
    assert.equal(result.errors.length, 1);
    assert.match(result.message, /1 of 2 findings assessed successfully; 1 assessment failed/);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
  }
});

test("invalid AI severity is retried then counted as incomplete coverage", async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;
  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    return ollamaResponse(
      JSON.stringify({
        severity: "Informational",
        confidence: "High",
        reason: "Evidence exists.",
        recommendation: "Apply a fix.",
      })
    );
  };
  console.warn = () => {};
  console.error = () => {};

  try {
    const result = await assessFindingsWithOllama([
      finding("CKV_INVALID_SEVERITY"),
      finding("CKV_VALID_SEVERITY"),
    ]);
    assert.equal(requestCount, 4);
    assert.equal(result.status, "unavailable");
    assert.equal(result.assessedCount, 0);
    assert.equal(result.requestedCount, 2);
    assert.equal(result.errors.length, 2);
    assert.match(result.message, /No findings were assessed successfully out of 2/);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
  }
});

test("invalid Ollama assessments fail without discarding successful findings", async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const prompt = requests.at(-1).messages[0].content;
    return ollamaResponse(
      prompt.includes("CKV_TEST_1")
        ? JSON.stringify({
            severity: "Extreme",
            confidence: "Certain",
            reason: "",
            recommendation: "Fix it.",
          })
        : validAssessment
    );
  };
  console.warn = () => {};
  console.error = () => {};

  try {
    const result = await assessFindingsWithOllama([
      finding("CKV_TEST_1"),
      finding("CKV_TEST_2"),
    ]);

    assert.equal(result.status, "partial");
    assert.equal(result.assessedCount, 1);
    assert.equal(result.assessments[0].rule_id, "CKV_TEST_2");
    assert.equal(result.errors[0].rule_id, "CKV_TEST_1");
    assert.equal(requests.length, 3);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
  }
});

test("S3 report listing returns paginated metadata in a consistent shape", async () => {
  const requests = [];
  const scanIdOne = "11111111-1111-4111-8111-111111111111";
  const scanIdTwo = "22222222-2222-4222-8222-222222222222";
  const pages = [
    {
      IsTruncated: true,
      NextContinuationToken: "page-2",
      Contents: [
        {
          Key: `scan-reports/${scanIdOne}.json`,
          LastModified: new Date("2025-01-01T00:00:00.000Z"),
          Size: 120,
        },
        { Key: "scan-reports/", Size: 0 },
        { Key: "other-prefix/ignored.json", Size: 10 },
      ],
    },
    {
      IsTruncated: false,
      Contents: [
        {
          Key: `scan-reports/${scanIdTwo}.json`,
          LastModified: new Date("2025-01-02T00:00:00.000Z"),
          Size: 240,
        },
      ],
    },
  ];
  const s3Client = {
    async send(command) {
      requests.push(command.input);
      if ("Prefix" in command.input) {
        return pages.shift();
      }

      const reportsByKey = {
        [`scan-reports/${scanIdOne}.json`]: {
          originalFilename: "scan-one.tf",
          scanTimestamp: "2025-01-01T00:00:00.000Z",
          securityScore: 46,
          checkovFindings: Array.from({ length: 21 }, (_, index) => ({
            check_id: `CKV_ONE_${index}`,
          })),
          ollamaAssessment: { status: "completed" },
        },
        [`scan-reports/${scanIdTwo}.json`]: {
          originalFilename: "scan-two.tf",
          scanTimestamp: "2025-01-02T00:00:00.000Z",
          securityScore: 57,
          checkovFindings: Array.from({ length: 14 }, (_, index) => ({
            check_id: `CKV_TWO_${index}`,
          })),
          ollamaAssessment: {
            status: "partial",
            requestedCount: 14,
            assessments: [
              {
                rule_id: "CKV_TWO_1",
                severity: "Medium",
                reason: "Evidence-backed assessment.",
                recommendation: "Apply a secure setting.",
              },
            ],
          },
        },
      };
      const report = reportsByKey[command.input.Key];
      return {
        Body: {
          async transformToString() {
            return JSON.stringify(report);
          },
        },
      };
    },
  };

  const response = await listScanReports(
    s3Client,
    "intellvalidate-reports-project",
    "us-east-1"
  );

  assert.equal(requests.filter((request) => "Prefix" in request).length, 2);
  assert.equal(requests[0].Bucket, "intellvalidate-reports-project");
  assert.equal(requests[0].Prefix, "scan-reports/");
  assert.equal(requests[1].ContinuationToken, "page-2");
  assert.equal(response.success, true);
  assert.equal(response.bucket, "intellvalidate-reports-project");
  assert.equal(response.region, "us-east-1");
  assert.deepEqual(
    response.reports.map(
      ({
        objectKey,
        filename,
        lastModified,
        size,
        originalFilename,
        securityScore,
        findingCount,
        aiStatus,
      }) => ({
        objectKey,
        filename,
        lastModified,
        size,
        originalFilename,
        securityScore,
        findingCount,
        aiStatus,
      })
    ),
    [
      {
        objectKey: `scan-reports/${scanIdTwo}.json`,
        filename: `${scanIdTwo}.json`,
        lastModified: "2025-01-02T00:00:00.000Z",
        size: 240,
        originalFilename: "scan-two.tf",
        securityScore: 57,
        findingCount: 14,
        aiStatus: "partial",
      },
      {
        objectKey: `scan-reports/${scanIdOne}.json`,
        filename: `${scanIdOne}.json`,
        lastModified: "2025-01-01T00:00:00.000Z",
        size: 120,
        originalFilename: "scan-one.tf",
        securityScore: 46,
        findingCount: 21,
        aiStatus: "unavailable",
      },
    ]
  );
});

test("saved report detail is read from the requested S3 object only", async () => {
  const requestedKeys = [];
  const expectedReport = {
    originalFilename: "test-infrastructure-2.tf",
    scanTimestamp: "2025-01-03T00:00:00.000Z",
    securityScore: 46,
    checkovFindings: Array.from({ length: 21 }, (_, index) => ({
      check_id: `CKV_TEST_${index}`,
    })),
    ollamaAssessment: { status: "completed", assessments: [] },
  };
  const report = await readScanReport(
    {
      async send(command) {
        requestedKeys.push(command.input.Key);
        return {
          Body: {
            async transformToString() {
              return JSON.stringify(expectedReport);
            },
          },
        };
      },
    },
    "intellvalidate-reports-project",
    "scan-reports/33333333-3333-4333-8333-333333333333.json"
  );

  assert.deepEqual(requestedKeys, [
    "scan-reports/33333333-3333-4333-8333-333333333333.json",
  ]);
  assert.equal(report.securityScore, 46);
  assert.equal(report.checkovFindings.length, 21);
});

test("legacy reports retain available fields and leave absent scan data unavailable", () => {
  const summary = summarizeScanReport({
    originalFilename: "legacy.tf",
    checkovFindings: [{ check_id: "CKV_LEGACY" }],
  });

  assert.equal(summary.originalFilename, "legacy.tf");
  assert.equal(summary.findingCount, 1);
  assert.equal(summary.securityScore, null);
  assert.equal(summary.scanTimestamp, null);
  assert.equal(summary.aiStatus, null);
  assert.equal(summary.cloudStorage, null);
});

test("saved report with invalid AI severity is summarized as partial coverage", () => {
  const summary = summarizeScanReport({
    checkovFindings: [{ check_id: "CKV_AWS_144" }],
    ollamaAssessment: {
      status: "completed",
      requestedCount: 1,
      assessedCount: 1,
      assessments: [
        {
          rule_id: "CKV_AWS_144",
          severity: "Unrated",
          reason: "Assessment text.",
          recommendation: "Review the finding.",
        },
      ],
      errors: [],
    },
  });

  assert.equal(summary.aiStatus, "partial");
  assert.equal(summary.ollamaAssessment.status, "partial");
  assert.equal(summary.ollamaAssessment.assessedCount, 0);
  assert.equal(summary.ollamaAssessment.requestedCount, 1);
  assert.equal(summary.ollamaAssessment.assessments.length, 0);
  assert.equal(summary.ollamaAssessment.errors.length, 1);
});

test("historical AI summaries retain only valid assessments and normalize their severities", () => {
  const summary = summarizeScanReport({
    checkovFindings: [
      { check_id: "CKV_AWS_1" },
      { check_id: "CKV_AWS_2" },
    ],
    ollamaAssessment: {
      status: "completed",
      requestedCount: 2,
      assessedCount: 2,
      assessments: [
        {
          rule_id: "CKV_AWS_1",
          severity: "mEdIuM",
          reason: "Evidence-backed assessment.",
          recommendation: "Apply a secure setting.",
        },
        {
          rule_id: "CKV_AWS_2",
          severity: "Unrated",
          reason: "Assessment text.",
          recommendation: "Review the finding.",
        },
      ],
    },
  });

  assert.equal(summary.aiStatus, "partial");
  assert.equal(summary.ollamaAssessment.assessedCount, 1);
  assert.equal(summary.ollamaAssessment.assessments.length, 1);
  assert.equal(summary.ollamaAssessment.assessments[0].severity, "Medium");
  assert.equal(summary.ollamaAssessment.errors.length, 1);
});

test("frontend resolves valid AI severity only when Checkov severity is unavailable", async () => {
  const { resolveFindingSeverity } = await import(
    "../../src/assessmentSeverity.js"
  );

  assert.equal(resolveFindingSeverity("Unrated", "MEDIUM"), "Medium");
  assert.equal(resolveFindingSeverity("High", "Low"), "High");
  assert.equal(resolveFindingSeverity("Unrated", "Unrated"), "Unrated");
  assert.equal(resolveFindingSeverity("Unrated", undefined), "Unrated");
});

test("dashboard totals match displayed severities for 33 findings with partial AI coverage", async () => {
  const { normalizeCheckovFindings } = await import(
    "../../src/normalizeFindings.js"
  );
  const { countFindingSeverities } = await import("../../src/scanMetrics.js");
  const failedChecks = Array.from({ length: 33 }, (_, index) => ({
    check_id: `CKV_REPORT_${index}`,
    check_name: `Finding ${index}`,
    severity: null,
    check_result: { result: "FAILED" },
  }));
  const assessments = Array.from({ length: 25 }, (_, index) => ({
    finding_index: index,
    rule_id: failedChecks[index].check_id,
    severity: index === 2 ? "low" : "MEDIUM",
    confidence: "Medium",
    reason: "Assessment based on the finding evidence.",
    recommendation: "Apply the recommended configuration.",
  }));
  const findings = normalizeCheckovFindings(
    { results: { failed_checks: failedChecks } },
    { status: "partial", assessments }
  );
  const counts = countFindingSeverities(findings);

  assert.deepEqual(counts, {
    Critical: 0,
    High: 0,
    Medium: 24,
    Low: 1,
    Unrated: 8,
  });
  assert.equal(
    Object.values(counts).reduce((total, count) => total + count, 0),
    failedChecks.length
  );
  assert.equal(findings[0].severity, "Medium");
  assert.equal(findings[0].severitySource, "Ollama");
  assert.equal(findings[2].severity, "Low");
  assert.equal(findings[2].severitySource, "Ollama");
  assert.equal(findings[32].severity, "Unrated");
  assert.equal(findings[32].severitySource, "Unavailable");
});

test("finding mapping prefers Checkov metadata and never reuses ambiguous AI assessments", async () => {
  const { normalizeCheckovFindings } = await import(
    "../../src/normalizeFindings.js"
  );
  const failedChecks = [
    { check_id: "CKV_HIGH", severity: "hIgH" },
    { check_id: "CKV_REPEAT", severity: null },
    { check_id: "CKV_REPEAT", severity: null },
    { check_id: "CKV_INVALID", severity: null },
    { check_id: "CKV_MISSING", severity: null },
  ];
  const findings = normalizeCheckovFindings(
    { results: { failed_checks: failedChecks } },
    {
      assessments: [
        {
          finding_index: 0,
          rule_id: "CKV_HIGH",
          severity: "Critical",
        },
        {
          finding_index: 1,
          rule_id: "CKV_REPEAT",
          severity: "Low",
        },
        {
          finding_index: 3,
          rule_id: "CKV_INVALID",
          severity: "Extreme",
        },
      ],
    }
  );

  assert.deepEqual(
    findings.map(({ severity, severitySource }) => ({
      severity,
      severitySource,
    })),
    [
      { severity: "High", severitySource: "Checkov" },
      { severity: "Low", severitySource: "Ollama" },
      { severity: "Unrated", severitySource: "Unavailable" },
      { severity: "Unrated", severitySource: "Unavailable" },
      { severity: "Unrated", severitySource: "Unavailable" },
    ]
  );
});

test("report history uses continuation pages while preserving global newest-first order", async () => {
  const objectKeys = Array.from(
    { length: 51 },
    (_, index) =>
      `scan-reports/${String(index).padStart(3, "0")}.json`
  );
  let listCalled = false;
  const s3Client = {
    async send(command) {
      const input = command.input;
      if (input.Prefix) {
        assert.equal(input.Prefix, "scan-reports/");
        assert.equal(input.MaxKeys, 1000);
        assert.equal(listCalled, false);
        listCalled = true;
        return {
          IsTruncated: false,
          Contents: objectKeys.map((Key, index) => ({
            Key,
            LastModified: new Date(index * 1000),
            Size: index,
          })),
        };
      }

      const index = Number(input.Key.match(/(\d+)\.json$/)[1]);
      return {
        Body: {
          async transformToString() {
            return JSON.stringify({
              originalFilename: `scan-${index}.tf`,
              scanTimestamp: new Date(index * 1000).toISOString(),
              securityScore: index,
              checkovFindings: Array.from({ length: index }, () => ({})),
            });
          },
        },
      };
    },
  };

  const firstPage = await listScanReports(
    s3Client,
    "intellvalidate-reports-project",
    "us-east-1"
  );

  assert.equal(firstPage.reports.length, 50);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.reports[0].securityScore, 50);
  assert.equal(firstPage.reports[0].findingCount, 50);
  assert.equal(firstPage.reports.at(-1).securityScore, 1);

  const secondPage = await listScanReports(
    s3Client,
    "intellvalidate-reports-project",
    "us-east-1",
    firstPage.nextContinuationToken
  );
  assert.equal(secondPage.reports.length, 1);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.reports[0].securityScore, 0);
  assert.equal(secondPage.reports[0].findingCount, 0);
});
