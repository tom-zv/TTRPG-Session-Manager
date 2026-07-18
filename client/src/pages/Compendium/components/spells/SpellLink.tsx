import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FiX } from "react-icons/fi";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import { Popover } from "src/components/Popover/Popover.js";
import { spellDetailQuery, useSpell } from "../../api/query/useSpellQueries.js";
import { useSpellResolver } from "../../hooks/useSpellResolver.js";
import type { SpellTokenRenderer } from "../RichText/RichText.js";
import { SpellCard } from "./SpellCard.js";
import styles from "./SpellLink.module.css";

const OPEN_DELAY = 250;
const CLOSE_DELAY = 150;

type SpellLinkProps = {
  name: string;
  source?: string;
  /** How the creature casts it, e.g. "level 5 version". */
  note?: string;
  /** Text to show; defaults to the name. */
  children?: React.ReactNode;
};

/**
 * A spell mention with a preview. Hover (after a short delay) or keyboard focus shows it; click,
 * Enter or a tap pins it until Escape, a click outside or its close button. A name that matches
 * no imported spell renders as plain text.
 */
export const SpellLink: React.FC<SpellLinkProps> = ({ name, source, note, children }) => {
  const { resolve } = useSpellResolver();
  const summary = resolve({ name, source });
  const label = children ?? name;
  if (!summary) return <>{label}</>;
  return <SpellLinkTrigger summary={summary} note={note}>{label}</SpellLinkTrigger>;
};

/** For RichText: renders {@spell} mentions as SpellLinks. */
export const renderSpellLink: SpellTokenRenderer = (token, key) => (
  <SpellLink key={key} name={token.name} source={token.source}>
    {token.display ?? token.name}
  </SpellLink>
);

// Only one preview is open at a time: opening one closes the previous.
let closeActivePreview: (() => void) | null = null;

type Mode = "closed" | "peek" | "pinned";

const SpellLinkTrigger: React.FC<{ summary: SpellSummary; note?: string; children: React.ReactNode }> = ({
  summary,
  note,
  children,
}) => {
  const queryClient = useQueryClient();
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const focusOnPin = useRef(false);
  const [mode, setMode] = useState<Mode>("closed");

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };

  const close = useCallback(() => {
    clearTimers();
    setMode("closed");
  }, []);

  useEffect(() => {
    if (mode === "closed") {
      if (closeActivePreview === close) closeActivePreview = null;
      return;
    }
    if (closeActivePreview && closeActivePreview !== close) closeActivePreview();
    closeActivePreview = close;
  }, [mode, close]);

  useEffect(() => () => {
    clearTimers();
    if (closeActivePreview === close) closeActivePreview = null;
  }, [close]);

  useEffect(() => {
    if (mode === "pinned" && focusOnPin.current) {
      focusOnPin.current = false;
      closeButtonRef.current?.focus();
    }
  }, [mode]);

  const prefetch = () => void queryClient.prefetchQuery(spellDetailQuery(summary.id));

  const scheduleClose = () => {
    window.clearTimeout(openTimer.current);
    if (mode !== "peek") return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(close, CLOSE_DELAY);
  };

  const cancelClose = () => window.clearTimeout(closeTimer.current);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={mode !== "closed"}
        aria-controls={mode !== "closed" ? popoverId : undefined}
        aria-haspopup="dialog"
        onPointerEnter={event => {
          if (event.pointerType !== "mouse") return;
          prefetch();
          cancelClose();
          if (mode === "closed") openTimer.current = window.setTimeout(() => setMode("peek"), OPEN_DELAY);
        }}
        onPointerLeave={event => {
          if (event.pointerType === "mouse") scheduleClose();
        }}
        onFocus={event => {
          prefetch();
          if (mode === "closed" && event.currentTarget.matches(":focus-visible")) setMode("peek");
        }}
        onBlur={event => {
          const next = event.relatedTarget;
          const intoPopover = next instanceof Node && document.getElementById(popoverId)?.contains(next);
          if (mode === "peek" && !intoPopover) close();
        }}
        onClick={event => {
          clearTimers();
          if (mode === "pinned") {
            close();
            return;
          }
          focusOnPin.current = event.detail === 0; // keyboard activation
          setMode("pinned");
        }}
      >
        {children}
      </button>
      {mode !== "closed" && (
        <Popover
          id={popoverId}
          label={summary.name}
          anchorRef={triggerRef}
          onClose={close}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        >
          <SpellPreview
            summary={summary}
            note={note}
            pinned={mode === "pinned"}
            closeButtonRef={closeButtonRef}
            onClose={() => {
              close();
              triggerRef.current?.focus();
            }}
            onNavigate={close}
          />
        </Popover>
      )}
    </>
  );
};

const plainSpellText: SpellTokenRenderer = (token, key) => (
  <React.Fragment key={key}>{token.display ?? token.name}</React.Fragment>
);

type SpellPreviewProps = {
  summary: SpellSummary;
  note?: string;
  pinned: boolean;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onNavigate: () => void;
};

const SpellPreview: React.FC<SpellPreviewProps> = ({ summary, note, pinned, closeButtonRef, onClose, onNavigate }) => {
  const { data: spell, error } = useSpell(summary.id);

  return (
    <div className={`${styles.preview} ${pinned ? styles.pinned : ""}`}>
      {pinned && (
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          aria-label="Close spell preview"
          onClick={onClose}
        >
          <FiX aria-hidden="true" />
        </button>
      )}
      <SpellCard
        summary={summary}
        spell={spell}
        error={error?.message}
        variant="compact"
        renderSpell={plainSpellText}
        footer={
          <div className={styles.footer}>
            {note && <p className={styles.note}>Cast as: {note}</p>}
            <Link to={`/compendium?spell=${summary.id}`} className={styles.compendiumLink} onClick={onNavigate}>
              Open in Compendium
            </Link>
          </div>
        }
      />
    </div>
  );
};
