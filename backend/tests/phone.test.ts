import { normalizePhone } from '../src/utils/phone';

describe('normalizePhone', () => {
  it.each([
    ['+249912345678', '+249912345678'],
    ['0912345678', '+249912345678'],
    ['912345678', '+249912345678'],
    ['249912345678', '+249912345678'],
    ['00249912345678', '+249912345678'],
    ['091 234-5678', '+249912345678'],
    ['٠٩١٢٣٤٥٦٧٨', '+249912345678'], // Arabic-Indic digits
    ['+250788123456', '+250788123456'], // other countries are kept
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['abc', '', '12', '+0123456789', '09123'])('rejects %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
