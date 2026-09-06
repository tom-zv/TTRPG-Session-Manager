// Issues are the shared validators' (`path` and `message`); the kit only requires that much of them.
type Issue = { path: string; message: string };

/** A write issue placed on the sheet: the editor that fixes it (null when none does) and a readable place. */
export type PlacedIssue<I extends Issue = Issue> = I & { targetId: string | null; place: string };

/** How a record type maps validator paths onto its sheet. */
export type IssuePlacement<Draft> = {
  /** The id of the editor that fixes the path, or null when none does. */
  issueTargetId: (path: string) => string | null;
  /** Where the path is, in words the sheet uses ("Armor Class", "Actions: Bite"). */
  describePath: (path: string, draft: Draft) => string;
};

export const placeIssues = <Draft, I extends Issue>(
  issues: readonly I[],
  draft: Draft,
  { issueTargetId, describePath }: IssuePlacement<Draft>,
): PlacedIssue<I>[] =>
  issues.map(issue => ({ ...issue, targetId: issueTargetId(issue.path), place: describePath(issue.path, draft) }));
