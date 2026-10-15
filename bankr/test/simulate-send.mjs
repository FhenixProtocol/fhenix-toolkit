// Mainnet dry run: encrypt a private send for --account with the real CoFHE verifier,
// then eth_call the transfer from that account (should succeed) and from another
// address (should revert InvalidSigner). Nothing is signed or broadcast.
//
//   bun test/simulate-send.mjs --account 0xYourBankrAddress [--token fUSDC] [--chain 42161] [--amount 0.01]
//
// The account must already hold some of the private token; a wallet that never did
// reverts FHERC20ZeroBalance, which also proves the proof itself was accepted.
import { createPublicClient, http, decodeErrorResult, parseAbi } from 'viem';
import { commands } from '../fhenix-private/scripts/fhenix.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
if (!args.account) {
  console.error('usage: bun test/simulate-send.mjs --account 0x… [--token fUSDC] [--chain 42161] [--amount 0.01]');
  process.exit(2);
}
const chain = args.chain ?? '42161';
const opts = {
  token: args.token ?? 'fUSDC',
  chain,
  amount: args.amount ?? '0.01',
  account: args.account,
  to: '0x1111111111111111111111111111111111111111',
};
const ERRORS = parseAbi([
  'error InvalidSigner(address signer, address expectedSigner)',
  'error FHERC20ZeroBalance(address from)',
]);
const rpc = process.env[`FHENIX_RPC_${chain}`] ?? { 42161: 'https://arb1.arbitrum.io/rpc', 1: 'https://ethereum-rpc.publicnode.com' }[chain];
const pc = createPublicClient({ transport: http(rpc) });

const built = await commands.send(opts);
const { to, data } = built.txs[0];

async function simulate(from) {
  try {
    const r = await pc.call({ account: from, to, data });
    return `ok, returned ${r.data}`;
  } catch (e) {
    const raw = e?.cause?.data ?? e?.data ?? e?.walk?.((x) => x?.data)?.data;
    try {
      const d = decodeErrorResult({ abi: ERRORS, data: raw });
      return `reverted ${d.errorName}(${d.args.join(', ')})`;
    } catch {
      return `reverted ${e.shortMessage ?? e.message}`;
    }
  }
}

console.log(`${opts.token} on ${chain}, encrypted for ${opts.account}`);
console.log(`  from the account:  ${await simulate(opts.account)}`);
console.log(`  from someone else: ${await simulate('0x2222222222222222222222222222222222222222')}`);
