function isCloudStorageResult(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    (value.status === "saved" || value.status === "failed")
  );
}

export function getCloudStorageResult(responseData) {
  const candidates = [
    responseData?.cloudStorage,
    responseData?.storage,
    responseData?.scan?.cloudStorage,
  ];

  return candidates.find(isCloudStorageResult) || null;
}
