import React, { useId } from "react";
import styles from "./FormControls.module.css";
import { FORM_CONTROL_TAGS, joinClassNames, toFieldName } from "./utils.js";

type FormFieldProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
  controlId?: string;
  name?: string;
  error?: string;
  /** Visually hides the label while keeping it accessible to screen readers */
  hideLabel?: boolean;
};

export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  className,
  controlId: explicitControlId,
  name,
  error,
  hideLabel = false,
}) => {
  const generatedId = useId();
  const controlName = name ?? toFieldName(label);
  const controlId = `${controlName}-${generatedId.replace(/:/g, "")}`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? errorId : undefined;
  const childList = React.Children.toArray(children);
  const hasDirectControl = childList.some(
    (child) =>
      React.isValidElement(child) &&
      typeof child.type === "string" &&
      FORM_CONTROL_TAGS.has(child.type)
  );
  const childControl = childList.find((child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return false;
    return typeof child.props.id === "string";
  });
  const labelControlId =
    explicitControlId ??
    (React.isValidElement<Record<string, unknown>>(childControl) &&
    typeof childControl.props.id === "string"
      ? childControl.props.id
      : hasDirectControl
        ? controlId
        : undefined);

  const enhancedChildren = childList.map((child) => {
    if (!React.isValidElement(child)) return child;

    if (typeof child.type !== "string") {
      return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        "aria-describedby": child.props["aria-describedby"] ?? describedBy,
        "aria-invalid": child.props["aria-invalid"] ?? (Boolean(error) || undefined),
        "data-field": child.props["data-field"] ?? controlName,
        inputClassName: joinClassNames(
          child.props.inputClassName as string | undefined,
          error ? styles.inputError : undefined
        ),
      });
    }

    if (!FORM_CONTROL_TAGS.has(child.type)) return child;

    return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      id: child.props.id ?? controlId,
      name: child.props.name ?? controlName,
      "aria-describedby": child.props["aria-describedby"] ?? describedBy,
      "aria-invalid": child.props["aria-invalid"] ?? (Boolean(error) || undefined),
      "data-field": child.props["data-field"] ?? controlName,
      className: joinClassNames(child.props.className, error ? styles.inputError : undefined),
    });
  });

  return (
    <div className={joinClassNames(styles.field, className)}>
      <label className={joinClassNames(styles.label, hideLabel ? styles.labelHidden : undefined)} htmlFor={labelControlId}>
        {label}
      </label>
      {enhancedChildren}
      {error && (
        <div id={errorId} className={styles.fieldError}>
          {error}
        </div>
      )}
    </div>
  );
};
