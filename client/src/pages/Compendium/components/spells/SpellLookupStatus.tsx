import { useSpellResolver } from "../../hooks/useSpellResolver.js";

/** Observe the shared lookup without loading it for cards that have no spell links. */
export function SpellLookupStatus() {
  const { error, retry, isFetching } = useSpellResolver({ enabled: false });
  if (!error) return null;
  return (
    <p role="alert">
      Spell previews unavailable: {error.message}{" "}
      <button type="button" disabled={isFetching} onClick={() => void retry()}>Retry spell lookup</button>
    </p>
  );
}
