import { isAbsolute } from 'node:path';

export const text = (value) => typeof value === 'string' && value.trim().length > 0;
export const relativePath = (value, strict = false) =>
  text(value) && !isAbsolute(value) && !/^[A-Za-z]:/.test(value) &&
  !value.includes('\\') && (!strict || !value.split('/').includes('..'));
