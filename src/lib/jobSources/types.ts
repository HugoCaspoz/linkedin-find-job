export type WorkMode = "remote" | "hybrid" | "onsite";

/** Per-source network timeout, so one slow host can't eat the whole
 * function's time budget. */
export const FETCH_TIMEOUT_MS = 8000;

export interface NormalizedJob {
  source: string;
  externalId: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  description?: string;
  postedAt?: string;
  workMode?: WorkMode;
}
