// Issues are the shared validators' (`path` and `message`); the kit only requires that much of them.
type Issue = { path: string; message: string };

/** A write issue placed on the sheet: its editor, the field to focus and a readable place. */
export type PlacedIssue<I extends Issue = Issue> = I & {
  targetId: string | null;
  focusId: string | null;
  place: string;
};

/** How a record type maps validator paths onto its sheet. */
export type IssuePlacement<Draft> = {
  /** The id of the editor that fixes the path, or null when none does. */
  issueTargetId: (path: string) => string | null;
  /** The exact field to focus after opening a grouped editor; defaults to the editor id. */
  issueFocusId?: (path: string) => string | null;
  /** Where the path is, in words the sheet uses ("Armor Class", "Actions: Bite"). */
  describePath: (path: string, draft: Draft) => string;
};

export const placeIssues = <Draft, I extends Issue>(
  issues: readonly I[],
  draft: Draft,
  { issueTargetId, issueFocusId, describePath }: IssuePlacement<Draft>,
): PlacedIssue<I>[] =>
  issues.map(issue => {
    const targetId = issueTargetId(issue.path);
    return {
      ...issue,
      targetId,
      focusId: issueFocusId ? issueFocusId(issue.path) : targetId,
      place: describePath(issue.path, draft),
    };
  });

/** The editor and field for the first jumpable issue. */
export type IssueJump = { targetId: string; focusId: string | null };

export const firstIssueJump = (issues: readonly PlacedIssue[]): IssueJump | null => {
  const issue = issues.find(candidate => candidate.targetId !== null);
  return issue?.targetId ? { targetId: issue.targetId, focusId: issue.focusId } : null;
};
