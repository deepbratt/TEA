// BUG (circular import): see lib/cart.ts.
import { FREE_SHIPPING_FROM } from './cart';

export function applyClubDiscount(subtotal: number): number {
  return Math.round(subtotal * 0.9);
}

export function shippingFor(total: number): number {
  return total >= FREE_SHIPPING_FROM ? 0 : 450;
}
