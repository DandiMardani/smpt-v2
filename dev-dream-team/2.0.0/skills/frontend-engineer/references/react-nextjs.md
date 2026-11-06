# React / Next.js — Senior Defaults

## Stack choices

- **Framework**: Next.js (App Router) for anything needing routing, SSR/SSG, or
  SEO; Vite + React for pure SPAs.
- **Language**: TypeScript `strict`. Function components + hooks only.
- **Server state**: TanStack Query (SPA) or Server Components + `fetch` with
  caching (Next App Router).
- **Client state**: Zustand for simple global state; Redux Toolkit for large,
  complex state with many reducers.
- **Forms**: React Hook Form + Zod resolver.
- **Styling**: Tailwind CSS + shadcn/ui, or CSS Modules. `clsx`/`cva` for variants.
- **Testing**: Vitest + React Testing Library; Playwright for e2e.

## App Router essentials

- **Server Components by default**; add `"use client"` only when you need state,
  effects, or browser APIs. Keep client components at the leaves.
- Fetch data in Server Components / Route Handlers; pass down as props.
- Use `loading.tsx`, `error.tsx`, and `not-found.tsx` for each route segment.
- Mutations via Server Actions or Route Handlers; revalidate with
  `revalidatePath`/`revalidateTag`.
- Keep secrets server-side; only `NEXT_PUBLIC_*` vars reach the browser.

## Patterns that matter

**Data fetching (SPA with TanStack Query):**
```tsx
const { data, isPending, error } = useQuery({
  queryKey: ["orders", filters],
  queryFn: () => api.getOrders(filters),
});
if (isPending) return <OrdersSkeleton />;
if (error) return <ErrorState onRetry={refetch} />;
```

**Typed, validated form:**
```tsx
const schema = z.object({ email: z.string().email(), qty: z.coerce.number().min(1) });
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
```

**Avoid re-render traps:** stable callbacks (`useCallback`) only where they cross
memo boundaries; `useMemo` for genuinely expensive computes; correct `key` on
lists (never array index for dynamic lists); split context to avoid re-rendering
the whole tree.

**Effects:** most data fetching should NOT live in `useEffect` — use a query
library or Server Components. If you do use effects, clean up subscriptions and
guard against stale responses (ignore flag / AbortController).

## Performance

- `next/image` for images; `next/font` for fonts.
- `dynamic(() => import(...))` / `React.lazy` for heavy client components.
- Virtualize long lists (`@tanstack/react-virtual`).
- Watch bundle size; avoid importing whole libraries for one function.

## Checklist

- [ ] Server/Client component split is intentional; `"use client"` at leaves
- [ ] loading/error/empty states for every async view
- [ ] Forms validated with Zod; accessible labels + inline errors
- [ ] No secrets in client bundle; env vars scoped correctly
- [ ] Keys stable, memoization only where measured
- [ ] RTL tests for behavior, not implementation
