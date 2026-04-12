import React, { useState, useRef, useEffect } from "react";
import "./InlineEditableNumber.css";

interface InlineEditableNumberProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
}

/**
 * A component that displays a number which can be edited by double-clicking.
 * Optimized for quick in-place editing of numeric values.
 */
export const InlineEditableNumber: React.FC<InlineEditableNumberProps> = ({
  value,
  onChange,
  min,
  max,
  placeholder,
  className = "",
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setTempValue(String(value));
    }
  }, [value, isEditing]);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setTempValue(String(value));
  };

  const handleBlur = () => {
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitValue();
    } else if (e.key === "Escape") {
      setTempValue(String(value));
      setIsEditing(false);
    }
  };

  const commitValue = () => {
    const numValue = parseInt(tempValue, 10);
    if (!isNaN(numValue)) {
      let finalValue = numValue;
      if (min !== undefined) finalValue = Math.max(min, finalValue);
      if (max !== undefined) finalValue = Math.min(max, finalValue);
      onChange(finalValue);
    }
    setIsEditing(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempValue(e.target.value);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={tempValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        className={`inline-editable-number-input ${className}`}
      />
    );
  }

  return (
    <span
      className={`inline-editable-number-display ${className}`}
      onDoubleClick={handleDoubleClick}
      title="Double-click to edit"
    >
      {value ?? placeholder ?? "—"}
    </span>
  );
};

export default InlineEditableNumber;
