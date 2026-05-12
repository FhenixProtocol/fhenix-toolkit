# Init — SSR-safe singleton

## What

In an SSR framework like Next.js, the `@cofhe/sdk` client touches browser-only APIs (`window`, `crypto.subtle`, WASM). Instantiating it at module-load time crashes server-rendered pages. The solution: wrap in a Proxy so the actual client lazy-initializes only on first method access — and only in the browser.

## The pattern

```
// services/cofhe-client.ts
import { createCofheConfig, createCofheClient } from '@cofhe/sdk';
import { arbitrumSepolia } from 'wagmi/chains';

let _client: ReturnType<typeof createCofheClient> | null = null;

export const cofheClient = new Proxy(
  {} as ReturnType<typeof createCofheClient>,
  {
    get(_target, prop) {
      if (typeof window === 'undefined') {
        throw new Error('cofheClient is browser-only; do not call from SSR.');
      }
      if (_client === null) {
        const config = createCofheConfig({ chains: [arbitrumSepolia] });
        _client = createCofheClient(config);
      }
      return Reflect.get(_client as object, prop);
    },
  },
);

export function getCofheClient() {
  if (typeof window === 'undefined') throw new Error('browser only');
  return cofheClient;
}
```

In your wallet hook:

```
// hooks/useCofhe.ts
export function useCofhe() {
  const { isConnected, address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isInitialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isConnected || !publicClient || !walletClient) return;
    cofheClient.connect(publicClient, walletClient);
    setInitialized(true);
  }, [isConnected, publicClient, walletClient, chainId, address]);

  return { cofheClient, isInitialized };
}
```

## Canonical examples

- **Shielded stablecoin — full SSR pattern.**
  https://github.com/FhenixProtocol/poc-shielded-stablecoin
  → `packages/nextjs/services/cofhe-client.ts` (Proxy singleton)
  → `packages/nextjs/hooks/useCofhe.ts` (connect-on-wallet-ready)

- **Equle — Zustand-backed init flag.**
  https://github.com/FhenixProtocol/miniapp-equle
  → `packages/cofhe-nextjs/src/app/hooks/useCofhe.ts`

## Gotchas

- **Don't `await createCofheClient(config)`** — it returns synchronously. The async work happens on first `execute()`.
- **`isConnected` from wagmi is stale during initial render.** Track init in a Zustand or `useState` flag rather than depending on `isConnected` alone.
- **`permitVersion` re-render trick** — many apps bump a Zustand counter to force hook re-runs when permits change. See `permits.md`.
- **Don't `connect()` more than necessary.** Re-calling on every chain/account change is fine; calling every render is wasteful.
