/**
 * Supported currencies with their ISO 4217 minor units (List One, published 2026-09-17).
 * Minor units are stored explicitly because some Intl/ICU builds diverge from ISO 4217
 * (for example, reporting 0 for PKR, whose ISO 4217 minor unit is 2).
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US dollar', minorUnits: 2 },
  { code: 'EUR', name: 'Euro', minorUnits: 2 },
  { code: 'GBP', name: 'British pound', minorUnits: 2 },
  { code: 'JPY', name: 'Japanese yen', minorUnits: 0 },
  { code: 'CNY', name: 'Chinese yuan', minorUnits: 2 },
  { code: 'INR', name: 'Indian rupee', minorUnits: 2 },
  { code: 'PKR', name: 'Pakistani rupee', minorUnits: 2 },
  { code: 'BDT', name: 'Bangladeshi taka', minorUnits: 2 },
  { code: 'AED', name: 'UAE dirham', minorUnits: 2 },
  { code: 'SAR', name: 'Saudi riyal', minorUnits: 2 },
  { code: 'KWD', name: 'Kuwaiti dinar', minorUnits: 3 },
  { code: 'AUD', name: 'Australian dollar', minorUnits: 2 },
  { code: 'CAD', name: 'Canadian dollar', minorUnits: 2 },
  { code: 'CHF', name: 'Swiss franc', minorUnits: 2 },
  { code: 'SGD', name: 'Singapore dollar', minorUnits: 2 },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.some((currency) => currency.code === code);
}

/** ISO 4217 minor-unit precision, e.g. 2 for USD and PKR, 0 for JPY, 3 for KWD. */
export function getCurrencyFractionDigits(code: CurrencyCode): number {
  const currency = SUPPORTED_CURRENCIES.find((item) => item.code === code);

  // Unreachable for a CurrencyCode; 2 is the ISO 4217 default.
  return currency?.minorUnits ?? 2;
}
