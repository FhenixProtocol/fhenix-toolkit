// Re-checks every pinned token against mainnet (symbol, decimals, rate, underlying).
// Run: cd bankr && bun test/verify-tokens.mjs   (set FHENIX_RPC_42161 / FHENIX_RPC_1 to use your own RPCs)
import { TOKENS, commands } from '../fhenix-private/scripts/fhenix.mjs';

let failed = 0;
for (const [chain, toks] of Object.entries(TOKENS)) {
  for (const symbol of Object.keys(toks)) {
    try {
      const r = await commands.verify({ token: symbol, chain });
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${chain} ${symbol} ${r.address}${r.problems.length ? ' ' + r.problems.join('; ') : ''}`);
      if (!r.ok) failed++;
    } catch (e) {
      console.log(`FAIL ${chain} ${symbol} ${e.message}`);
      failed++;
    }
  }
}
process.exit(failed ? 1 : 0);
