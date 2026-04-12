import React from 'react';
import './Form.css';

// ---------- Types ----------

export type FieldType = 'text' | 'url' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file';

export interface FormOption {
  value: string;
  label: string;
}

type BaseField = {
  id: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string;             // field-specific error (computed from fieldErrors)
  name?: string;              // defaults to id
  autoComplete?: string;      // native autofill hint
};

type TextLikeField = BaseField & {
  type: 'text' | 'url' | 'textarea';
  value: string;
  onChange: (v: string) => void;
  rows?: number;              // for textarea
};

type SelectField = BaseField & {
  type: 'select';
  value: string;
  options: FormOption[];
  onChange: (v: string) => void;
  requiredPlaceholderLabel?: string; // shown when required and value is empty
};

type RadioField = BaseField & {
  type: 'radio';
  value: string;              // selected option value
  options: FormOption[];      // radio group
  onChange: (v: string) => void;
};

type CheckboxField = BaseField & {
  type: 'checkbox';
  value: boolean;
  onChange: (v: boolean) => void;
};

type FileField = BaseField & {
  type: 'file';
  value: File | null | File[]; // supports single or multiple
  onChange: (v: File | null | File[]) => void;
  accept?: string;
  multiple?: boolean;
};

export type FormField =
  | TextLikeField
  | SelectField
  | RadioField
  | CheckboxField
  | FileField;

export interface FieldError {
  fields: string | string[];
  message: string;
}

export interface FormProps {
  fields: FormField[];
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  isSubmitting?: boolean;
  error?: string | null;
  className?: string;
  children?: React.ReactNode;
  fieldErrors?: FieldError[] | null;
  /** Clears all errors (legacy) */
  onClearErrors?: () => void;
  /** Prefer this for per-field error clearing */
  onClearFieldError?: (fieldId: string) => void;
  /** Pass-through props to <form> (e.g., noValidate, autoComplete) */
  formProps?: React.FormHTMLAttributes<HTMLFormElement>;
}

// ---------- Component ----------

const ConfigForm: React.FC<FormProps> = ({
  fields,
  onSubmit,
  submitLabel,
  isSubmitting = false,
  error = null,
  className = '',
  children,
  fieldErrors = null,
  onClearErrors,
  onClearFieldError,
  formProps
}) => {
  // Overlay backend fieldErrors onto fields (pure, memoized)
  const processedFields = React.useMemo<FormField[]>(() => {
    if (!fieldErrors || fieldErrors.length === 0) return fields;

    // clone to avoid mutating caller data
    const byId = new Map(fields.map((f) => [f.id, { ...f }]));
    for (const fe of fieldErrors) {
      const ids = Array.isArray(fe.fields) ? fe.fields : [fe.fields];
      for (const id of ids) {
        const f = byId.get(id);
        if (f) byId.set(id, { ...f, error: fe.message });
      }
    }
    return Array.from(byId.values());
  }, [fields, fieldErrors]);

  // Clear only this field's error if possible; fall back to clearing all
  const clearErrorForField = React.useCallback(
    (fieldId: string) => {
      if (onClearFieldError) {
        onClearFieldError(fieldId);
      } else if (onClearErrors) {
        onClearErrors();
      }
    },
    [onClearErrors, onClearFieldError]
  );

  const renderField = (field: FormField) => {
    const {
      id,
      label,
      required,
      disabled,
      placeholder,
      error: fieldError,
      name,
      autoComplete
    } = field;
    const hasError = Boolean(fieldError);
    const fieldClassName = `form-group ${hasError ? 'has-error' : ''}`;
    const nameAttr = name ?? id;
    const describedById = hasError ? `${id}-error` : undefined;

    const handleString = (v: string) => {
      (field as TextLikeField | SelectField | RadioField).onChange(v);
      clearErrorForField(id);
    };
    const handleBoolean = (v: boolean) => {
      (field as CheckboxField).onChange(v);
      clearErrorForField(id);
    };
    // NOTE: pass isMultiple from the file input branch to avoid union access
    const handleFile = (files: FileList | null, isMultiple: boolean) => {
      if (!files || files.length === 0) {
        (field as FileField).onChange(isMultiple ? [] : null);
      } else if (isMultiple) {
        (field as FileField).onChange(Array.from(files));
      } else {
        (field as FileField).onChange(files[0]);
      }
      clearErrorForField(id);
    };

    // --- Switch per type ---
    switch (field.type) {
      case 'select': {
        const f = field as SelectField;
        const showRequiredPlaceholder =
          f.required && (!f.value || f.value === '');

        return (
          <div className={fieldClassName} key={id}>
            <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
            <select
              id={id}
              name={nameAttr}
              value={f.value}
              required={required}
              disabled={disabled}
              onChange={(e) => handleString(e.target.value)}
              aria-invalid={hasError || undefined}
              aria-describedby={describedById}
              autoComplete={autoComplete}
              className={hasError ? 'error-field' : ''}
            >
              {showRequiredPlaceholder && (
                <option value="" disabled>
                  {f.requiredPlaceholderLabel ?? '— select —'}
                </option>
              )}
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {hasError && (
              <div id={describedById} className="field-error">
                {fieldError}
              </div>
            )}
          </div>
        );
      }

      case 'file': {
        const f = field as FileField;
        const fileLabel = Array.isArray(f.value)
          ? f.value.map((x) => x.name).join(', ')
          : f.value && 'name' in (f.value as File)
          ? (f.value as File).name
          : '';

        const isMultiple = Boolean(f.multiple);

        return (
          <div className={fieldClassName} key={id}>
            <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
            <input
              id={id}
              name={nameAttr}
              type="file"
              accept={f.accept}
              multiple={isMultiple}
              required={required}
              disabled={disabled}
              onChange={(e) => handleFile(e.target.files, isMultiple)}
              aria-invalid={hasError || undefined}
              aria-describedby={describedById}
              className={hasError ? 'error-field' : ''}
            />
            {fileLabel && <p className="file-name">Selected: {fileLabel}</p>}
            {hasError && (
              <div id={describedById} className="field-error">
                {fieldError}
              </div>
            )}
          </div>
        );
      }

      case 'textarea': {
        const f = field as TextLikeField;
        return (
          <div className={fieldClassName} key={id}>
            <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
            <textarea
              id={id}
              name={nameAttr}
              value={f.value}
              onChange={(e) => handleString(e.target.value)}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              aria-invalid={hasError || undefined}
              aria-describedby={describedById}
              autoComplete={autoComplete}
              rows={f.rows ?? 4}
              className={hasError ? 'error-field' : ''}
            />
            {hasError && (
              <div id={describedById} className="field-error">
                {fieldError}
              </div>
            )}
          </div>
        );
      }

      case 'checkbox': {
        const f = field as CheckboxField;
        return (
          <div className={`${fieldClassName} checkbox-group`} key={id}>
            <label>
              <input
                id={id}
                name={nameAttr}
                type="checkbox"
                checked={!!f.value}
                onChange={(e) => handleBoolean(e.target.checked)}
                required={required}
                disabled={disabled}
                aria-invalid={hasError || undefined}
                aria-describedby={describedById}
                className={hasError ? 'error-field' : ''}
              />
              {label}{required ? ' *' : ''}
            </label>
            {hasError && (
              <div id={describedById} className="field-error">
                {fieldError}
              </div>
            )}
          </div>
        );
      }

      case 'radio': {
        const f = field as RadioField;
        return (
          <fieldset className={fieldClassName} key={id}>
            <legend>{label}{required ? ' *' : ''}</legend>
            {f.options.map((opt) => {
              const optId = `${id}__${opt.value}`;
              return (
                <label key={opt.value} htmlFor={optId} className="radio-option">
                  <input
                    id={optId}
                    type="radio"
                    name={nameAttr}
                    value={opt.value}
                    checked={f.value === opt.value}
                    onChange={() => handleString(opt.value)}
                    required={required}
                    disabled={disabled}
                    aria-describedby={describedById}
                    className={hasError ? 'error-field' : ''}
                  />
                  {opt.label}
                </label>
              );
            })}
            {hasError && (
              <div id={describedById} className="field-error">
                {fieldError}
              </div>
            )}
          </fieldset>
        );
      }

      default: {
        // text | url
        const f = field as TextLikeField;
        return (
          <div className={fieldClassName} key={id}>
            <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
            <input
              id={id}
              name={nameAttr}
              type={field.type}
              value={f.value}
              onChange={(e) => handleString(e.target.value)}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              aria-invalid={hasError || undefined}
              aria-describedby={describedById}
              autoComplete={autoComplete}
              className={hasError ? 'error-field' : ''}
            />
            {hasError && (
              <div id={describedById} className="field-error">
                {fieldError}
              </div>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className={`form-container ${className}`}>
      {error && <div className="error-message alert alert-danger">{error}</div>}

      <form onSubmit={onSubmit} {...formProps}>
        {processedFields.map(renderField)}

        {children}

        <div className="form-actions">
          <button
            type="submit"
            disabled={isSubmitting}
            className="submit-button"
          >
            {isSubmitting ? 'Processing...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConfigForm;
