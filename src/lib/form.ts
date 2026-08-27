import type { z } from "zod";

export type FieldErrors = Record<string, string[]>;

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: FieldErrors;
};

export const FORM_CHECK_MESSAGE = "Check the form and try again.";

export function flattenFieldErrors(error: z.ZodError): FieldErrors {
  const { fieldErrors, formErrors } = error.flatten();
  const result: FieldErrors = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      result[key] = messages;
    }
  }
  if (formErrors.length > 0) {
    result.form = formErrors;
  }
  return result;
}

export function invalidFormState<TState extends FormState>(
  error: z.ZodError,
): TState {
  return {
    error: FORM_CHECK_MESSAGE,
    fieldErrors: flattenFieldErrors(error),
  } as TState;
}

export function withClientValidation<TState extends FormState>(
  parse: (
    formData: FormData,
  ) => { success: true } | { success: false; error: z.ZodError },
  serverAction: (prev: TState, formData: FormData) => Promise<TState>,
) {
  return async (prev: TState, formData: FormData): Promise<TState> => {
    const parsed = parse(formData);
    if (!parsed.success) {
      return invalidFormState<TState>(parsed.error);
    }
    return serverAction(prev, formData);
  };
}
