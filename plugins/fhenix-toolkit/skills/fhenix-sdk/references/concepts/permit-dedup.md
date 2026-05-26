# Permit dedup — avoiding multiple wallet popups

## What

`getOrCreateSelfPermit` is idempotent at the result level — if a valid permit exists, it returns it without re-signing. But if two callers invoke it **concurrently** with no existing permit, they both fall through to the sign-new-permit path. Each triggers a wallet popup. The user sees two prompts back-to-back. They close one, both promises reject, and your app is in a broken state.

This pattern is especially common with React 18 strict mode (effects run twice in dev) and TanStack Query (concurrent `queryFn` invocations).

## The pattern — ref-deduped promise

Store an in-flight promise in a ref. All callers `await` the same promise; only one wallet popup fires.

```typescript
const permitPromiseRef = useRef<Promise<void> | null>(null);
const [permitVersion, setPermitVersion] = useState(0);

const ensurePermit = useCallback(async () => {
  if (!cofheClient) return;

  // If a permit creation is already in flight, await the same promise
  if (permitPromiseRef.current) {
    await permitPromiseRef.current;
    return;
  }

  // Otherwise start one and stash the promise
  permitPromiseRef.current = cofheClient.permits.getOrCreateSelfPermit(
    undefined,
    undefined,
    {
      issuer: address,
      name: 'myapp',
      expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    }
  )
    .then(() => {
      setPermitVersion((v) => v + 1);  // re-render dependents
    })
    .finally(() => {
      permitPromiseRef.current = null; // clear regardless of success/failure
    });

  await permitPromiseRef.current;
}, [cofheClient, address]);
```

### Why a ref, not a piece of state?

`useState` would cause a re-render between "we started" and "we await," opening a window for a second caller to see `null` and start its own creation. `useRef` is synchronous: the ref is set before the next line runs.

## Pair with `permitVersion`

The dedup pattern hides permit creation behind a single promise — but consumers (other hooks that read `getActivePermit()`) won't re-run on completion unless something tells them to. The `permitVersion` counter is that signal:

```typescript
// Bump after any permit mutation (create, remove, swap active)
setPermitVersion((v) => v + 1);

// Consumers depend on permitVersion so they re-read the client state
useEffect(() => {
  void permitVersion; // referenced for the dep list
  const active = cofheClient.permits.getActivePermit();
  // ...
}, [permitVersion]);
```

Put the version in a global store (Zustand) if multiple unrelated trees need to react.

## When the user closes the wallet popup

The promise rejects; the ref clears in `.finally`. The next caller starts a *new* creation. That's usually correct — the user denied once, but the app should be willing to ask again on their next explicit action.

If you want "denied means denied for this session," set a separate piece of state:

```typescript
const [userDeclined, setUserDeclined] = useState(false);

// In the .catch:
.catch((err) => {
  if (err.code === CofheErrorCode.UserRejected) setUserDeclined(true);
  throw err;
})
```

## Gotchas

- **Don't put the ref in a component that unmounts** while the permit is being signed. The ref clears with the component; the next mount starts fresh. Hoist to a provider near the root.
- **The `.finally` clear is critical.** If you only clear on success, a rejected sign locks the ref forever — every subsequent `ensurePermit` await-s a dead promise.
- **`useCallback` deps must include `cofheClient` and `address`.** If they change (chain switch, signer mode change) and the callback isn't refreshed, you'll dedup against the wrong client.
- **React 18 strict mode** invokes effects twice in development. The dedup pattern is what makes this benign — without it, every dev page-load triggers two wallet popups.
- **TanStack Query concurrency** — set `queryClient`'s default `staleTime` high enough that adjacent decrypt queries share a single `ensurePermit` call. Or invoke `ensurePermit` outside the query and gate `enabled` on `isPermitReady`.
