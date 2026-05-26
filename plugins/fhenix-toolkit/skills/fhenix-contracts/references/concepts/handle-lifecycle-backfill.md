# Handle-lifecycle backfill — re-granting at scale

## What

`allow-cascade.md` covers the per-op rule: every encrypted op produces a fresh handle, and any stored handle needs `FHE.allowThis` plus per-address `FHE.allow` calls.

This file covers what happens **at scale**, when that rule meets reality:

- A storage slot is reassigned to a new handle and the *whole authorized set* (not just the writer) must be re-granted.
- A new principal joins the authorized set after handles already exist.
- An external contract (FHERC20) holds handles that change on every transfer — your contract never sees the new handle until the holder reads it.

## Pattern 1 — factor grants into a helper

When a handle has multiple authorized addresses, every write path that reassigns the slot must re-grant **all** of them. Duplicate code drifts. Factor into a helper and call from every write site:

```solidity
function _allowSalaryToAuthorizedSet(euint64 salary, uint256 tokenId) internal {
    FHE.allowThis(salary);
    FHE.allow(salary, _employees[tokenId].walletAddress);
    FHE.allow(salary, decryptor);
    FHE.allow(salary, owner);
    for (uint256 i = 0; i < _tierMembers.length; i++) {
        FHE.allow(salary, _tierMembers[i]);
    }
}

function createEmployee(uint256 tokenId, InEuint64 calldata encSalary) external {
    euint64 salary = FHE.asEuint64(encSalary);
    _employees[tokenId].monthlySalary = salary;
    _allowSalaryToAuthorizedSet(salary, tokenId);
}

function updateSalary(uint256 tokenId, InEuint64 calldata encSalary) external {
    euint64 salary = FHE.asEuint64(encSalary);    // fresh handle
    _employees[tokenId].monthlySalary = salary;
    _allowSalaryToAuthorizedSet(salary, tokenId); // same call, every write path
}
```

If `updateSalary` forgets the helper, the tier members silently lose access on the next salary write. The contract still compiles; the bug surfaces only when a tier member tries to decrypt.

## Pattern 2 — backfill when the authorized set grows

A new authorized address has zero grants on any handle written before they joined. Backfill at assignment:

```solidity
function assignTier(address member, uint8 level) external onlyOwner {
    bool isNewMember = (memberTier[member] == 0);
    if (isNewMember) _tierMembers.push(member);
    memberTier[member] = level;

    if (isNewMember) {
        for (uint256 id = 0; id < nextTokenId; id++) {
            // O(N) admin cost — fine for small authorized sets,
            // not fine for an "authorized set" that's actually a user base.
            FHE.allow(_employees[id].monthlySalary, member);
        }
    }
}
```

The O(N) loop is gas-bound. Pick the authorized set size accordingly — this scales for tier admins / company-internal roles, not for "every user."

## Pattern 3 — external mutable handles (FHERC20)

Balances inside an FHERC20 contract change on every `confidentialTransfer`. Each transfer produces a **fresh balance handle** that the FHERC20 contract `allowThis`'s (and possibly `allowSender`'s) — but nothing else.

If a third contract (e.g. a treasury, a payroll contract) holds FHERC20 balance and wants other addresses to decrypt it, **prior grants are worthless after any transfer**. Expose a re-grant function that an authorized caller invokes before each decrypt:

```solidity
function grantBalanceAccess() external onlyTierMember returns (bytes32) {
    euint64 balanceHandle = pUSD.confidentialBalanceOf(address(this));
    if (euint64.unwrap(balanceHandle) == bytes32(0)) return bytes32(0);
    FHE.allow(balanceHandle, owner);
    for (uint256 i = 0; i < _tierMembers.length; i++) {
        FHE.allow(balanceHandle, _tierMembers[i]);
    }
    return euint64.unwrap(balanceHandle);
}
```

The on-chain side is half the pattern. The frontend half:

```typescript
// 1. Call the re-grant tx
const hash = await walletClient.sendTransaction({
  to: companyAddress,
  data: grantBalanceAccessCalldata,
});
await publicClient.waitForTransactionReceipt({ hash });

// 2. Read the current handle (the one just re-granted)
const handle = await publicClient.readContract({
  address: tokenAddress,
  abi: FHERC20_ABI,
  functionName: 'confidentialBalanceOf',
  args: [companyAddress],
});

// 3. Decrypt
await ensurePermit();
const balance = await cofheClient
  .decryptForView(handle, FheTypes.Uint64)
  .withPermit()
  .execute();
```

## The rule

- **One helper, every write path.** Don't trust yourself to remember the authorized set in two places.
- **Backfill at the assignment of new members.** Inline the loop next to `setRole` / `addMember` / `assignTier`.
- **External handles need a re-grant entry point.** If your contract's authorized set wants to decrypt balances held in an FHERC20, the only safe re-grant is on the current handle, called by an authorized address, immediately before the decrypt.

## Gotchas

- **Grants attach to the handle, not the storage slot.** Reassigning a slot to a new handle leaves prior grants orphaned (they remain valid for the old handle, but nothing references it).
- **`grantBalanceAccess()` must be `onlyAuthorized`, not `external`.** Anyone calling it would force your contract to re-grant access to your authorized set — usually fine, but the tx is paid by the caller; gate it to prevent spam.
- **`grantBalanceAccess()` returns the current handle so the frontend doesn't have to re-read** — minor latency win, optional.
- **Backfill loops are administrative.** They're called once per new member, not on the hot path. Don't try to micro-optimize.
- **`allowTransient` does not help here.** The decrypt happens in a separate transaction from the grant; transient ACL bits are gone before the SDK queries them. Use persistent `FHE.allow`.
