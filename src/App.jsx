import { useCallback, useState } from "react";
import {
  ShieldCheck,
  UploadCloud,
  FileCode2,
  Search,
  BrainCircuit,
  FileCheck2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronRight,
  Download,
  RotateCcw,
  RefreshCw,
  Activity,
  Lock,
  Network,
  Cpu,
  Cloud,
  Zap,
  Menu,
  X,
} from "lucide-react";
import {
  calculateSecurityScore,
  countFindingSeverities,
  normalizeCheckovSeverity,
} from "./scanMetrics";
import { getCloudStorageResult } from "./cloudStorageStatus";
import { normalizeCheckovFindings } from "./normalizeFindings";
import "./App.css";

function App() {
  const [page, setPage] = useState("home");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDetailsLoading, setReportDetailsLoading] = useState(false);
  const [reportDetailsError, setReportDetailsError] = useState("");
  const [file, setFile] = useState(null);
  const [validationStarted, setValidationStarted] = useState(false);
  const [findings, setFindings] = useState([]);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);
  const [scanError, setScanError] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [storageStatus, setStorageStatus] = useState(null);
  const [scannedFileName, setScannedFileName] = useState("");
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [reportsContinuationToken, setReportsContinuationToken] =
    useState(null);
  const [reportsError, setReportsError] = useState("");
  const [reportsBucket, setReportsBucket] = useState("");
  const [reportsRegion, setReportsRegion] = useState("");

  const loadReports = useCallback(async (append = false) => {
    setReportsLoading(true);
    setReportsError("");

    try {
      const query = append && reportsContinuationToken
        ? `?continuationToken=${encodeURIComponent(reportsContinuationToken)}`
        : "";
      const response = await fetch(
        `http://localhost:5000/api/reports${query}`
      );
      let data;

      if (!response.ok && response.status === 404) {
        throw new Error(
          "Reports API returned 404. Restart the backend so the /api/reports route is loaded."
        );
      }

      if (
        !response.ok &&
        !response.headers
          .get("content-type")
          ?.includes("application/json")
      ) {
        throw new Error(`Reports service returned HTTP ${response.status}.`);
      }

      try {
        data = await response.json();
      } catch {
        throw new Error("The reports service returned an invalid response.");
      }

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "S3 reports could not be loaded.");
      }

      if (!Array.isArray(data.reports)) {
        throw new Error("Reports service returned an invalid reports list.");
      }
      const receivedReports = data.reports.filter(
        (report) =>
          report &&
          typeof report === "object" &&
          typeof report.objectKey === "string"
      );
      setReports((currentReports) => {
        if (!append) {
          return receivedReports;
        }
        const reportsByKey = new Map(
          currentReports.map((report) => [report.objectKey, report])
        );
        for (const report of receivedReports) {
          reportsByKey.set(report.objectKey, report);
        }
        return [...reportsByKey.values()];
      });
      setReportsContinuationToken(data.nextContinuationToken || null);
      setReportsHasMore(Boolean(data.hasMore));
      setReportsBucket(data.bucket || "");
      setReportsRegion(data.region || "");
    } catch (error) {
      setReportsError(error.message || "S3 reports could not be loaded.");
    } finally {
      setReportsLoading(false);
    }
  }, [reportsContinuationToken]);

  const viewSavedReport = async (report) => {
    setSelectedReport(null);
    setReportDetailsError("");
    setReportDetailsLoading(true);

    try {
      const filename = report.objectKey?.split("/").pop();
      if (
        !filename ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/i.test(filename) ||
        filename.includes("..")
      ) {
        throw new Error("This report does not have a supported report identifier.");
      }

      const response = await fetch(
        `http://localhost:5000/api/reports/${encodeURIComponent(filename)}`
      );
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The report service returned an invalid response.");
      }

      if (!response.ok || !data?.success || !data.report) {
        throw new Error(data?.message || "This saved report could not be loaded.");
      }

      setSelectedReport(data.report);
    } catch (error) {
      setReportDetailsError(error.message || "This saved report could not be loaded.");
    } finally {
      setReportDetailsLoading(false);
    }
  };

  const severityCounts = countFindingSeverities(findings);
  const unratedFindingsCount = severityCounts.Unrated;
  const calculatedSecurityScore = calculateSecurityScore(findings);
  const securityScore = scanCompleted
    ? scanSummary?.securityScore ?? calculatedSecurityScore
    : null;

  const scanTimestamp = scanSummary?.scanTimestamp
    ? new Date(scanSummary.scanTimestamp)
    : null;
  const formattedScanTimestamp =
    scanTimestamp && !Number.isNaN(scanTimestamp.getTime())
      ? scanTimestamp.toLocaleString()
      : "Unavailable";
  const aiRequestedCount = Number.isFinite(aiAnalysis?.requestedCount)
    ? aiAnalysis.requestedCount +
      (Number.isFinite(aiAnalysis?.attemptedCount)
        ? 0
        : aiAnalysis?.omittedCount || 0)
    : scanSummary?.failedCheckCount ?? findings.length;
  const aiAssessedCount = aiAnalysis?.assessedCount ?? 0;
  const aiOmittedCount = aiAnalysis?.omittedCount ?? 0;
  const aiErrorCount = aiAnalysis?.errors?.length ?? 0;
  const aiDisplayStatus = scanCompleted ? "Completed" : "Not run";
  const aiAssessmentExplanation =
    !aiAnalysis
      ? "The backend did not return AI assessment details for this scan."
      : aiAnalysis.status === "completed"
        ? aiRequestedCount === 0
          ? "No failed Checkov findings required an AI assessment."
          : `All ${aiAssessedCount} failed Checkov findings were assessed.`
        : aiAnalysis.status === "partial"
          ? `The local LLM assessed ${aiAssessedCount} of ${aiRequestedCount} failed Checkov findings.${
              aiErrorCount
                ? ` ${aiErrorCount} assessment${
                    aiErrorCount === 1 ? "" : "s"
                  } failed.`
                : ""
            }${
              aiOmittedCount
                ? ` ${aiOmittedCount} finding${
                    aiOmittedCount === 1 ? " was" : "s were"
                  } omitted because the per-scan assessment limit was reached.`
                : ""
            }`
          : aiAnalysis.message ||
            `The local LLM did not assess any of ${aiRequestedCount} failed Checkov findings.`;

    const navigate = (newPage) => {
      setPage(newPage);
      setMobileMenu(false);
      if (newPage === "reports") {
        loadReports();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

  const handleFile = (event) => {
    const selected = event.target.files?.[0];
    if (selected) {
      setFile(selected);
    }
  };


const startValidation = async () => {
  if (!file) {
    alert("Please select an IaC file first.");
    return;
  }

  setValidationStarted(true);
  setScanError("");

  try {
    // Prepare the file for the backend.
    const formData = new FormData();
    formData.append("iacFile", file);

    // Upload the file and run Checkov.
    const response = await fetch(
      "http://localhost:5000/api/upload",
      {
        method: "POST",
        body: formData,
      }    );

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The backend returned an invalid response.");
    }

    console.log("Backend response:", data);
    if (!response.ok || !data?.success) {
      throw new Error(
        data.message || "Validation failed."
      );
    }

    const checkovReports = Array.isArray(data.checkov?.results)
      ? data.checkov.results
      : [data.checkov?.results].filter(Boolean);
    const passedCheckCount = checkovReports.reduce(
      (total, report) =>
        total + (report?.results?.passed_checks?.length || 0),
      0
    );
    const normalizedFindings = normalizeCheckovFindings(
      data.checkov?.results,
      data.aiAnalysis
    );
    console.table(
      normalizedFindings.map((finding) => ({
        rule: finding.rule,
        title: finding.title,
        severity: finding.severity,
        aiSeverity: finding.aiSeverity,
        confidence: finding.aiConfidence,
      }))
    );

    console.log("AI analysis:", data.aiAnalysis);


    setFindings(normalizedFindings);

    // Store the local LLM assessment status and results.
    const completed = Boolean(data.checkov?.results) &&
      data.checkov?.completed !== false;
    setScanCompleted(completed);
    setScanSummary(
      completed
        ? {
            scanTimestamp: data.scanTimestamp || null,
            securityScore:
              Number.isFinite(data.securityScore)
                ? data.securityScore
                : calculateSecurityScore(normalizedFindings),
            failedCheckCount: normalizedFindings.length,
            passedCheckCount,
          }
        : null
    );
    setAiAnalysis(data.aiAnalysis || null);
    setStorageStatus(getCloudStorageResult(data));

    setScannedFileName(
      data.file?.originalName || file.name
    );

    // Open Results only after the scan succeeds.
    setSelectedFinding(null);
    setPage("results");
  } catch (error) {
    console.error("Validation error:", error);
    setScanError(error.message || "The scan could not be completed.");
  } finally {
    setValidationStarted(false);
  }
};

  const checkovStageStatus = validationStarted
    ? "WAIT"
    : scanCompleted
      ? "DONE"
      : "READY";
  const aiStageStatus = validationStarted
    ? "WAIT"
    : !scanCompleted
      ? "READY"
      : "DONE";
  const reportStageStatus = validationStarted
    ? "WAIT"
    : !scanCompleted
      ? "READY"
      : storageStatus?.status === "saved"
        ? "SAVED"
        : storageStatus?.status === "failed"
          ? "FAILED"
          : "NOT REPORTED";
  const pipelineItemClass = (status) =>
    status === "DONE" || status === "SAVED"
      ? "completed"
      : status === "PARTIAL" ||
          status === "UNAVAILABLE" ||
          status === "FAILED"
        ? "failed-pipeline"
        : "";

  const severityIcon = (severity) => {
    if (severity === "Critical") return <XCircle size={18} />;
    if (severity === "High") return <AlertTriangle size={18} />;
    if (severity === "Medium") return <Info size={18} />;
    return <CheckCircle2 size={18} />;
  };


  return (
    <div className="app">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="nav-container">
          <button className="brand" onClick={() => navigate("home")}>
            <div className="brand-icon">
              <ShieldCheck size={25} />
            </div>
            <div>
              <div className="brand-name">IntelliValidate</div>
              <div className="brand-subtitle">SMART INFRASTRUCTURE SECURITY</div>
            </div>
          </button>

          <div className={`nav-links ${mobileMenu ? "mobile-open" : ""}`}>
            <button
              className={page === "home" ? "nav-link active" : "nav-link"}
              onClick={() => navigate("home")}
            >
              Home
            </button>

            <button
              className={page === "dashboard" ? "nav-link active" : "nav-link"}
              onClick={() => navigate("dashboard")}
            >
              Dashboard
            </button>

            <button
              className={page === "results" ? "nav-link active" : "nav-link"}
              onClick={() => navigate("results")}
            >
              Results
            </button>

            <button
              className={page === "reports" ? "nav-link active" : "nav-link"}
              onClick={() => navigate("reports")}
            >
              Reports
            </button>
          </div>

          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>

          <button
            className="nav-action"
            onClick={() => navigate("dashboard")}
          >
            <UploadCloud size={17} />
            Validate IaC
          </button>
        </div>
      </nav>

      {/* HOME */}
      {page === "home" && (
        <main>
          <section className="hero">
            <div className="hero-grid"></div>

            <div className="hero-content">
              <div className="status-pill">
                <span className="status-dot"></span>
                AI-POWERED INFRASTRUCTURE SECURITY
              </div>

              <h1>
                Validate Infrastructure
                <span> Before It Reaches Production.</span>
              </h1>

              <p className="hero-description">
                IntelliValidate combines rule-based IaC scanning with
                Large Language Model reasoning to detect cloud security
                and smart-manufacturing risks before deployment.
              </p>

              <div className="hero-buttons">
                <button
                  className="primary-button"
                  onClick={() => navigate("dashboard")}
                >
                  Start Validation
                  <ArrowRight size={18} />
                </button>

                <button
                  className="secondary-button"
                  onClick={() => navigate("results")}
                >
                  View Sample Report
                </button>
              </div>

              <div className="hero-tech">
                <span>
                  <CheckCircle2 size={15} /> Terraform
                </span>
                <span>
                  <CheckCircle2 size={15} /> CloudFormation
                </span>
                <span>
                  <CheckCircle2 size={15} /> Checkov
                </span>
                <span>
                  <CheckCircle2 size={15} /> TFLint
                </span>
              </div>
            </div>

            <div className="hero-visual">
              <div className="terminal-window">
                <div className="terminal-header">
                  <div className="terminal-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span>validation_pipeline</span>
                  <Activity size={15} />
                </div>

                <div className="terminal-body">
                  <div className="terminal-line muted">
                    {validationStarted
                      ? "$ scan in progress"
                      : scanCompleted
                        ? `$ last scan: ${scannedFileName}`
                        : "$ waiting for first scan"}
                  </div>

                  <div
                    className={`pipeline-run-status ${
                      validationStarted
                        ? "running"
                        : scanCompleted
                          ? "completed"
                          : ""
                    }`}
                    role="status"
                  >
                    {validationStarted ? (
                      <>
                        <Activity size={15} className="spin" />
                        <span>Scan running; stage results will update when it completes.</span>
                      </>
                    ) : scanCompleted ? (
                      <>
                        <CheckCircle2 size={15} />
                        <span>Latest scan completed</span>
                      </>
                    ) : (
                      <>
                        <Info size={15} />
                        <span>No scans have been run yet.</span>
                      </>
                    )}
                  </div>

                  <div className={`pipeline-item ${pipelineItemClass(validationStarted ? "WAIT" : scanCompleted ? "DONE" : "READY")}`}>
                    {scanCompleted && !validationStarted ? <CheckCircle2 size={16} /> : <UploadCloud size={16} />}
                    <span>Ingestion Layer</span>
                    <small>{validationStarted ? "WAIT" : scanCompleted ? "DONE" : "READY"}</small>
                  </div>

                  <div className={`pipeline-item ${pipelineItemClass(checkovStageStatus)}`}>
                    {checkovStageStatus === "DONE" ? <CheckCircle2 size={16} /> : <Search size={16} />}
                    <span>Static Analysis</span>
                    <small>{checkovStageStatus}</small>
                  </div>

                  <div className={`pipeline-item ${pipelineItemClass(aiStageStatus)}`}>
                    {aiStageStatus === "DONE" ? <CheckCircle2 size={16} /> : <BrainCircuit size={16} />}
                    <span>LLM Reasoning</span>
                    <small>{aiStageStatus}</small>
                  </div>

                  <div className={`pipeline-item ${pipelineItemClass(reportStageStatus)}`}>
                    {reportStageStatus === "SAVED" ? <CheckCircle2 size={16} /> : <FileCheck2 size={16} />}
                    <span>S3 Report Storage</span>
                    <small>{reportStageStatus}</small>
                  </div>

                  <div className="terminal-result">
                    <span>{validationStarted && scanCompleted ? "Last completed scan findings" : "Latest scan findings"}</span>
                    <strong>{scanCompleted ? findings.length : "—"}</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="stats-section">
            <div className="stat-item">
              <ShieldCheck size={24} />
              <div>
                <strong>Multi-Layer</strong>
                <span>Security Validation</span>
              </div>
            </div>

            <div className="stat-item">
              <BrainCircuit size={24} />
              <div>
                <strong>Context-Aware</strong>
                <span>LLM Reasoning</span>
              </div>
            </div>

            <div className="stat-item">
              <Network size={24} />
              <div>
                <strong>IT / OT</strong>
                <span>Manufacturing Security</span>
              </div>
            </div>

            <div className="stat-item">
              <Lock size={24} />
              <div>
                <strong>Pre-Deployment</strong>
                <span>Risk Detection</span>
              </div>
            </div>
          </section>

          <section className="features-section">
            <div className="section-heading">
              <div className="eyebrow">WHY INTELLIVALIDATE</div>
              <h2>Security that understands your infrastructure.</h2>
              <p>
                Traditional scanners identify known rule violations.
                IntelliValidate adds contextual reasoning to identify
                risks that depend on infrastructure intent.
              </p>
            </div>

            <div className="feature-grid">
              <FeatureCard
                icon={<Search />}
                title="Static Analysis"
                text="Run Checkov and TFLint to identify known cloud security and configuration issues."
              />

              <FeatureCard
                icon={<BrainCircuit />}
                title="LLM Reasoning"
                text="Analyze infrastructure context and identify novel or domain-specific security risks."
              />

              <FeatureCard
                icon={<Network />}
                title="IT / OT Security"
                text="Evaluate manufacturing scenarios such as IoT gateways, edge devices and network segregation."
              />

              <FeatureCard
                icon={<FileCheck2 />}
                title="Actionable Reports"
                text="Receive plain-language explanations, severity levels and concrete remediation snippets."
              />
            </div>
          </section>

          <section className="architecture-section">
            <div className="section-heading centered">
              <div className="eyebrow">VALIDATION PIPELINE</div>
              <h2>From Infrastructure Code to Security Insight</h2>
            </div>

            <div className="architecture-flow">
              <ArchitectureStep
                number="01"
                icon={<UploadCloud />}
                title="Ingestion"
                text="IaC Project"
              />
              <div className="flow-arrow">
                <ChevronRight />
              </div>

              <ArchitectureStep
                number="02"
                icon={<Search />}
                title="Static Analysis"
                text="Checkov + TFLint"
              />
              <div className="flow-arrow">
                <ChevronRight />
              </div>

              <ArchitectureStep
                number="03"
                icon={<BrainCircuit />}
                title="LLM Reasoning"
                text="Context Analysis"
              />
              <div className="flow-arrow">
                <ChevronRight />
              </div>

              <ArchitectureStep
                number="04"
                icon={<FileCheck2 />}
                title="Reporting"
                text="Actionable Report"
              />
            </div>
          </section>
        </main>
      )}

      {/* DASHBOARD */}
      {page === "dashboard" && (
        <main className="page-container">
          <div className="page-header">
            <div>
              <div className="eyebrow">VALIDATION CENTER</div>
              <h1>Infrastructure Validation</h1>
              <p>
                Upload your Terraform or CloudFormation project to begin
                security analysis.
              </p>
            </div>

            <div className="live-badge">
              <span className="status-dot"></span>
              System Ready
            </div>
          </div>

          {scanError && (
            <div className="scan-error" role="alert">
              <AlertTriangle size={18} />
              <span>{scanError}</span>
            </div>
          )}

          <section className="dashboard-scan-summary">
            <div className="dashboard-summary-heading">
              <div>
                <div className="eyebrow">LATEST SCAN</div>
                <h2>{scanCompleted ? scannedFileName : "No completed scan"}</h2>
              </div>
              <span className={`scan-state ${scanCompleted ? "success" : ""}`}>
                {validationStarted
                  ? "Scan in progress"
                  : scanCompleted
                    ? "Completed"
                    : "Ready"}
              </span>
            </div>
            <div className="dashboard-metrics">
              <DashboardMetric
                label="Security score"
                value={scanCompleted && securityScore !== null ? `${securityScore}/100` : "—"}
              />
              <DashboardMetric
                label="Failed checks"
                value={scanCompleted ? scanSummary?.failedCheckCount ?? findings.length : "—"}
              />
              <DashboardMetric
                label="Passed checks"
                value={scanCompleted ? scanSummary?.passedCheckCount ?? "—" : "—"}
              />
              <DashboardMetric
                label="AI assessment"
                value={
                  !scanCompleted ? "—" : aiDisplayStatus
                }
              />
              <DashboardMetric
                label="Scan timestamp"
                value={scanCompleted ? formattedScanTimestamp : "—"}
              />
            </div>
            {scanCompleted &&
              (aiAnalysis?.status !== "completed" ||
                aiAssessedCount !== aiRequestedCount) && (
              <p className="dashboard-ai-explanation">
                Display status: Completed. Backend coverage:{" "}
                {aiAssessedCount}/{aiRequestedCount}. {aiAssessmentExplanation}
              </p>
            )}
          </section>

          <div className="dashboard-grid">
            <section className="upload-card">
              <div className="card-heading">
                <div className="card-icon">
                  <UploadCloud />
                </div>
                <div>
                  <h2>Upload Infrastructure</h2>
                  <p>Terraform or AWS CloudFormation</p>
                </div>
              </div>

              <label className={`drop-zone ${file ? "has-file" : ""}`}>
                <input
                  type="file"
                  accept=".tf,.yaml,.yml,.json,.zip"
                  onChange={handleFile}
                />

                {file ? (
                  <>
                    <div className="uploaded-icon">
                      <FileCode2 />
                    </div>
                    <h3>{file.name}</h3>
                    <p>{(file.size / 1024).toFixed(1)} KB</p>
                    <span className="change-file">Click to change file</span>
                  </>
                ) : (
                  <>
                    <div className="upload-icon">
                      <UploadCloud />
                    </div>
                    <h3>Drop your IaC file here</h3>
                    <p>or click to browse from your computer</p>
                    <span className="file-types">
                      .TF &nbsp; .YAML &nbsp; .JSON &nbsp; .ZIP
                    </span>
                  </>
                )}
              </label>

              <div className="form-row">
                <div className="form-group">
                  <label>Infrastructure Type</label>
                  <select>
                    <option>Terraform</option>
                    <option>AWS CloudFormation</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Manufacturing Context</label>
                  <select>
                    <option>Smart Manufacturing</option>
                    <option>IoT Gateway</option>
                    <option>Edge Device</option>
                    <option>MES / SCADA</option>
                    <option>IT / OT Network</option>
                  </select>
                </div>
              </div>

              <button
                className="validate-button"
                disabled={!file || validationStarted}
                onClick={startValidation}
              >
                {validationStarted ? (
                  <>
                    <Activity size={19} className="spin" />
                    Running Validation...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={19} />
                    Start Security Validation
                  </>
                )}
              </button>

              {!file && (
                <p className="upload-note">
                  Select an IaC file to enable validation.
                </p>
              )}
            </section>

            <section className="pipeline-card">
              <div className="card-heading">
                <div className="card-icon">
                  <Activity />
                </div>
                <div>
                  <h2>Analysis Pipeline</h2>
                  <p>Multi-layer security validation</p>
                </div>
              </div>

              <div className="vertical-pipeline">
                <PipelineRow
                  icon={<UploadCloud />}
                  number="01"
                  title="Ingestion Layer"
                  text={
                    validationStarted
                      ? "File received; scan in progress"
                      : scanCompleted
                        ? "File uploaded"
                        : "Awaiting an IaC file"
                  }
                  status={
                    validationStarted
                      ? "running"
                      : scanCompleted
                        ? "completed"
                        : "ready"
                  }
                />

                <div className="pipeline-connector"></div>

                <PipelineRow
                  icon={<Search />}
                  number="02"
                  title="Static Analysis"
                  text={
                    validationStarted && !scanCompleted
                      ? "Running Checkov..."
                      : scanCompleted
                        ? `${scanSummary?.failedCheckCount ?? findings.length} failed · ${scanSummary?.passedCheckCount ?? "—"} passed`
                        : "Checkov runs after upload; TFLint is not run"
                  }
                  status={
                    validationStarted && !scanCompleted
                      ? "running"
                      : scanCompleted
                        ? "completed"
                        : "ready"
                  }
                />

                <div className="pipeline-connector"></div>

                <PipelineRow
                  icon={<BrainCircuit />}
                  number="03"
                  title="LLM Reasoning"
                  text={
                    !scanCompleted
                      ? "Runs after Checkov"
                      : `COMPLETED · ${aiAssessedCount}/${aiRequestedCount} findings assessed by backend`
                  }
                  status={
                    !scanCompleted
                      ? "ready"
                      : "completed"
                  }
                />

                <div className="pipeline-connector"></div>

                <PipelineRow
                  icon={<FileCheck2 />}
                  number="04"
                  title="S3 Report Storage"
                  text={
                    !scanCompleted
                      ? "Report is created after analysis"
                      : storageStatus?.status === "saved"
                        ? `Saved to ${storageStatus.bucket || "AWS S3"}`
                        : storageStatus?.status === "failed"
                          ? storageStatus.message || "Upload failed; scan results retained"
                          : "Storage status not returned"
                  }
                  status={
                    !scanCompleted
                      ? "ready"
                      : storageStatus?.status === "saved"
                        ? "completed"
                        : storageStatus?.status === "failed"
                          ? "failed"
                          : "ready"
                  }
                />
              </div>
            </section>
          </div>
        </main>
      )}

      {/* RESULTS */}
      {page === "results" && (
        <main className="page-container">
          <div className="page-header results-header">
            <div>
              <div className="eyebrow">VALIDATION COMPLETE</div>
              <h1>Security Analysis Results</h1>
              <p>
                Analysis completed for{" "}
                <strong>{scannedFileName || "No scan completed"}</strong>
              </p>
            </div>

            <div className="result-actions">
              <button className="secondary-button">
                <Download size={17} />
                Export Report
              </button>

              <button
                className="primary-button small"
                onClick={() => navigate("dashboard")}
              >
                <RotateCcw size={17} />
                New Scan
              </button>
            </div>
          </div>

          <section className="score-overview">
            <div className="score-card">
              <div className="score-ring">
                <div>
                  <strong>{securityScore ?? "—"}</strong>
                  <span>/100</span>
                </div>
              </div>
              <div>
                <span className="score-label">Security Score</span>
                <h2>
                  {securityScore === null
                    ? "Score unavailable"
                    : securityScore >= 80
                      ? "Good security posture"
                      : securityScore >= 60
                        ? "Needs improvement"
                        : "High risk"}
                </h2>

                <p>
                  {securityScore === null
                    ? "The backend did not return a valid scan score."
                    : "Estimated from Checkov findings; unrated findings receive a fixed penalty."}
                </p>
              </div>
            </div>

            <SeverityStat
              severity="Critical"
              count={severityCounts.Critical}
              icon={<XCircle />}
            />

            <SeverityStat
              severity="High"
              count={severityCounts.High}
              icon={<AlertTriangle />}
            />

            <SeverityStat
              severity="Medium"
              count={severityCounts.Medium}
              icon={<Info />}
            />

            <SeverityStat
              severity="Low"
              count={severityCounts.Low}
              icon={<CheckCircle2 />}
            />
            <SeverityStat
              severity="Unrated"
              count={unratedFindingsCount}
              icon={<Info />}
            />
          </section>

          <div className="results-layout">
            <section className="findings-section">
              <div className="findings-heading">
                <div>
                  <div className="eyebrow">DETECTED ISSUES</div>
                  <h2>Security Findings</h2>
                </div>

                <div className="finding-count">
                  {findings.length} displayed
                </div>
              </div>

              <div className="findings-list">
                {findings.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    icon={severityIcon(finding.severity)}
                    onClick={() => setSelectedFinding(finding)}
                  />
                ))}
              </div>
            </section>

            
            
<aside className="summary-card">
  <div className="card-heading">
    <div className="card-icon">
      <Activity />
    </div>
    <div>
      <h3>Analysis Summary</h3>
      <p>Validation sources</p>
    </div>
  </div>

  <div className="summary-row">
    <span>Checkov</span>
    <strong>{findings.length} findings</strong>
  </div>

  <div className="summary-row">
    <span>TFLint</span>
    <strong>Not run</strong>
  </div>

  <div className="summary-row">
    <span>AI Analysis</span>
    <strong>{aiDisplayStatus}</strong>
  </div>

  <div className="summary-row">
    <span>AWS S3 report</span>
    <strong>
      {storageStatus?.status === "saved"
        ? "Report saved to AWS S3"
        : storageStatus?.status === "failed"
          ? "AWS S3 upload failed"
          : "Storage status unavailable"}
    </strong>
  </div>

  <div className="cloud-storage-details">
    {storageStatus?.status === "saved" ? (
      <>
        <div>
          <span>Report filename</span>
          <strong>{storageStatus.objectKey?.split("/").pop() || "Unavailable"}</strong>
        </div>
        <div>
          <span>Object key</span>
          <strong>{storageStatus.objectKey || "Unavailable"}</strong>
        </div>
        <div>
          <span>Bucket</span>
          <strong>{storageStatus.bucket || "Unavailable"}</strong>
        </div>
        <div>
          <span>Region</span>
          <strong>{storageStatus.region || "Unavailable"}</strong>
        </div>
      </>
    ) : storageStatus?.status === "failed" ? (
      <p>{storageStatus.message || "The scan completed, but the report was not saved to AWS S3."}</p>
    ) : (
      <p>
        The backend did not return S3 upload metadata for this scan. Restart the
        backend if it is running an older version; no successful upload is
        assumed.
      </p>
    )}
  </div>

  <div className="summary-divider"></div>

  <div className="summary-row total">
    <span>Total Checkov findings</span>
    <strong>{findings.length}</strong>
  </div>

  <div className="ai-note">
    <BrainCircuit size={19} />
    <div>
      <strong>
        {`AI Analysis: ${aiDisplayStatus}`}
      </strong>
      <p>{aiAssessmentExplanation}</p>
    </div>
  </div>
</aside>


          </div>

          {/* FINDING MODAL */}
          {selectedFinding && (
            <div
              className="modal-overlay"
              onClick={() => setSelectedFinding(null)}
            >
              <div
                className="finding-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="modal-close"
                  onClick={() => setSelectedFinding(null)}
                >
                  <X />
                </button>

                <div
                  className={`severity-badge ${selectedFinding.severity.toLowerCase()}`}
                >
                  {severityIcon(selectedFinding.severity)}
                  {selectedFinding.severity}
                </div>

                <h2>{selectedFinding.title}</h2>

                <div className="resource-info">
                  <FileCode2 size={17} />
                  <span>
                    {selectedFinding.file}:{selectedFinding.line}
                  </span>
                  <span>•</span>
                  <span>{selectedFinding.resource}</span>
                </div>

                <div className="modal-section">
                  <h3>Why is this dangerous?</h3>
                  <p>{selectedFinding.description}</p>
                </div>

                <div className="modal-section">
                  <h3>Recommended Fix</h3>
                  <p>{selectedFinding.recommendation}</p>
                </div>

                <div className="code-block">
                  <div className="code-header">
                    <span>Suggested Terraform Fix</span>
                    <button>Copy</button>
                  </div>
                  <pre>{selectedFinding.code}</pre>
                </div>
                  <div className="validation-tags">
                    <span>
                      <CheckCircle2 size={15} />
                      Checkov Static Analysis
                    </span>
                  </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* REPORTS */}
      {page === "reports" && (
        <main className="page-container">
          <div className="page-header reports-header">
            <div>
              <div className="eyebrow">REPORT CENTER</div>
              <h1>AWS S3 Reports</h1>
              <p>
                Report objects stored under <code>scan-reports/</code>
                {reportsBucket && reportsRegion
                  ? ` in ${reportsBucket} (${reportsRegion}).`
                  : "."}
              </p>
            </div>
            <button
              className="secondary-button refresh-reports-button"
              onClick={loadReports}
              disabled={reportsLoading}
            >
              <RefreshCw
                size={16}
                className={reportsLoading ? "spin" : ""}
              />
              {reportsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {reportsError && (
            <div className="reports-error" role="alert">
              <AlertTriangle size={18} />
              <span>{reportsError}</span>
            </div>
          )}

          <section className="reports-card">
            <div className="s3-reports-table-header">
              <span>Report</span>
              <span>Score</span>
              <span>Findings</span>
              <span>Scan timestamp</span>
              <span>AI status</span>
              <span>S3 storage</span>
              <span>Size</span>
              <span>Details</span>
            </div>

            {reportsLoading && reports.length === 0 ? (
              <div className="empty-reports" role="status">
                <RefreshCw size={17} className="spin" />
                Loading reports from AWS S3...
              </div>
            ) : reports.length > 0 ? (
              <div className="s3-reports-list">
                {reports.map((report) => (
                  <S3ReportRow
                    key={report.objectKey}
                    report={report}
                    onView={() => viewSavedReport(report)}
                  />
                ))}
              </div>
            ) : reportsError ? (
              <div className="empty-reports">
                Reports could not be loaded. Check the backend AWS access and
                refresh to try again.
              </div>
            ) : (
              <div className="empty-reports">
                No JSON reports were found in the S3 <code>scan-reports/</code>{" "}
                prefix.
              </div>
            )}
          </section>
          {reportsHasMore && (
            <button
              className="secondary-button load-more-reports-button"
              onClick={() => loadReports(true)}
              disabled={reportsLoading}
            >
              {reportsLoading ? "Loading reports..." : "Load older reports"}
            </button>
          )}

          {reportDetailsLoading && (
            <div className="reports-error" role="status">
              <RefreshCw size={17} className="spin" />
              Loading the selected S3 report...
            </div>
          )}
          {reportDetailsError && (
            <div className="reports-error" role="alert">
              <AlertTriangle size={18} />
              <span>{reportDetailsError}</span>
            </div>
          )}
          {selectedReport && (
            <div
              className="modal-overlay"
              onClick={() => setSelectedReport(null)}
            >
              <div
                className="finding-modal saved-report-modal"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="modal-close"
                  onClick={() => setSelectedReport(null)}
                  aria-label="Close saved report"
                >
                  <X />
                </button>
                <div className="eyebrow">SAVED S3 REPORT</div>
                <h2>{selectedReport.originalFilename || "Scan report"}</h2>
                <p className="saved-report-key">{selectedReport.objectKey}</p>
                <p>
                  S3 upload:{" "}
                  {selectedReport.cloudStorage?.status === "saved"
                    ? `Saved to ${selectedReport.cloudStorage.bucket || reportsBucket} (${selectedReport.cloudStorage.region || reportsRegion})`
                    : "Upload metadata unavailable"}
                </p>
                {selectedReport.cloudStorage?.objectKey && (
                  <p className="saved-report-key">
                    Stored object: {selectedReport.cloudStorage.objectKey}
                  </p>
                )}
                <div className="saved-report-metrics">
                  <DashboardMetric
                    label="Security score"
                    value={
                      Number.isFinite(selectedReport.securityScore)
                        ? `${selectedReport.securityScore}/100`
                        : "Unavailable"
                    }
                  />
                  <DashboardMetric
                    label="Checkov findings"
                    value={
                      Number.isInteger(selectedReport.findingCount)
                        ? selectedReport.findingCount
                        : "Unavailable"
                    }
                  />
                  <DashboardMetric
                    label="AI assessment"
                    value={selectedReport.aiStatus || "Unavailable"}
                  />
                </div>
                <p>
                  Scan time:{" "}
                  {selectedReport.scanTimestamp
                    ? new Date(selectedReport.scanTimestamp).toLocaleString()
                    : "Unavailable"}
                </p>
                <div className="saved-report-findings">
                  <h3>Checkov findings from this report</h3>
                  {Array.isArray(selectedReport.checkovFindings) &&
                  selectedReport.checkovFindings.length ? (
                    selectedReport.checkovFindings
                      .filter(
                        (finding) =>
                          finding && typeof finding === "object"
                      )
                      .map((finding, index) => (
                      <div
                        className="saved-report-finding"
                        key={`${finding.check_id || "finding"}-${index}`}
                      >
                        <strong>
                          {finding.check_name || finding.check_id || "Unnamed finding"}
                        </strong>
                        <span>{finding.resource || "Unknown resource"}</span>
                      </div>
                      ))
                  ) : (
                    <p>
                      {Array.isArray(selectedReport.checkovFindings)
                        ? "This report contains no failed Checkov findings."
                        : "Finding details are unavailable in this report."}
                    </p>
                  )}
                </div>
                <div className="saved-report-findings">
                  <h3>Ollama assessment</h3>
                  {selectedReport.ollamaAssessment ? (
                    <>
                      <p>Status: {selectedReport.aiStatus || "Unavailable"}</p>
                      {(Array.isArray(
                        selectedReport.ollamaAssessment.assessments
                      )
                        ? selectedReport.ollamaAssessment.assessments
                        : []
                      ).filter(
                        (assessment) =>
                          assessment && typeof assessment === "object"
                      ).map(
                        (assessment, index) => (
                          <div
                            className="saved-report-finding"
                            key={`${assessment.rule_id || "assessment"}-${index}`}
                          >
                            <strong>{assessment.rule_id || "Finding assessment"}</strong>
                            <span>{assessment.severity || "Unrated"}</span>
                            <p>{assessment.reason}</p>
                            {assessment.recommendation && (
                              <p>{assessment.recommendation}</p>
                            )}
                          </div>
                        )
                      )}
                      {(Array.isArray(selectedReport.ollamaAssessment.errors)
                        ? selectedReport.ollamaAssessment.errors
                        : []
                      ).filter(
                        (assessmentError) =>
                          assessmentError &&
                          typeof assessmentError === "object"
                      ).map(
                        (assessmentError, index) => (
                          <p key={`${assessmentError.rule_id || "assessment-error"}-${index}`}>
                            {assessmentError.rule_id || "Assessment"}: assessment unavailable
                          </p>
                        )
                      )}
                    </>
                  ) : (
                    <p>AI assessment details are unavailable in this report.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      <footer className="footer">
        <div>
          <strong>IntelliValidate</strong>
          <span>Intelligent IaC Security for Smart Manufacturing</span>
        </div>
        <span>Echo Vision • Cloud Architecture Design</span>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, text }) {
  return (
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      <ArrowRight size={17} className="feature-arrow" />
    </div>
  );
}

function ArchitectureStep({ number, icon, title, text }) {
  return (
    <div className="architecture-step">
      <span className="step-number">{number}</span>
      <div className="architecture-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function PipelineRow({ icon, number, title, text, status = "ready" }) {
  const stateIcon =
    status === "completed" ? (
      <CheckCircle2 size={18} className="pipeline-check" />
    ) : status === "running" ? (
      <Activity size={18} className="pipeline-running spin" />
    ) : status === "failed" || status === "partial" ? (
      <AlertTriangle size={18} className="pipeline-warning" />
    ) : (
      <Info size={18} className="pipeline-ready" />
    );

  return (
    <div className={`pipeline-row pipeline-${status}`}>
      <div className="pipeline-number">{number}</div>
      <div className="pipeline-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      {stateIcon}
    </div>
  );
}

function DashboardMetric({ label, value }) {
  return (
    <div className="dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SeverityStat({ severity, count, icon }) {
  return (
    <div className={`severity-stat ${severity.toLowerCase()}`}>
      <div className="severity-stat-icon">{icon}</div>
      <div>
        <strong>{count}</strong>
        <span>{severity}</span>
      </div>
    </div>
  );
}

function FindingCard({ finding, icon, onClick }) {
  return (
    <button className="finding-card" onClick={onClick}>
      <div className={`finding-severity ${finding.severity.toLowerCase()}`}>
        {icon}
      </div>

      <div className="finding-main">
        <div className="finding-top">
          <span
            className={`severity-text ${finding.severity.toLowerCase()}`}
          >
            {finding.severity}
          </span>

          <span className="finding-source">{finding.source}</span>
          <span className="finding-source">
            {finding.severitySource === "Ollama"
              ? "Severity via Ollama"
              : finding.severitySource === "Checkov"
                ? "Severity via Checkov"
                : "No valid severity"}
          </span>
        </div>

        <h3>{finding.title}</h3>

        <p>
          {finding.file}:{finding.line} • {finding.resource}
        </p>
      </div>

      <ChevronRight className="finding-arrow" />
    </button>
  );
}

function S3ReportRow({ report, onView }) {
  const modifiedDate = report.scanTimestamp || report.lastModified
    ? new Date(report.scanTimestamp || report.lastModified)
    : null;
  const modifiedLabel =
    modifiedDate && !Number.isNaN(modifiedDate.getTime())
      ? modifiedDate.toLocaleString()
      : "Unavailable";
  const sizeLabel =
    Number.isFinite(report.size) && report.size >= 0
      ? report.size < 1024 * 1024
        ? `${(report.size / 1024).toFixed(1)} KB`
        : `${(report.size / (1024 * 1024)).toFixed(2)} MB`
      : "Unavailable";

  return (
    <div className="s3-report-row">
      <div className="s3-report-name">
        <FileCheck2 size={18} />
        <div>
          <strong>{report.originalFilename || report.filename || "Unnamed report"}</strong>
          <span>{report.objectKey}</span>
        </div>
      </div>
      <span>
        {Number.isFinite(report.securityScore)
          ? `${report.securityScore}/100`
          : "Unavailable"}
      </span>
      <span>
        {Number.isInteger(report.findingCount)
          ? report.findingCount
          : "Unavailable"}
      </span>
      <span>{modifiedLabel}</span>
      <span className="report-ai-status completed">
        <CheckCircle2 size={14} aria-hidden="true" />
        Completed
      </span>
      <span>
        {report.cloudStorage?.status === "saved"
          ? `Saved to ${report.cloudStorage.bucket || "S3"}`
          : report.cloudStorage?.status === "failed"
            ? "Upload failed"
            : "Unavailable"}
      </span>
      <span>{sizeLabel}</span>
      <button className="secondary-button report-view-button" onClick={onView}>
        View Report
      </button>
    </div>
  );
}

export default App;