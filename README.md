# IntelliValidate

### Intelligent Infrastructure-as-Code Validation Framework for Smart Manufacturing Using Large Language Models

IntelliValidate is a cloud-integrated Infrastructure-as-Code (IaC) security validation framework that identifies security misconfigurations in Terraform files. It combines automated security scanning, AI-assisted analysis, security scoring, and Amazon S3 report storage in one application.

## Key Features

- **Terraform Validation:** Upload Terraform files for security analysis.
- **Automated Security Scanning:** Use Checkov to identify infrastructure security misconfigurations.
- **AI-Powered Analysis:** Use Ollama with the `qwen2.5:3b` model to explain findings and suggest remediation steps.
- **Security Scoring:** Calculate a security score based on failed Checkov findings and their severity.
- **Reports History:** Browse previous scan reports and view individual report details.
- **AWS Cloud Storage:** Store JSON scan reports in a private Amazon S3 bucket.
- **Secure Design:** Keep Terraform source files out of S3 report storage and use backend endpoints to access saved reports.

## Architecture

```text
                User
                 |
                 v
         React + Vite Frontend
                 |
              API Request
                 |
                 v
         Node.js + Express
                 |
          +------+------+
          |             |
          v             v
        Checkov       Ollama
     Security Scan   AI Analysis
          |             |
          +------+------+
                 |
                 v
          Security Scoring
                 |
                 v
           JSON Report
                 |
                 v
           Amazon S3
                 |
                 v
          Reports History
```

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React, Vite | User interface and dashboard |
| Backend | Node.js, Express | API endpoints and scan workflow |
| Security Scanner | Checkov | Terraform security validation |
| AI Analysis | Ollama, `qwen2.5:3b` | Explanations and remediation suggestions |
| Cloud Storage | Amazon S3 | Persistent JSON report storage |
| Infrastructure | Terraform | Infrastructure configuration files |
| Testing | Node.js test runner | Backend workflow and regression tests |

## How It Works

1. The user uploads a Terraform file through the web interface.
2. The Express backend receives the file and runs Checkov.
3. Checkov identifies failed security checks and returns findings.
4. Ollama analyzes findings and provides explanations and recommendations.
5. The backend calculates a security score.
6. The scan report is saved as a JSON object in Amazon S3.
7. The frontend displays scan results, findings, and the security score.
8. Users can browse report history and retrieve saved reports.

## Security Scoring

The score starts at **100** and subtracts a fixed penalty for each failed Checkov finding.

| Severity | Penalty |
|---|---:|
| Critical | 10 |
| High | 4 |
| Medium | 3 |
| Low | 1 |
| Unrated | 2 |

The score is clamped at zero. Each failed Checkov finding is counted once. Missing or unrecognized Checkov severity is treated as Unrated rather than inferred from the AI assessment. AI assessment coverage and AI-suggested severity do not affect the score.

## AWS S3 Integration

Scan reports are stored in a private Amazon S3 bucket.

- **Bucket:** `intellvalidate-reports-project`
- **Region:** `us-east-1`
- **Storage prefix:** `scan-reports/`
- **Format:** JSON
- **Server-side encryption:** AES-256

The backend uses the AWS SDK default credential provider chain. Reports can be listed and retrieved through backend endpoints restricted to the report prefix.

Keep S3 Block Public Access enabled. Never commit AWS credentials, secret keys, or `.env` files to GitHub.

## Prerequisites

Install the following before running the project:

- Node.js 20 or newer
- npm
- Python and Checkov
- Ollama with the `qwen2.5:3b` model
- AWS CLI or another supported AWS credential provider
- An AWS identity with the required S3 permissions

## Run Locally

### 1. Install backend dependencies

```bash
cd backend
npm install
```

If `backend/.env.example` exists, copy it to `backend/.env` and configure the required settings. Do not commit `.env` files.

### 2. Start the backend

From the `backend` directory:

```bash
node server.js
```

### 3. Start Ollama

Ensure Ollama is running and the model is available:

```bash
ollama pull qwen2.5:3b
```

### 4. Start the frontend

Open another terminal in the project root:

```bash
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

Checkov and Ollama must be available locally for their respective processing steps.

## Verify S3 Report Storage

After running a scan, confirm that the application reports a successful S3 upload. You can inspect a report's metadata using:

```bash
aws s3api head-object \
  --bucket intellvalidate-reports-project \
  --key "scan-reports/YOUR-REPORT.json" \
  --region us-east-1
```

Replace `YOUR-REPORT.json` with the actual report filename.

## Testing

During development:

- All 24 backend tests passed.
- All five backend source files passed Node.js syntax checks.
- S3 report listing, pagination, and saved-report retrieval tests passed.
- A live AWS S3 report upload and retrieval was separately verified.

These results reflect the tested development version; results may vary if local services, credentials, or configuration change.

## Project Structure

```text
IntelliValidate/
├── backend/          # Express API and scan workflow
├── public/            # Static assets
├── shared/            # Shared application modules
├── src/               # React frontend
├── test-infrastructure-2.tf
├── package.json
├── package-lock.json
├── vite.config.js
├── .gitignore
└── README.md
```

## Future Enhancements

- Improve AI assessment coverage and handling of incomplete model responses.
- Add report filtering and export features.
- Expand infrastructure security policy coverage.
- Explore cloud hosting for application components if required.

## Project Objective

IntelliValidate demonstrates how Infrastructure-as-Code security scanning, Large Language Model-assisted analysis, automated security scoring, and private cloud report storage can be integrated into a unified validation workflow for smart manufacturing infrastructure.

**Project Title:** Intelligent Infrastructure-as-Code Validation Framework for Smart Manufacturing Using Large Language Models.
