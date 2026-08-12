import React from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import { spellDetailQuery, useSpell } from "../../api/query/useSpellQueries.js";
import { useSpellResolver } from "../../hooks/useSpellResolver.js";
import { ReferencePreview, useClosePreview } from "../RichText/ReferencePreview.js";
import type { SpellTokenRenderer } from "../RichText/RichText.js";
import { SpellCard } from "./SpellCard.js";
import styles from "../RichText/ReferencePreview.module.css";

type SpellLinkProps = {
  name: string;
  source?: string;
  /** How the creature casts it, e.g. "level 5 version". */
  note?: string;
  /** Text to show; defaults to the name. */
  children?: React.ReactNode;
};

/**
 * A spell mention with a preview (see ReferencePreview). A name that matches no imported spell
 * renders as plain text.
 */
export const SpellLink: React.FC<SpellLinkProps> = ({ name, source, note, children }) => {
  const { resolve } = useSpellResolver();
  const queryClient = useQueryClient();
  const summary = resolve({ name, source });
  const label = children ?? name;
  if (!summary) return <>{label}</>;
  return (
    <ReferencePreview
      label={summary.name}
      closeLabel="Close spell preview"
      prefetch={() => void queryClient.prefetchQuery(spellDetailQuery(summary.id))}
      preview={<SpellPreview summary={summary} note={note} />}
    >
      {label}
    </ReferencePreview>
  );
};

/** For RichText: renders {@spell} mentions as SpellLinks. */
export const renderSpellLink: SpellTokenRenderer = (token, key) => (
  <SpellLink key={key} name={token.name} source={token.source}>
    {token.display ?? token.name}
  </SpellLink>
);

const plainSpellText: SpellTokenRenderer = (token, key) => (
  <React.Fragment key={key}>{token.display ?? token.name}</React.Fragment>
);

type SpellPreviewProps = {
  summary: SpellSummary;
  note?: string;
};

const SpellPreview: React.FC<SpellPreviewProps> = ({ summary, note }) => {
  const { data: spell, error, refetch, isFetching } = useSpell(summary.id);
  const onNavigate = useClosePreview();

  return (
    <SpellCard
      summary={summary}
      spell={spell}
      error={error?.message}
      variant="compact"
      renderSpell={plainSpellText}
      footer={
        <div className={styles.footer}>
          {error && <button type="button" disabled={isFetching} onClick={() => void refetch()}>Retry spell</button>}
          {note && <p className={styles.note}>Cast as: {note}</p>}
          <Link to={`/compendium?spell=${summary.id}`} className={styles.compendiumLink} onClick={onNavigate}>
            Open in Compendium
          </Link>
        </div>
      }
    />
  );
};
