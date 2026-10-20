// Offline tests for the fhenix-private helper. Run: cd bankr && bun install && bun test
import { describe, expect, test } from 'bun:test';
import { decodeFunctionData, getAddress } from 'viem';
import { encodeBlob, decodeBlob, confidentialUnits, TOKENS, ABI, commands } from '../fhenix-private/scripts/fhenix.mjs';

const ARB = 42161;
const FUSDC_ARB = TOKENS[ARB].fUSDC.address;
const HANDLE = '0x' + 'ab'.repeat(32);
const PROOF = '0x' + 'cd'.repeat(65);

describe('confidentialUnits', () => {
  test('parses up to 6 decimals', () => {
    expect(confidentialUnits('1')).toBe(1_000_000n);
    expect(confidentialUnits('0.000001')).toBe(1n);
    expect(confidentialUnits('2.5')).toBe(2_500_000n);
  });
  test('rejects bad input', () => {
    for (const bad of ['0', '0.0', '-1', '1e3', '1,5', '', 'abc', '1.1234567']) {
      expect(() => confidentialUnits(bad)).toThrow();
    }
  });
  test('rejects values above uint64', () => {
    expect(() => confidentialUnits('18446744073709.551616')).toThrow(/uint64/);
    expect(confidentialUnits('18446744073709.551615')).toBe((1n << 64n) - 1n);
  });
});

describe('fhe: codes', () => {
  test('round-trips', () => {
    const blob = encodeBlob(ARB, FUSDC_ARB, HANDLE, PROOF);
    expect(blob.startsWith('fhe:')).toBe(true);
    expect(blob.length).toBeLessThan(160);
    expect(decodeBlob(blob, ARB, FUSDC_ARB)).toEqual({ handle: HANDLE, proof: PROOF });
  });
  test('tolerates surrounding whitespace', () => {
    const blob = encodeBlob(ARB, FUSDC_ARB, HANDLE, PROOF);
    expect(decodeBlob(`  ${blob}\n`, ARB, FUSDC_ARB).handle).toBe(HANDLE);
  });
  test('refuses another token', () => {
    const blob = encodeBlob(ARB, FUSDC_ARB, HANDLE, PROOF);
    expect(() => decodeBlob(blob, ARB, TOKENS[ARB].fUSDT.address)).toThrow(/different token/);
  });
  test('refuses another chain, even when the address is the same', () => {
    // Every wrapper has the same address on Arbitrum and Ethereum.
    const shared = TOKENS[ARB].fUSDC.address;
    expect(getAddress(TOKENS[1].fUSDC.address)).toBe(getAddress(shared));
    const blob = encodeBlob(ARB, shared, HANDLE, PROOF);
    expect(() => decodeBlob(blob, 1, shared)).toThrow(/chain 42161/);
  });
  test('refuses malformed codes', () => {
    const good = encodeBlob(ARB, FUSDC_ARB, HANDLE, PROOF);
    expect(() => decodeBlob(good.slice(4), ARB, FUSDC_ARB)).toThrow(/fhe:/);
    expect(() => decodeBlob('fhe:abc$', ARB, FUSDC_ARB)).toThrow(/base64url/);
    expect(() => decodeBlob(good.slice(0, 60), ARB, FUSDC_ARB)).toThrow(/too short/);
    const bytes = Buffer.from(good.slice(4), 'base64url');
    bytes[0] = 2;
    expect(() => decodeBlob('fhe:' + bytes.toString('base64url'), ARB, FUSDC_ARB)).toThrow(/version/);
  });
  test('refuses an empty handle', () => {
    const blob = encodeBlob(ARB, FUSDC_ARB, '0x' + '00'.repeat(32), PROOF);
    expect(() => decodeBlob(blob, ARB, FUSDC_ARB)).toThrow(/empty handle/);
  });
});

describe('pinned tokens', () => {
  test('every entry is consistent', () => {
    for (const [chain, toks] of Object.entries(TOKENS)) {
      for (const [sym, t] of Object.entries(toks)) {
        expect(getAddress(t.address)).toBe(t.address);
        expect(getAddress(t.underlying.address)).toBe(t.underlying.address);
        expect(t.rate).toBe(10n ** BigInt(t.underlying.decimals - 6));
        expect(sym.startsWith('f')).toBe(true);
        expect(Number(chain)).toBeOneOf([1, 42161]);
      }
    }
  });
});

describe('commands that need no network', () => {
  test('send-blob builds confidentialTransfer(to, handle, proof)', async () => {
    const blob = encodeBlob(ARB, FUSDC_ARB, HANDLE, PROOF);
    const to = '0x1111111111111111111111111111111111111111';
    const r = await commands['send-blob']({ token: 'fusdc', blob, to, account: '0x2222222222222222222222222222222222222222' });
    expect(r.ok).toBe(true);
    expect(r.txs).toHaveLength(1);
    expect(r.txs[0].to).toBe(FUSDC_ARB);
    expect(r.txs[0].value).toBe('0');
    const d = decodeFunctionData({ abi: ABI, data: r.txs[0].data });
    expect(d.functionName).toBe('confidentialTransfer');
    expect(d.args).toEqual([getAddress(to), HANDLE, PROOF]);
  });
  test('unshield builds unshield(account, account, units)', async () => {
    const account = '0x2222222222222222222222222222222222222222';
    const r = await commands.unshield({ token: 'fUSDC', amount: '0.5', account });
    const d = decodeFunctionData({ abi: ABI, data: r.txs[0].data });
    expect(d.functionName).toBe('unshield');
    expect(d.args).toEqual([getAddress(account), getAddress(account), 500_000n]);
  });
  test('refuses unpinned tokens, unsupported chains and self-sends', async () => {
    const account = '0x2222222222222222222222222222222222222222';
    await expect(commands.unshield({ token: 'eUSDC', amount: '1', account })).rejects.toThrow(/not pinned/);
    await expect(commands.unshield({ token: 'fUSDC', amount: '1', account, chain: '8453' })).rejects.toThrow(/not supported/);
    const blob = encodeBlob(ARB, FUSDC_ARB, HANDLE, PROOF);
    await expect(commands['send-blob']({ token: 'fUSDC', blob, to: account, account })).rejects.toThrow(/yourself/);
    await expect(commands['send-blob']({ token: 'fUSDC', blob, to: FUSDC_ARB, account })).rejects.toThrow(/token contract/);
  });
  test('balance refuses without the API key', async () => {
    const saved = process.env.FHENIX_BANKR_API_KEY;
    delete process.env.FHENIX_BANKR_API_KEY;
    await expect(
      commands.balance({ token: 'fUSDC', account: '0x2222222222222222222222222222222222222222' })
    ).rejects.toThrow(/API key/);
    if (saved !== undefined) process.env.FHENIX_BANKR_API_KEY = saved;
  });
});
