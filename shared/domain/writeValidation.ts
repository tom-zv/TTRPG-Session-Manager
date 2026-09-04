export interface WriteIssue {
  /** Dot-separated input path, or an empty string for the whole payload. */
  path: string;
  message: string;
}

export type WriteValidation<T> = { ok: true; value: T } | { ok: false; issues: WriteIssue[] };
