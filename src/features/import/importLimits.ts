/** Approved import limits (`docs/PROJECT_REQUIREMENTS.md` §10.1). */
export const IMPORT_LIMITS = {
  maxFileBytes: 1_048_576,
  maxDataRows: 100,
  maxColumns: 50,
  maxCellCharacters: 100,
  parseTimeoutMs: 10_000,
  zip: {
    maxEntries: 200,
    maxEntryUncompressedBytes: 10 * 1_048_576,
    maxTotalUncompressedBytes: 20 * 1_048_576,
    maxCompressionRatio: 200,
    /** Entries at or below this uncompressed size are exempt from the ratio check. */
    ratioCheckMinBytes: 64 * 1024,
    maxWorksheets: 50,
  },
} as const;
