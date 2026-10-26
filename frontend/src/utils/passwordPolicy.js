export const PASSWORD_MIN_CHARACTERS = 12;
export const PASSWORD_MAX_UTF8_BYTES = 72;

export function isValidPassword(password) {
  return typeof password === "string"
    && Array.from(password).length >= PASSWORD_MIN_CHARACTERS
    && new TextEncoder().encode(password).length <= PASSWORD_MAX_UTF8_BYTES;
}
