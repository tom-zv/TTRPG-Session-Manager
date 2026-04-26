import type {
  FieldErrors,
  OpenSectionId,
} from "../DnD5eEntityForm.types.js";

export type ValidationState = ReturnType<typeof createValidationState>;

export const createValidationState = () => {
  const fieldErrors: FieldErrors = {};
  const rowErrors: FieldErrors = {};
  const sectionsToOpen = new Set<OpenSectionId>();
  const messages: string[] = [];
  let firstInvalidField: string | undefined;

  const addMessage = (message: string) => {
    if (!messages.includes(message)) messages.push(message);
  };

  return {
    markField(field: string, fieldMessage: string, section?: OpenSectionId, message = fieldMessage) {
      fieldErrors[field] = fieldMessage;
      firstInvalidField ??= field;
      if (section) sectionsToOpen.add(section);
      addMessage(message);
    },
    markRow(group: string, id: string, fieldMessage: string, section: OpenSectionId, message = fieldMessage) {
      const field = `${group}.${id}`;
      rowErrors[field] = fieldMessage;
      firstInvalidField ??= field;
      sectionsToOpen.add(section);
      addMessage(message);
    },
    hasErrors: () => messages.length > 0,
    toResultState: () => ({
      fieldErrors,
      rowErrors,
      sectionsToOpen: Array.from(sectionsToOpen),
      firstInvalidField,
      messages,
    }),
  };
};
