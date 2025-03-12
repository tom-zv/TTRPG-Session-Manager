import React, { ReactNode } from 'react';
import './Form.css';

// Field types for form inputs
export type FieldType = 'text' | 'select' | 'file' | 'url' | 'radio' | 'textarea' | 'checkbox';

export interface FormOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  value: string | boolean | File | null;
  options?: FormOption[]; // For select or radio options
  required?: boolean;
  placeholder?: string;
  accept?: string; // For file inputs
  onChange: (value: any) => void;
  disabled?: boolean;
  error?: string; // Field-specific error message
}

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
  children?: ReactNode;
  fieldErrors?: FieldError[] | null;
  onClearErrors?: () => void; // New callback for clearing errors
}

const Form: React.FC<FormProps> = ({
  fields,
  onSubmit,
  submitLabel,
  isSubmitting = false,
  error = null,
  className = '',
  children,
  fieldErrors = null,
  onClearErrors
}) => {

  // Process field errors and map them to form fields
  const processedFields = React.useMemo(() => {
    if (!fieldErrors || fieldErrors.length === 0) return fields;
    
    // Map errors to fields
    const updatedFields = [...fields];
    
    fieldErrors.forEach(fieldError => {
      const errorFields = Array.isArray(fieldError.fields) 
        ? fieldError.fields 
        : [fieldError.fields];
      
      errorFields.forEach(fieldId => {
        const fieldIndex = updatedFields.findIndex(f => f.id === fieldId);
        if (fieldIndex !== -1) {
          updatedFields[fieldIndex] = {
            ...updatedFields[fieldIndex],
            error: fieldError.message
          };
        }
      });
    });
    
    return updatedFields;
  }, [fields, fieldErrors]);

  // Reset error visibility when fields or fieldErrors change
  const clearAllErrors = () => {
    if (fieldErrors && onClearErrors) {
      onClearErrors();
    }
  };

  const renderField = (field: FormField) => {
    const { id, label, type, value, options, required, placeholder, accept, onChange, disabled, error: fieldError } = field;
    const hasError = !!fieldError;
    const fieldClassName = `form-group ${hasError ? 'has-error' : ''}`;

    // Combined handler for onChange
    const handleChange = (newValue: any) => {
      onChange(newValue);
      clearAllErrors();
    };

    switch (type) {
      case 'select':
        return (
          <div className={fieldClassName} key={id}>
            {fieldError && <div className="field-error">{fieldError}</div>}
            <label htmlFor={id}>{label}:</label>
            <select
              id={id}
              value={value as string}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={clearAllErrors}
              required={required}
              disabled={disabled}
              className={hasError ? 'error-field' : ''}
            >
              {options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'file':
        return (
          <div className={fieldClassName} key={id}>
            {fieldError && <div className="field-error">{fieldError}</div>}
            <label htmlFor={id}>{label}:</label>
            <input
              id={id}
              type="file"
              accept={accept}
              onChange={(e) => {
                const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                handleChange(file);
              }}
              onFocus={clearAllErrors}
              required={required}
              disabled={disabled}
              className={hasError ? 'error-field' : ''}
            />
            {value && (value as File).name && (
              <p className="file-name">Selected: {(value as File).name}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div className={fieldClassName} key={id}>
            <label htmlFor={id}>{label}:</label>
            <textarea
              id={id}
              value={value as string}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={clearAllErrors}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              className={hasError ? 'error-field' : ''}
            />
            {fieldError && <div className="field-error">{fieldError}</div>}
          </div>
        );

      case 'checkbox':
        return (
          <div className={`${fieldClassName} checkbox-group`} key={id}>
            {fieldError && <div className="field-error">{fieldError}</div>}
            <label>
              <input
                id={id}
                type="checkbox"
                checked={!!value}
                onChange={(e) => handleChange(e.target.checked)}
                onFocus={clearAllErrors}
                required={required}
                disabled={disabled}
                className={hasError ? 'error-field' : ''}
              />
              {label}
            </label>
          </div>
        );

      case 'radio':
        return (
          <div className={fieldClassName} key={id}>
            {fieldError && <div className="field-error">{fieldError}</div>}
            <label htmlFor={id}>{label}:</label>
            <input
              id={id}
              type="radio"
              checked={!!value}
              onChange={(e) => handleChange(e.target.checked)}
              onFocus={clearAllErrors}
              required={required}
              disabled={disabled}
              className={hasError ? 'error-field' : ''}
            />
          </div>
        );

      default:
        return (
          <div className={fieldClassName} key={id}>
            {fieldError && <div className="field-error">{fieldError}</div>}
            <label htmlFor={id}>{label}:</label>
            <input
              id={id}
              type={type}
              value={value as string}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={clearAllErrors}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              accept={accept}
              className={hasError ? 'error-field' : ''}
            />
          </div>
        );
    }
  };

  return (
    <div className={`form-container ${className}`}>
      {error && <div className="error-message alert alert-danger">{error}</div>}
      
      <form onSubmit={onSubmit}>
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

export default Form;
