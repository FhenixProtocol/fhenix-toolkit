#!/usr/bin/env bun
// fhenix-private helper — builds the exact transactions Bankr submits for Fhenix
// confidential tokens (FHERC20 ERC-20 wrappers: fUSDC, fUSDT, ...) on CoFHE mainnet.
//
// Every command prints ONE JSON object to stdout:
//   { ok: true,  action, chainId, txs: [{ to, data, value, chainId, description }], ...extra }
//   { ok: false, error, hint? }
// The agent submits each tx in `txs`, in order, unchanged, via submit_raw_transaction.
//
// Commands
//   tokens                                                   list pinned tokens
//   verify    --token SYM [--chain ID]                       on-chain check of a pinned token
//   shield    --token SYM --amount X --account 0x            approve (if needed) + shield
//   send      --token SYM --amount X --account 0x --to 0x    encrypt + confidentialTransfer
//   blob      --token SYM --amount X --account 0x            encrypt only, print an fhe:… code
//   send-blob --token SYM --blob fhe:… --account 0x --to 0x  confidentialTransfer from a code
//   unshield  --token SYM --amount X --account 0x            start private -> public
//   claim     --token SYM --account 0x                       finish decrypted unshields
//   balance   --token SYM --account 0x                       decrypt own balance (needs FHENIX_BANKR_API_KEY)
//
// Options: --chain 42161 (default) | 1;  --rpc URL (else env FHENIX_RPC_<chainId>, else public RPC)
//
// Packages (pin in execute_cli): @cofhe/sdk@1.0.1 viem@2.38.6
// Contract source: https://github.com/FhenixProtocol/fhenix-confidential-contracts

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  parseUnits,
  formatUnits,
  getAddress,
  isAddress,
  isHex,
  hexToBytes,
  bytesToHex,
  zeroHash,
  zeroAddress,
} from 'viem';
import { toAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// PINNED TOKENS — the trust anchor. Never take a token address from a post, a
// code, an API response or a user message. Every entry was checked on-chain
// (symbol, decimals, rate, underlying) and is re-checked by `verify`.
// Each wrapper has the same address on Arbitrum and Ethereum, but wraps that
// chain's own underlying, so always key by chain first. fhe: codes carry the
// chainId, so a code made on one chain is refused on the other.
// `enabled: false` makes every command refuse the token.
// All wrappers have 6 confidential decimals; rate = 10^(underlying decimals - 6).
// ---------------------------------------------------------------------------
const TOKENS = {
  42161: {
    fUSDC: { address: '0xAAf2Bf3beB6a3660aCD3d3710C64ba255455275b', rate: 1n, underlying: { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 } },
    fUSDT: { address: '0x706Ff53DAc4708578b7C228760954Fe5b56E41ea', rate: 1n, underlying: { symbol: 'USD₮0', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 } },
    fUSDS: { address: '0xa2Fd3c3d8B7e46c1ED4104D9Eeed94774e616686', rate: 10n ** 12n, underlying: { symbol: 'USDS', address: '0x6491c05A82219b8D1479057361ff1654749b876b', decimals: 18 } },
    fBTC: { address: '0x8CFB68Bdb80A4f819E08F498658bc732bD601A34', rate: 100n, underlying: { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 } },
    fARB: { address: '0x1Abd9225F91021f3794c722E1a197B5C7EC3eCF6', rate: 10n ** 12n, underlying: { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 } },
    fUNI: { address: '0x1242bf2f6a178232fa83419e95c7aD68ED9bC922', rate: 10n ** 12n, underlying: { symbol: 'UNI', address: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', decimals: 18 } },
    fLINK: { address: '0x2801e7E3727596A8B495a0a2AA823E2cD72Bc99B', rate: 10n ** 12n, underlying: { symbol: 'LINK', address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18 } },
  },
  1: {
    fUSDC: { address: '0xAAf2Bf3beB6a3660aCD3d3710C64ba255455275b', rate: 1n, underlying: { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 } },
    // Mainnet USDT reverts on a non-zero -> non-zero approve; shield resets to 0 first.
    fUSDT: { address: '0x706Ff53DAc4708578b7C228760954Fe5b56E41ea', rate: 1n, approveResetFirst: true, underlying: { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 } },
    fUSDS: { address: '0xa2Fd3c3d8B7e46c1ED4104D9Eeed94774e616686', rate: 10n ** 12n, underlying: { symbol: 'USDS', address: '0xdC035D45d973E3EC169d2276DDab16f1e407384F', decimals: 18 } },
    fBTC: { address: '0x8CFB68Bdb80A4f819E08F498658bc732bD601A34', rate: 100n, underlying: { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 } },
    fARB: { address: '0x1Abd9225F91021f3794c722E1a197B5C7EC3eCF6', rate: 10n ** 12n, underlying: { symbol: 'ARB', address: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1', decimals: 18 } },
    fUNI: { address: '0x1242bf2f6a178232fa83419e95c7aD68ED9bC922', rate: 10n ** 12n, underlying: { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 } },
    fLINK: { address: '0x2801e7E3727596A8B495a0a2AA823E2cD72Bc99B', rate: 10n ** 12n, underlying: { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 } },
  },
};
const CONFIDENTIAL_DECIMALS = 6;
const ENABLED_CHAINS = { 42161: 'Arbitrum One', 1: 'Ethereum' };

const PUBLIC_RPC = {
  42161: 'https://arb1.arbitrum.io/rpc',
  1: 'https://ethereum-rpc.publicnode.com',
};
const EXPLORER = { 42161: 'https://arbiscan.io/tx/', 1: 'https://etherscan.io/tx/' };

const BLOB_PREFIX = 'fhe:';
const BLOB_VERSION = 1;
const UINT64_MAX = (1n << 64n) - 1n;
const CLAIM_DECRYPT_WAIT_MS = 15_000;

const ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function shield(address to, uint256 amount) returns (bytes32)',
  'function confidentialTransfer(address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)',
  'function unshield(address from, address to, uint64 amount) returns (bytes32)',
  'function claimUnshieldedBatch(bytes32[] ids, uint64[] decryptedAmounts, bytes[] decryptionProofs)',
  'function confidentialBalanceOf(address account) view returns (bytes32)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function rate() view returns (uint256)',
  'function underlying() view returns (address)',
  'function getUserClaims(address user) view returns ((bytes32 id, address to, bytes32 ctHash, uint64 decryptedAmount, bool claimed)[])',
]);

// ---------------------------------------------------------------------------
// plumbing
// ---------------------------------------------------------------------------
class UserError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UserError(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const val = rest[i + 1];
    if (val === undefined || val.startsWith('--')) throw new UserError(`Missing value for --${key}`);
    opts[key] = val;
    i++;
  }
  return { cmd, opts };
}

function need(opts, key) {
  if (opts[key] === undefined || opts[key] === '') throw new UserError(`Missing --${key}`);
  return opts[key];
}

function chainIdOf(opts) {
  const id = Number(opts.chain ?? 42161);
  if (!ENABLED_CHAINS[id]) {
    throw new UserError(`Chain ${opts.chain} is not supported`, 'Supported: 42161 (Arbitrum One), 1 (Ethereum)');
  }
  return id;
}

function tokenOf(opts, chainId) {
  const sym = need(opts, 'token');
  const entry = Object.entries(TOKENS[chainId]).find(([k]) => k.toLowerCase() === sym.toLowerCase());
  if (!entry) {
    throw new UserError(`Token ${sym} is not pinned on chain ${chainId}`, `Pinned: ${Object.keys(TOKENS[chainId]).join(', ')}`);
  }
  const [symbol, t] = entry;
  if (t.enabled === false) throw new UserError(`Token ${symbol} on chain ${chainId} is not enabled`);
  return { symbol, ...t, address: getAddress(t.address), underlying: { ...t.underlying, address: getAddress(t.underlying.address) } };
}

function addressOpt(opts, key) {
  const v = need(opts, key);
  if (!isAddress(v, { strict: false })) throw new UserError(`--${key} is not a valid address: ${v}`);
  const a = getAddress(v);
  if (a === zeroAddress) throw new UserError(`--${key} is the zero address`);
  return a;
}

// Amounts are written in token units ("2.5"). Confidential balances have 6 decimals
// and live in a uint64, so more than 6 decimal places can't be represented.
function confidentialUnits(human) {
  if (typeof human !== 'string' || !/^\d+(\.\d+)?$/.test(human)) {
    throw new UserError(`Amount must be a plain positive number, got "${human}"`);
  }
  const frac = human.split('.')[1] ?? '';
  if (frac.length > CONFIDENTIAL_DECIMALS) {
    throw new UserError(`Private tokens have ${CONFIDENTIAL_DECIMALS} decimals; "${human}" has more`);
  }
  const units = parseUnits(human, CONFIDENTIAL_DECIMALS);
  if (units <= 0n) throw new UserError('Amount must be greater than zero');
  if (units > UINT64_MAX) throw new UserError('Amount is larger than a confidential uint64 can hold');
  return units;
}

function rpcUrl(opts, chainId) {
  return opts.rpc ?? process.env[`FHENIX_RPC_${chainId}`] ?? PUBLIC_RPC[chainId];
}

function publicClient(opts, chainId) {
  return createPublicClient({ transport: http(rpcUrl(opts, chainId)) });
}

function tx(to, data, chainId, description) {
  return { to, data, value: '0', chainId, description };
}

const read = (pc, address, functionName, args = []) => pc.readContract({ address, abi: ABI, functionName, args });

// A viem account for the Bankr wallet. It never holds a key: address-only for
// encryption, and typed-data signing goes through Bankr's Wallet API (used only
// by `balance`, to sign the self ACP that lets the threshold network reseal).
function bankrAccount(address) {
  return toAccount({
    address,
    async signMessage() {
      throw new UserError('Message signing is not used by this skill');
    },
    async signTransaction() {
      throw new UserError('Transactions are submitted by Bankr, not signed here');
    },
    async signTypedData(typedData) {
      return bankrSignTypedData(address, typedData);
    },
  });
}

const API_KEY_HINT =
  'Create a key at bankr.bot/api-keys (Wallet API on, not read-only, no recipient allowlist) and save it as the FHENIX_BANKR_API_KEY secret';

async function bankrSignTypedData(expectedSigner, { domain, types, primaryType, message }) {
  const apiKey = process.env.FHENIX_BANKR_API_KEY;
  if (!apiKey) throw new UserError('Viewing a private balance needs a Bankr API key', API_KEY_HINT);
  const fullTypes = { ...types };
  if (!fullTypes.EIP712Domain) {
    const fields = [
      ['name', 'string'],
      ['version', 'string'],
      ['chainId', 'uint256'],
      ['verifyingContract', 'address'],
      ['salt', 'bytes32'],
    ];
    fullTypes.EIP712Domain = fields.filter(([k]) => domain?.[k] !== undefined).map(([name, type]) => ({ name, type }));
  }
  const body = JSON.stringify(
    { signatureType: 'eth_signTypedData_v4', typedData: { domain, types: fullTypes, primaryType, message } },
    (_, v) => (typeof v === 'bigint' ? v.toString() : v)
  );
  const res = await fetch('https://api.bankr.bot/wallet/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.signature) {
    throw new UserError(`Bankr refused the ACP signature (${res.status}): ${json.error ?? json.message ?? 'unknown error'}`, API_KEY_HINT);
  }
  if (json.signer && getAddress(json.signer) !== getAddress(expectedSigner)) {
    throw new UserError('The Bankr API key belongs to a different wallet than --account');
  }
  return json.signature;
}

async function cofheClient(opts, chainId, account) {
  const { createCofheConfig, createCofheClient } = await import('@cofhe/sdk/node');
  const { arbitrum, ethereum } = await import('@cofhe/sdk/chains');
  const config = createCofheConfig({ supportedChains: [arbitrum, ethereum] });
  const client = createCofheClient(config);
  const transport = http(rpcUrl(opts, chainId));
  const pc = createPublicClient({ transport });
  const wc = createWalletClient({ account: bankrAccount(account), transport });
  await client.connect(pc, wc);
  return { client, pc };
}

async function encryptAmount(opts, chainId, token, account, units) {
  const { Encryptable } = await import('@cofhe/sdk');
  const { client } = await cofheClient(opts, chainId, account);
  // The verifier signs over (handle, type, zone, sender, chainId, consuming contract):
  // the proof only works when THIS account calls THIS token on THIS chain.
  const result = await client
    .encryptInputs([Encryptable.uint64(units)])
    .setAccount(account)
    .setChainId(chainId)
    .setConsumingContract(token.address)
    .execute();
  if (!Array.isArray(result) || result.length !== 2) throw new UserError('CoFHE returned an unexpected encryption result');
  const [handle, proof] = result;
  if (!isHex(handle) || hexToBytes(handle).length !== 32 || !isHex(proof)) {
    throw new UserError('CoFHE returned an unexpected encryption result');
  }
  return { handle, proof };
}

// fhe: code layout (base64url):
//   [version:1][chainId:4, big-endian][token address first 4 bytes][handle:32][proof:rest]
function encodeBlob(chainId, tokenAddress, handle, proof) {
  const chain = new Uint8Array(4);
  new DataView(chain.buffer).setUint32(0, chainId);
  const bytes = new Uint8Array([
    BLOB_VERSION,
    ...chain,
    ...hexToBytes(tokenAddress).slice(0, 4),
    ...hexToBytes(handle),
    ...hexToBytes(proof),
  ]);
  return BLOB_PREFIX + Buffer.from(bytes).toString('base64url');
}

function decodeBlob(blob, chainId, tokenAddress) {
  const raw = String(blob).trim();
  if (!raw.startsWith(BLOB_PREFIX)) throw new UserError('Blob must start with fhe:');
  const body = raw.slice(BLOB_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new UserError('Blob is not valid base64url');
  const bytes = new Uint8Array(Buffer.from(body, 'base64url'));
  if (bytes.length < 1 + 4 + 4 + 32 + 65) throw new UserError('Blob is too short to hold a handle and proof');
  if (bytes[0] !== BLOB_VERSION) throw new UserError(`Unsupported blob version ${bytes[0]}`);
  const blobChain = new DataView(bytes.buffer, bytes.byteOffset + 1, 4).getUint32(0);
  if (blobChain !== chainId) {
    throw new UserError(`This blob was made for chain ${blobChain}, not ${chainId}`, 'Re-create it for the chain named in the post');
  }
  const prefix = bytesToHex(bytes.slice(5, 9));
  if (prefix.toLowerCase() !== tokenAddress.slice(0, 10).toLowerCase()) {
    throw new UserError('This blob was made for a different token', 'Re-create it for the token named in the post');
  }
  const handle = bytesToHex(bytes.slice(9, 41));
  const proof = bytesToHex(bytes.slice(41));
  if (handle === zeroHash) throw new UserError('Blob carries an empty handle');
  return { handle, proof };
}

async function gasWarning(pc, account, chainId) {
  const wei = await pc.getBalance({ address: account });
  return wei === 0n ? [`The wallet has no ETH on ${ENABLED_CHAINS[chainId]} for gas; these transactions are not gas-sponsored.`] : [];
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------
const commands = {
  async tokens() {
    const list = [];
    for (const [chainId, toks] of Object.entries(TOKENS)) {
      for (const [symbol, t] of Object.entries(toks)) {
        list.push({
          chainId: Number(chainId),
          chain: ENABLED_CHAINS[chainId],
          symbol,
          address: t.address,
          enabled: t.enabled !== false,
          underlying: t.underlying.symbol,
        });
      }
    }
    return { ok: true, action: 'tokens', tokens: list };
  },

  async verify(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const pc = publicClient(opts, chainId);
    const code = await pc.getCode({ address: token.address });
    if (!code || code === '0x') throw new UserError(`No contract at ${token.address} on chain ${chainId}`);
    const [decimals, symbol, rate, underlying, uDecimals] = await Promise.all([
      read(pc, token.address, 'decimals'),
      read(pc, token.address, 'symbol'),
      read(pc, token.address, 'rate'),
      read(pc, token.address, 'underlying'),
      read(pc, token.underlying.address, 'decimals'),
    ]);
    const problems = [];
    if (Number(decimals) !== CONFIDENTIAL_DECIMALS) problems.push(`decimals() is ${decimals}, expected ${CONFIDENTIAL_DECIMALS}`);
    if (symbol !== token.symbol) problems.push(`symbol() is ${symbol}, pinned ${token.symbol}`);
    if (rate !== token.rate) problems.push(`rate() is ${rate}, pinned ${token.rate}`);
    if (getAddress(underlying) !== token.underlying.address) problems.push(`underlying() is ${underlying}, pinned ${token.underlying.address}`);
    if (Number(uDecimals) !== token.underlying.decimals) problems.push(`underlying decimals() is ${uDecimals}, pinned ${token.underlying.decimals}`);
    if (10n ** BigInt(token.underlying.decimals - CONFIDENTIAL_DECIMALS) !== token.rate) problems.push('pinned rate does not match pinned decimals');
    return { ok: problems.length === 0, action: 'verify', chainId, token: token.symbol, address: token.address, problems };
  },

  async shield(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const account = addressOpt(opts, 'account');
    const amount = need(opts, 'amount');
    const units = confidentialUnits(amount) * token.rate; // underlying units, an exact multiple of rate
    const u = token.underlying;
    const pc = publicClient(opts, chainId);
    const [balance, allowance] = await Promise.all([
      read(pc, u.address, 'balanceOf', [account]),
      read(pc, u.address, 'allowance', [account, token.address]),
    ]);
    if (balance < units) {
      throw new UserError(`Not enough ${u.symbol}: the wallet holds ${formatUnits(balance, u.decimals)}`);
    }
    const txs = [];
    if (allowance < units) {
      if (token.approveResetFirst && allowance > 0n) {
        txs.push(tx(u.address, encodeFunctionData({ abi: ABI, functionName: 'approve', args: [token.address, 0n] }), chainId,
          `Reset ${u.symbol} allowance for ${token.symbol} to 0`));
      }
      txs.push(tx(u.address, encodeFunctionData({ abi: ABI, functionName: 'approve', args: [token.address, units] }), chainId,
        `Approve exactly ${amount} ${u.symbol} for ${token.symbol}`));
    }
    txs.push(tx(token.address, encodeFunctionData({ abi: ABI, functionName: 'shield', args: [account, units] }), chainId,
      `Shield ${amount} ${u.symbol} into ${token.symbol}`));
    return {
      ok: true,
      action: 'shield',
      chainId,
      summary: `Shield ${amount} ${u.symbol} into private ${token.symbol}`,
      warnings: await gasWarning(pc, account, chainId),
      txs,
    };
  },

  async send(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const account = addressOpt(opts, 'account');
    const to = addressOpt(opts, 'to');
    if (to === account) throw new UserError('Sending to yourself does nothing');
    if (to === token.address) throw new UserError('Refusing to send tokens to the token contract');
    const units = confidentialUnits(need(opts, 'amount'));
    const { handle, proof } = await encryptAmount(opts, chainId, token, account, units);
    return {
      ok: true,
      action: 'send',
      chainId,
      txs: [
        tx(token.address, encodeFunctionData({ abi: ABI, functionName: 'confidentialTransfer', args: [to, handle, proof] }),
          chainId, `Private ${token.symbol} transfer`),
      ],
    };
  },

  async blob(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const account = addressOpt(opts, 'account');
    const units = confidentialUnits(need(opts, 'amount'));
    const { handle, proof } = await encryptAmount(opts, chainId, token, account, units);
    const blob = encodeBlob(chainId, token.address, handle, proof);
    return { ok: true, action: 'blob', chainId, token: token.symbol, account, blob, length: blob.length };
  },

  async 'send-blob'(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const account = addressOpt(opts, 'account'); // the code is bound to this wallet; enforced on-chain
    const to = addressOpt(opts, 'to');
    if (to === account) throw new UserError('Sending to yourself does nothing');
    if (to === token.address) throw new UserError('Refusing to send tokens to the token contract');
    const { handle, proof } = decodeBlob(need(opts, 'blob'), chainId, token.address);
    return {
      ok: true,
      action: 'send-blob',
      chainId,
      txs: [
        tx(token.address, encodeFunctionData({ abi: ABI, functionName: 'confidentialTransfer', args: [to, handle, proof] }),
          chainId, `Private ${token.symbol} transfer`),
      ],
    };
  },

  async unshield(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const account = addressOpt(opts, 'account');
    const amount = need(opts, 'amount');
    const units = confidentialUnits(amount);
    return {
      ok: true,
      action: 'unshield',
      chainId,
      summary: `Unshield ${amount} ${token.symbol} back to ${token.underlying.symbol} (claimable once decrypted)`,
      txs: [
        tx(token.address, encodeFunctionData({ abi: ABI, functionName: 'unshield', args: [account, account, units] }),
          chainId, `Unshield ${amount} ${token.symbol}`),
      ],
    };
  },

  async claim(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const account = addressOpt(opts, 'account');
    const pc = publicClient(opts, chainId);
    const claims = await read(pc, token.address, 'getUserClaims', [account]);
    const mine = claims.filter((c) => !c.claimed && getAddress(c.to) === account);
    if (mine.length === 0) return { ok: true, action: 'claim', chainId, ready: 0, pending: 0, txs: [] };

    const { client } = await cofheClient(opts, chainId, account);
    const ids = [], amounts = [], proofs = [], notReady = [];
    for (const c of mine) {
      try {
        // Submit the claim `id`; decrypt the burned `ctHash`. unshield made it public
        // (FHE.allowPublic), so no ACP is needed.
        const r = await client
          .decryptForTx(c.ctHash)
          .setChainId(chainId)
          .setAccount(account)
          .set404RetryTimeout(CLAIM_DECRYPT_WAIT_MS)
          .withoutACP()
          .execute();
        ids.push(c.id);
        amounts.push(r.decryptedValue);
        proofs.push(r.signature);
      } catch (e) {
        notReady.push({ id: c.id, reason: e?.code ?? e?.message ?? String(e) });
      }
    }
    if (ids.length === 0) return { ok: true, action: 'claim', chainId, ready: 0, pending: notReady.length, notReady, txs: [] };
    return {
      ok: true,
      action: 'claim',
      chainId,
      ready: ids.length,
      pending: notReady.length,
      ...(notReady.length ? { notReady } : {}),
      txs: [
        tx(token.address, encodeFunctionData({ abi: ABI, functionName: 'claimUnshieldedBatch', args: [ids, amounts, proofs] }),
          chainId, `Claim ${ids.length} unshielded ${token.symbol}`),
      ],
    };
  },

  async balance(opts) {
    const chainId = chainIdOf(opts);
    const token = tokenOf(opts, chainId);
    const account = addressOpt(opts, 'account');
    if (!process.env.FHENIX_BANKR_API_KEY) {
      throw new UserError('Viewing a private balance needs a Bankr API key', API_KEY_HINT);
    }
    const pc = publicClient(opts, chainId);
    const handle = await read(pc, token.address, 'confidentialBalanceOf', [account]);
    if (handle === zeroHash) return { ok: true, action: 'balance', chainId, token: token.symbol, balance: '0' };

    const { FheTypes } = await import('@cofhe/sdk');
    const { ACPScope } = await import('@cofhe/sdk/acps');
    const { client } = await cofheClient(opts, chainId, account);
    // A short-lived self ACP scoped to this one token contract.
    await client.acp.getOrCreateSelfACP(chainId, account, {
      issuer: account,
      name: `bankr-fhenix-private-${token.symbol}`,
      expiration: Math.floor(Date.now() / 1000) + 3600,
      scope: ACPScope.Contract,
      contracts: [token.address],
    });
    const value = await client
      .decryptForView(handle, FheTypes.Uint64)
      .setChainId(chainId)
      .setAccount(account)
      .withACP()
      .execute();
    return { ok: true, action: 'balance', chainId, token: token.symbol, balance: formatUnits(value, CONFIDENTIAL_DECIMALS) };
  },
};

// Pure helpers exported for tests; the CLI below only runs when executed directly.
export { encodeBlob, decodeBlob, confidentialUnits, TOKENS, ABI, EXPLORER, commands, UserError };

const isMain =
  import.meta.main ?? (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()));
if (isMain) {
  try {
    const { cmd, opts } = parseArgs(process.argv.slice(2));
    const fn = Object.hasOwn(commands, cmd) ? commands[cmd] : undefined;
    if (!fn) throw new UserError(`Unknown command: ${cmd ?? '(none)'}`, `Commands: ${Object.keys(commands).join(', ')}`);
    out(await fn(opts));
  } catch (e) {
    out({ ok: false, error: e.message, ...(e.hint ? { hint: e.hint } : {}) });
    process.exitCode = 1;
  }
}
