import styles from "./FormControls.module.css";
import { joinClassNames } from "./utils.js";

export type SegmentedTabOption<Value extends string> = {
  value: Value;
  label: string;
  count?: number;
  panelId: string;
};

type SegmentedTabsProps<Value extends string> = {
  label: string;
  value: Value;
  options: Array<SegmentedTabOption<Value>>;
  onChange: (value: Value) => void;
};

export const SegmentedTabs = <Value extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedTabsProps<Value>) => (
  <div className={styles.segmentedTabs} role="tablist" aria-label={label}>
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          className={joinClassNames(styles.segmentedTab, isActive && styles.segmentedTabActive)}
          onClick={() => onChange(option.value)}
          role="tab"
          aria-selected={isActive}
          aria-controls={option.panelId}
        >
          {option.label}
          {Boolean(option.count) && <span>{option.count}</span>}
        </button>
      );
    })}
  </div>
);
