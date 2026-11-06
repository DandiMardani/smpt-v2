# Angular — Senior Defaults

## Stack choices

- **Angular**: latest stable. Use **standalone components** (no NgModules for new
  code) and the **signals** API for reactive state.
- **Language**: TypeScript `strict`; the CLI enforces structure — lean on it.
- **State**: signals for local/component state; NgRx SignalStore or a service +
  signals for shared state. Full NgRx (Store/Effects) only for large apps with
  complex async flows.
- **Data**: `HttpClient`; `httpResource`/`resource` (modern) or RxJS operators
  for streams. TanStack Query has an Angular adapter if preferred.
- **Forms**: Reactive Forms (typed) — not template-driven for anything real.
- **Styling**: Angular Material / CDK, or Tailwind. Component-scoped styles.
- **Testing**: Jasmine/Karma (default) or Jest; Playwright/Cypress for e2e.

## Patterns that matter

**Standalone component with signals:**
```ts
@Component({
  selector: "app-orders",
  standalone: true,
  imports: [OrderCardComponent],
  template: `
    @if (orders.isLoading()) { <app-spinner /> }
    @else if (orders.error()) { <app-error (retry)="orders.reload()" /> }
    @else { @for (o of orders.value(); track o.id) { <app-order-card [order]="o" /> } }
  `,
})
export class OrdersComponent {
  private api = inject(OrderService);
  orders = this.api.list(); // resource() returning signal state
}
```

**Typed Reactive Form:**
```ts
form = this.fb.nonNullable.group({
  email: ["", [Validators.required, Validators.email]],
  qty: [1, [Validators.required, Validators.min(1)]],
});
```

**Use the new control flow** (`@if`, `@for` with `track`, `@switch`) instead of
`*ngIf`/`*ngFor`. Always provide `track` in `@for`.

**Dependency injection** via `inject()`; keep components thin and push logic into
services. Prefer `OnPush` (or signals, which are OnPush-friendly) change
detection.

**RxJS discipline:** `takeUntilDestroyed()` to auto-unsubscribe; use `async` pipe
or `toSignal()` rather than manual `subscribe` in components; `switchMap` for
cancellable request chains.

## Performance

- `OnPush` change detection everywhere; signals to avoid over-checking.
- Lazy-load routes with `loadComponent`/`loadChildren`.
- `@defer` blocks for below-the-fold / heavy components.
- `trackBy`/`track` on lists; virtual scroll (CDK) for long lists.

## Checklist

- [ ] Standalone components + signals; new control flow (`@if`/`@for` with track)
- [ ] Typed Reactive Forms with validators + inline errors
- [ ] `OnPush`; subscriptions cleaned up (`takeUntilDestroyed`/`async` pipe)
- [ ] Routes lazy-loaded; heavy UI behind `@defer`
- [ ] Logic in services, components thin; `inject()` for DI
- [ ] a11y: Material a11y/CDK, labels, focus management
