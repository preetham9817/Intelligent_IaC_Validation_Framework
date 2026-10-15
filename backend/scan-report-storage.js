const crypto = require("crypto");
const { PutObjectCommand } = require("@aws-sdk/client-s3");

async function uploadScanReport({
  s3Client,
  bucket,
  region,
  report,
  logger = console,
  createId = crypto.randomUUID,
}) {
  const scanId = createId();
  const objectKey = `scan-reports/${scanId}.json`;
  const persistedReport = {
    ...report,
    scanId,
    cloudStorage: {
      status: "saved",
      bucket,
      region,
      objectKey,
    },
  };

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: JSON.stringify(persistedReport),
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      })
    );

    logger.log(`S3 report uploaded successfully: s3://${bucket}/${objectKey}`);

    return {
      status: "saved",
      scanId,
      bucket,
      region,
      objectKey,
    };
  } catch (error) {
    const errorCode =
      error?.Code || error?.code || error?.name || "UnknownError";
    const errorMessage =
      error?.message || "AWS returned an error without a message.";
    logger.error(`S3 report upload failed (${errorCode}): ${errorMessage}`);

    return {
      status: "failed",
      scanId,
      bucket,
      region,
      message:
        errorCode === "AccessDenied" || errorCode === "Forbidden"
          ? "AWS denied the report upload. Confirm the backend identity has s3:PutObject permission for the scan-reports/ prefix."
          : errorCode === "CredentialsProviderError" ||
              errorCode === "InvalidAccessKeyId"
            ? "AWS credentials could not be used for the report upload. Check the backend's configured credential provider."
            : `The scan completed, but its report could not be saved to AWS S3 (${errorCode}). Check backend AWS connectivity and configuration.`,
    };
  }
}

module.exports = { uploadScanReport };
