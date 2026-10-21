// BUG (circular import): cart imports pricing, and pricing imports cart.
import { applyClubDiscount } from './pricing';

export type CartLine = { productId: string; price: number; quantity: number };

export function cartTotal(lines: CartLine[]): number {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  return applyClubDiscount(subtotal);
}

export const FREE_SHIPPING_FROM = 3000;
