export const PRODUCT_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'indigo',
  'violet'
] as const;

export type ProductColor = (typeof PRODUCT_COLORS)[number];

/** Saturated swatches for the inventory picker */
export const PRODUCT_COLOR_HEX: Record<ProductColor, string> = {
  red: '#e53935',
  orange: '#fb8c00',
  yellow: '#fdd835',
  green: '#43a047',
  blue: '#1e88e5',
  indigo: '#3949ab',
  violet: '#8e24aa'
};

/** Soft fills for cashier product cards */
export const PRODUCT_COLOR_TINT: Record<ProductColor, string> = {
  red: '#ffcdd2',
  orange: '#ffe0b2',
  yellow: '#fff9c4',
  green: '#c8e6c9',
  blue: '#bbdefb',
  indigo: '#c5cae9',
  violet: '#e1bee7'
};

export function isProductColor(value: string | null | undefined): value is ProductColor {
  return value != null && (PRODUCT_COLORS as readonly string[]).includes(value);
}

export function productColorHex(value: string | null | undefined): string {
  return isProductColor(value) ? PRODUCT_COLOR_HEX[value] : '#dddddd';
}

export function productColorTint(value: string | null | undefined): string | undefined {
  return isProductColor(value) ? PRODUCT_COLOR_TINT[value] : undefined;
}
