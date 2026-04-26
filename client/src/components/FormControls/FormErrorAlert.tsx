import React from "react";
import styles from "./FormControls.module.css";

type FormErrorAlertProps = {
  error: string | null | undefined;
};

export const FormErrorAlert: React.FC<FormErrorAlertProps> = ({ error }) => {
  if (!error) return null;
  return (
    <div className={styles.errorBox} role="alert">
      {error.split("\n").map((message) => (
        <div key={message}>{message}</div>
      ))}
    </div>
  );
};
