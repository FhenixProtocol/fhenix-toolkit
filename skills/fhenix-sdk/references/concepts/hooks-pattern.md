# Hook pattern — useCofhe, usePermit, Zustand integration

## What

Fhenix-using dApps consistently decompose the SDK into a handful of React hooks. Following the convention makes code legible across the ecosystem and slots cleanly into wagmi/viem stacks.

## The three canonical hooks

### `useCofhe` — init + connect lifecycle

```
export function useCofhe() {
  const { isConnected, address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const isInitialized = useStore(s => s.isInitialized);
  const setInitialized = useStore(s => s.setInitialized);

  useEffect(() => {
    if (!isConnected || !publicClient || !walletClient) return;
    cofheClient.connect(publicClient, walletClient);
    setInitialized(true);
  }, [isConnected, publicClient, walletClient, chainId, address]);

  return { cofheClient, isInitialized };
}
```

### `usePermit` — permit lifecycle

```
export function usePermit() {
  const { address } = useAccount();
  const { isInitialized } = useCofhe();
  const permitVersion = useStore(s => s.permitVersion);
  const bumpPermitVersion = useStore(s => s.bumpPermitVersion);

  const ensure = useCallback(async () => {
    if (!isInitialized || !address) return null;
    const permit = await cofheClient.permits.getOrCreateSelfPermit(
      undefined,
      undefined,
      {
        issuer: address,
        name: 'myapp',
        expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      }
    );
    bumpPermitVersion();
    return permit;
  }, [address, isInitialized, bumpPermitVersion]);

  const remove = useCallback((hash: string) => {
    cofheClient.permits.removePermit(hash);
    bumpPermitVersion();
  }, [bumpPermitVersion]);

  const active = useMemo(() => {
    void permitVersion;
    return isInitialized ? cofheClient.permits.getActivePermit() : null;
  }, [permitVersion, isInitialized]);

  return { ensure, remove, active };
}
```

### `useDecrypt<flavor>` — task-specific, one per use case

Example for `decryptForView`:

```
export function useDecryptedBalance(ctHash: bigint | undefined) {
  const { isInitialized } = useCofhe();
  const { ensure } = usePermit();
  return useQuery({
    queryKey: ['cofhe-balance', ctHash?.toString()],
    enabled: isInitialized && !!ctHash,
    queryFn: async () => {
      await ensure();
      const { decryptedValue } = await cofheClient
        .decryptForView(ctHash!, FheTypes.Uint64)
        .execute();
      return decryptedValue;
    },
  });
}
```

## Zustand store shape (boilerplate)

```
import { create } from 'zustand';

interface CofheStore {
  isInitialized: boolean;
  setInitialized: (v: boolean) => void;
  permitVersion: number;
  bumpPermitVersion: () => void;
}

export const useStore = create<CofheStore>(set => ({
  isInitialized: false,
  setInitialized: (v) => set({ isInitialized: v }),
  permitVersion: 0,
  bumpPermitVersion: () => set(s => ({ permitVersion: s.permitVersion + 1 })),
}));
```

## Canonical examples

- **Equle — clean hook decomposition.**
  https://github.com/FhenixProtocol/miniapp-equle
  → `packages/cofhe-nextjs/src/app/hooks/{useCofhe,usePermit,useGuessSubmission,useDecryptEquation}.ts`

- **Shielded stablecoin — minimal init + permit.**
  https://github.com/FhenixProtocol/poc-shielded-stablecoin
  → `packages/nextjs/hooks/{useCofhe,usePermit}.ts`

## Gotchas

- **`useEffect` dep list must include all wagmi state** that affects connect (chainId, address, walletClient). Missing deps cause stale clients.
- **TanStack Query's `enabled`** is the cleanest way to gate decrypt calls on init readiness.
- **Don't call `ensure()` on every render** — use `useCallback` or trigger from user actions only.
- **Avoid concurrent `ensure()` calls** for the same permit name — they race and one wins. If you must, deduplicate with a singleton promise.
- **Server Components can't import the SSR-unsafe client** — gate the hooks behind a `'use client'` boundary in Next.js App Router.
