const path = require("path");
const {
  GetObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const { normalizeAiSeverity } = require("./assessment-severity");

const REPORT_PAGE_SIZE = 50;
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const MAX_SNAPSHOTS = 20;
const reportSnapshots = new Map();

async function readScanReport(s3Client, bucket, objectKey) {
  if (
    typeof objectKey !== "string" ||
    !/^scan-reports\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/i.test(objectKey) ||
    objectKey.includes("..")
  ) {
    throw new Error("Invalid scan report key.");
  }

  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: objectKey })
  );

  if (typeof response.Body?.transformToString !== "function") {
    throw new Error("S3 returned an unreadable scan report body.");
  }

  const report = JSON.parse(await response.Body.transformToString());
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("S3 scan report does not contain a JSON object.");
  }

  return report;
}

function summarizeScanReport(report) {
  const findings = Array.isArray(report.checkovFindings)
    ? report.checkovFindings
    : null;
  const aiAssessment =
    report.ollamaAssessment &&
    typeof report.ollamaAssessment === "object" &&
    !Array.isArray(report.ollamaAssessment)
      ? report.ollamaAssessment
      : null;
  const assessments = Array.isArray(aiAssessment?.assessments)
    ? aiAssessment.assessments
    : [];
  const validAssessments = [];
  const invalidAssessments = [];
  assessments.forEach((assessment, index) => {
    const severity = normalizeAiSeverity(assessment?.severity);
    const valid =
      severity &&
      typeof assessment.reason === "string" &&
      assessment.reason.trim() &&
      typeof assessment.recommendation === "string" &&
      assessment.recommendation.trim();

    if (valid) {
      validAssessments.push({ ...assessment, severity });
    } else {
      invalidAssessments.push({
        finding_index: Number.isInteger(assessment?.finding_index)
          ? assessment.finding_index
          : index,
        rule_id:
          typeof assessment?.rule_id === "string"
            ? assessment.rule_id
            : "Unknown",
        error:
          "Stored assessment did not include a recognized severity and required assessment text.",
      });
    }
  });
  const assessedCount = validAssessments.length;
  const requestedCount = Number.isInteger(aiAssessment?.requestedCount)
    ? aiAssessment.requestedCount
    : findings?.length ?? assessments.length;
  const omittedCount = Number.isInteger(aiAssessment?.omittedCount)
    ? aiAssessment.omittedCount
    : Math.max(0, requestedCount - assessments.length);
  const aiStatus = !aiAssessment
    ? null
    : requestedCount === 0
      ? "completed"
      : assessedCount >= requestedCount && omittedCount === 0
        ? "completed"
        : assessedCount > 0 || assessments.length > 0
          ? "partial"
          : "unavailable";
  const normalizedAiAssessment = aiAssessment
    ? {
        ...aiAssessment,
        status: aiStatus,
        assessedCount,
        requestedCount,
        omittedCount,
        assessments: validAssessments,
        errors: [
          ...(Array.isArray(aiAssessment.errors) ? aiAssessment.errors : []),
          ...invalidAssessments,
        ],
      }
    : null;

  return {
    originalFilename:
      typeof report.originalFilename === "string"
        ? report.originalFilename
        : null,
    scanTimestamp:
      typeof report.scanTimestamp === "string" ? report.scanTimestamp : null,
    securityScore:
      Number.isFinite(report.securityScore) ? report.securityScore : null,
    findingCount: findings ? findings.length : null,
    aiStatus,
    cloudStorage:
      report.cloudStorage &&
      typeof report.cloudStorage === "object" &&
      !Array.isArray(report.cloudStorage)
        ? report.cloudStorage
        : null,
    checkovFindings: findings,
    ollamaAssessment: normalizedAiAssessment,
  };
}

function getPageToken(snapshotId, offset) {
  return Buffer.from(JSON.stringify({ snapshotId, offset })).toString(
    "base64url"
  );
}

function parsePageToken(token) {
  if (typeof token !== "string" || token.length > 256) {
    throw new Error("Invalid report history page token.");
  }

  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString());
    if (
      typeof parsed.snapshotId !== "string" ||
      !Number.isInteger(parsed.offset) ||
      parsed.offset < REPORT_PAGE_SIZE
    ) {
      throw new Error("Invalid report history page token.");
    }
    return parsed;
  } catch {
    throw new Error("Invalid or expired report history page token.");
  }
}

function pruneSnapshots() {
  const now = Date.now();
  for (const [id, snapshot] of reportSnapshots) {
    if (snapshot.expiresAt <= now) {
      reportSnapshots.delete(id);
    }
  }

  while (reportSnapshots.size >= MAX_SNAPSHOTS) {
    reportSnapshots.delete(reportSnapshots.keys().next().value);
  }
}

async function loadAllReportMetadata(s3Client, bucket) {
  const reports = [];
  let continuationToken;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "scan-reports/",
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents || []) {
      if (
        !object.Key ||
        !object.Key.startsWith("scan-reports/") ||
        object.Key.endsWith("/")
      ) {
        continue;
      }

      reports.push({
        objectKey: object.Key,
        filename: path.posix.basename(object.Key),
        lastModified: object.LastModified?.toISOString() || null,
        size: object.Size ?? null,
      });
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;

    if (response.IsTruncated && !continuationToken) {
      throw new Error(
        "S3 indicated more reports were available but returned no continuation token."
      );
    }
  } while (continuationToken);

  reports.sort(
    (first, second) =>
      new Date(second.lastModified || 0) -
      new Date(first.lastModified || 0)
  );

  return reports;
}

async function enrichReportPage(s3Client, bucket, reports) {
  for (let index = 0; index < reports.length; index += 5) {
    await Promise.all(
      reports.slice(index, index + 5).map(async (report) => {
        try {
          const savedReport = await readScanReport(
            s3Client,
            bucket,
            report.objectKey
          );
          const summary = summarizeScanReport(savedReport);
          Object.assign(report, {
            originalFilename: summary.originalFilename,
            scanTimestamp: summary.scanTimestamp,
            securityScore: summary.securityScore,
            findingCount: summary.findingCount,
            aiStatus: summary.aiStatus,
          });
        } catch (error) {
          const errorCode =
            error?.Code || error?.code || error?.name || "UnknownError";
          console.error(
            `Could not read S3 report ${report.objectKey} (${errorCode}): ${error?.message || "Unknown error"}`
          );
          Object.assign(report, {
            originalFilename: null,
            scanTimestamp: null,
            securityScore: null,
            findingCount: null,
            aiStatus: null,
            cloudStorage: null,
          });
        }
      })
    );
  }
}

async function listScanReports(s3Client, bucket, region, continuationToken) {
  let snapshot;
  let offset = 0;

  if (continuationToken) {
    const token = parsePageToken(continuationToken);
    snapshot = reportSnapshots.get(token.snapshotId);
    if (!snapshot || snapshot.expiresAt <= Date.now()) {
      reportSnapshots.delete(token.snapshotId);
      throw new Error("Report history page token expired; refresh the list.");
    }
    offset = token.offset;
  } else {
    const allReports = await loadAllReportMetadata(s3Client, bucket);
    pruneSnapshots();
    const snapshotId = require("crypto").randomUUID();
    snapshot = {
      reports: allReports,
      bucket,
      expiresAt: Date.now() + SNAPSHOT_TTL_MS,
    };
    reportSnapshots.set(snapshotId, snapshot);
    snapshot.id = snapshotId;
  }

  if (snapshot.bucket !== bucket) {
    throw new Error("Report history page token is not valid for this bucket.");
  }

  const page = snapshot.reports.slice(offset, offset + REPORT_PAGE_SIZE);
  await enrichReportPage(s3Client, bucket, page);
  const nextOffset = offset + page.length;
  const nextContinuationToken =
    nextOffset < snapshot.reports.length
      ? getPageToken(snapshot.id, nextOffset)
      : null;

  return {
    success: true,
    bucket,
    region,
    reports: page,
    nextContinuationToken,
    hasMore: Boolean(nextContinuationToken),
  };
}

module.exports = { listScanReports, readScanReport, summarizeScanReport };
