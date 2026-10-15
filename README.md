# IntelliValidate

## IntelliValidate scan reports

The Express backend writes successful Checkov scan reports to the private
`intellvalidate-reports-project` S3 bucket in `us-east-1`. Reports are stored as
JSON objects under `scan-reports/` with AES-256 server-side encryption. IaC
source files are not uploaded.

The backend uses the AWS SDK default credential provider chain. Configure AWS
credentials through an AWS CLI profile or another supported provider; never put
access keys in the frontend or commit them to the repository. To configure the
backend, copy `backend/.env.example` to `backend/.env` and adjust the region,
bucket, or optional `AWS_PROFILE` as needed.

The runtime identity needs report-write access and read-only permission to list
objects under the report prefix for the Reports page. Keep S3 Block Public
Access enabled and do not grant public access.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::intellvalidate-reports-project/scan-reports/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::intellvalidate-reports-project/scan-reports/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::intellvalidate-reports-project",
      "Condition": {
        "StringEquals": {
          "s3:prefix": "scan-reports/"
        }
      }
    }
  ]
}
```

The Reports page calls the backend's read-only `GET /api/reports` endpoint.
The backend reads each listed JSON report to display its own saved filename,
score, finding count, and AI status. `GET /api/reports/:reportId` reads details
for one listed report; it returns only reports under the fixed
`scan-reports/` prefix and does not expose arbitrary S3 object access.
The list is sorted by S3 modification time and returned in 50-report pages;
use **Load older reports** to continue through the complete history. Page
cursors are temporary, so refresh the list if a cursor expires.

### Security score

The score starts at 100 and subtracts a fixed penalty for each failed
Checkov finding: Critical 10, High 4, Medium 3, Low 1, and Unrated 2
points. It is clamped at 0. Missing or unrecognized Checkov severity counts
as Unrated and is never inferred from Ollama. Ollama assessment coverage and
its suggested severity do not affect the score. Severity counts include each
failed Checkov finding exactly once, including Unrated findings.

### Run locally

In one terminal, start the backend:

```sh
cd backend
npm install
node server.js
```

In another terminal, start the frontend from the project root:

```sh
npm install
npm run dev
```

Checkov and Ollama (`qwen2.5:3b`) must also be installed and available locally
for their respective scan and assessment steps. The backend dependencies
require Node.js 20 or newer.

### Verify an uploaded report

1. Configure the AWS CLI profile used by the backend and ensure it has the
   `s3:PutObject` permission above.
2. Start the backend and frontend, then upload a supported IaC file and run a
   validation.
3. In the Results page, confirm that **AWS S3 report** shows **Saved**.
4. Confirm the API response contains `cloudStorage.status: "saved"` and note
   its `cloudStorage.objectKey`.
5. Inspect that object in the `us-east-1` bucket with the AWS CLI:

   ```sh
   aws s3api get-object --bucket intellvalidate-reports-project --key <objectKey> scan-report.json --region us-east-1
   ```

   The JSON includes the original filename, scan timestamp, Checkov findings,
   security score, and Ollama assessment.

## Frontend scaffold

This frontend uses React, Vite, and Oxlint.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
