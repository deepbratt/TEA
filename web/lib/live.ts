import { connection } from 'next/server';
import { DEMO } from './mode';

/**
 * Pages read the config file and analyses from disk, so locally they render on every request.
 * The demo build renders them once, at build time, from the recorded example data.
 */
export async function live(): Promise<void> {
  if (!DEMO) await connection();
}
