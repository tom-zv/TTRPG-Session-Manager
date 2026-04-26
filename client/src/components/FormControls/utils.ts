export const FORM_CONTROL_TAGS = new Set(["input", "select", "textarea"]);

export const toFieldName = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const joinClassNames = (...classes: Array<string | undefined | false>): string | undefined => {
  const value = classes.filter(Boolean).join(" ");
  return value || undefined;
};

export const parseNumber = (value: string): number | undefined => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const clampNumber = (value: number, min?: number, max?: number): number => {
  if (min != null && value < min) return min;
  if (max != null && value > max) return max;
  return value;
};

export const formatNumberValue = (value: number, format: "plain" | "signed"): string => {
  if (format === "signed" && value >= 0) return `+${value}`;
  return String(value);
};
