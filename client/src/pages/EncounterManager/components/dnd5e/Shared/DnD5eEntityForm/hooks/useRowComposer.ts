import type React from "react";
import { useEffect, useRef, useState } from "react";

export const useRowComposer = <FirstElement extends HTMLElement, Draft>(
  createInitialDraft: () => Draft
) => {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const firstInputRef = useRef<FirstElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => createInitialDraft());
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (isComposing) firstInputRef.current?.focus();
  }, [isComposing]);

  const refocusAddButton = () => {
    window.requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const openComposer = () => {
    setIsComposing(true);
    setDraftError(null);
  };

  const closeComposer = () => {
    setDraft(createInitialDraft());
    setDraftError(null);
    setIsComposing(false);
    refocusAddButton();
  };

  const completeComposer = () => {
    setDraft(createInitialDraft());
    setDraftError(null);
    setIsComposing(false);
    refocusAddButton();
  };

  const handleComposerKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    commitComposer: () => void
  ) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter") {
      if (target.tagName !== "INPUT") return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      commitComposer();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      closeComposer();
    }
  };

  return {
    addButtonRef,
    firstInputRef,
    isComposing,
    draft,
    setDraft,
    draftError,
    setDraftError,
    openComposer,
    cancelComposer: closeComposer,
    completeComposer,
    handleComposerKeyDown,
    refocusAddButton,
  };
};
