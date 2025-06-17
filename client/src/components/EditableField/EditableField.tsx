import React, { useState, useRef, useEffect } from "react";
import "./EditableField.css";

interface EditableFieldProps {
  label: string;
  name: string;
  value: string | number;
  type?: string;
  multiline?: boolean;
  rows?: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const EditableField: React.FC<EditableFieldProps> = ({
  label,
  name,
  value,
  type = "text",
  multiline = false,
  rows = 3,
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      setIsEditing(false);
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  return (
    <div className="editable-field">
      <div className="editable-field-label">{label}</div>
      <div className="editable-field-content">
        {isEditing ? (
          multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              name={name}
              value={value}
              onChange={onChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              rows={rows}
              className="editable-field-input"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type}
              name={name}
              value={value}
              onChange={onChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="editable-field-input"
            />
          )
        ) : (
          <div 
            className="editable-field-display" 
            role="button"
            tabIndex={0}
            onClick={() => setIsEditing(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setIsEditing(true);
              }
            }}
          >
            <span className="editable-field-text">
              {value || <span className="editable-field-placeholder">Click to edit {label.toLowerCase()}</span>}
            </span>
            <div className="editable-field-edit-icon">✎</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableField;