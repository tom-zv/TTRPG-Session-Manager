import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemRef, ItemSummary } from "shared/domain/dnd5e/item.js";
import { parseInlineTags } from "shared/domain/dnd5e/richText.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import { itemPreviewQuery, itemRefKey, useItemReferences } from "../../api/query/useItemQueries.js";
import { compendiumLinkSearch } from "../../hooks/useCompendiumUrl.js";
import { ReferencePreview, useClosePreview } from "../RichText/ReferencePreview.js";
import { RichText, type ItemTokenRenderer } from "../RichText/RichText.js";
import { formatAttunement, formatItemType } from "./itemFormat.js";
import previewStyles from "../RichText/ReferencePreview.module.css";
import styles from "./ItemLink.module.css";

const COMPENDIUM_PATH = "/compendium";

/** The signed-in viewer, as item queries scope it; null while signed out. */
function useItemViewer(): ItemViewer | null {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const isGm = currentUser?.isGm;
  return useMemo(() => (userId === undefined ? null : { userId, isGm: isGm ?? false }), [userId, isGm]);
}

/**
 * Which visit of its tab a document is shown in. The Compendium counts a player's returns to each
 * tab, so item links and previews read again on a return instead of showing an answer from before
 * (an item the GM hid meanwhile). Elsewhere, and for a GM, it stays 0.
 */
export const ItemReferenceVisit = createContext(0);

const plainItemText: ItemTokenRenderer = (token, key) => (
  <React.Fragment key={key}>{token.display ?? token.name}</React.Fragment>
);

/**
 * For RichText: renders the {@item} mentions in one document (all the texts of a card or sheet)
 * as item links with a preview. The document's references are resolved together, in bounded
 * batches, for the signed-in viewer. A mention that resolves to nothing this viewer may see
 * (hidden, missing, ambiguous, not yet answered, or signed out) shows its authored text.
 * Disabled (inside a preview, so previews never nest), every mention is plain text.
 */
export function useItemLinks(texts: ReadonlyArray<string | undefined>, options: { enabled?: boolean } = {}): ItemTokenRenderer {
  const enabled = options.enabled ?? true;
  const viewer = useItemViewer();
  const visit = useContext(ItemReferenceVisit);
  const document = enabled ? texts.filter(Boolean).join("\n\n") : "";
  const refs = useMemo<ItemRef[]>(
    () => parseInlineTags(document).flatMap(token => (token.type === "item" ? [{ name: token.name, source: token.source }] : [])),
    [document]
  );
  const resolved = useItemReferences(viewer, visit, refs);

  return useCallback<ItemTokenRenderer>((token, key) => {
    const summary = resolved.get(itemRefKey(token));
    if (!summary || !viewer) return plainItemText(token, key);
    return <ItemLink key={key} viewer={viewer} visit={visit} summary={summary}>{token.display ?? token.name}</ItemLink>;
  }, [resolved, viewer, visit]);
}

type ItemLinkProps = {
  viewer: ItemViewer;
  visit: number;
  summary: ItemSummary;
  children: React.ReactNode;
};

/** An item mention with a preview (see ReferencePreview). */
const ItemLink: React.FC<ItemLinkProps> = ({ viewer, visit, summary, children }) => {
  const queryClient = useQueryClient();
  return (
    <ReferencePreview
      label={summary.name}
      closeLabel="Close item preview"
      prefetch={() => void queryClient.prefetchQuery(itemPreviewQuery(viewer, visit, summary.id))}
      preview={<ItemPreview viewer={viewer} visit={visit} summary={summary} />}
    >
      {children}
    </ReferencePreview>
  );
};

type ItemPreviewProps = {
  viewer: ItemViewer;
  visit: number;
  summary: ItemSummary;
};

const ItemPreview: React.FC<ItemPreviewProps> = ({ viewer, visit, summary }) => {
  const { data: item, error, refetch, isFetching, isPending } = useQuery(itemPreviewQuery(viewer, visit, summary.id));
  const onNavigate = useClosePreview();
  const location = useLocation();
  // On the Compendium a link keeps the page's other parameters, as inventory links do.
  const params = new URLSearchParams(location.pathname === COMPENDIUM_PATH ? location.search : "");
  const headingId = `item-preview-${summary.id}`;
  const shown = item ?? summary;
  const attunement = formatAttunement(shown);
  const hidden = shown.gm && (shown.gm.hidden || shown.gm.hiddenByFamily);

  return (
    <article className={styles.preview} aria-labelledby={headingId}>
      <header>
        <h3 id={headingId} className={styles.name}>{shown.name}</h3>
        <p className={styles.subtitle}>
          {formatItemType(shown)}
          {attunement && ` (${attunement.charAt(0).toLowerCase()}${attunement.slice(1)})`}
        </p>
        <p className={styles.source}>{shown.source}</p>
        {hidden && <p className={styles.hidden}>Hidden from players.</p>}
      </header>
      {isPending && <p className={styles.status}>Loading…</p>}
      {item === null && <p className={styles.status}>That item is not available.</p>}
      {error && <p className={styles.status} role="alert">{error.message}</p>}
      {item?.details.description && (
        <RichText text={item.details.description} renderItem={plainItemText} className={styles.description} />
      )}
      <div className={previewStyles.footer}>
        {error && <button type="button" disabled={isFetching} onClick={() => void refetch()}>Retry item</button>}
        <Link
          to={{ pathname: COMPENDIUM_PATH, search: compendiumLinkSearch(params, "items", summary.id) }}
          className={previewStyles.compendiumLink}
          onClick={onNavigate}
        >
          Open in Compendium
        </Link>
      </div>
    </article>
  );
};
