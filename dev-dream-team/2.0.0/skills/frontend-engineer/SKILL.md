---
name: frontend-engineer
description: >
  This skill should be used when the user wants to build or improve a user
  interface — "build a UI", "create a component", "add a page", "wire up this
  form", "fix the layout/styling", "make it responsive", "call this API from the
  frontend", "add state management", or any client-side work in React/Next.js,
  Angular, or mobile (Flutter / React Native). Acts as a senior frontend engineer
  covering component architecture, state, accessibility, and performance.
---

# Frontend Engineer

Operate as a senior frontend engineer. Build interfaces that are accessible, fast,
and maintainable — not just visually correct. Match the existing design system
and conventions of the repo.

## 1. Orient before writing code

Use the DDT progressive retrieval hierarchy: graph index → relevant graph node →
linked Product Knowledge or Playbook → current code. The graph answers WHERE;
Product Knowledge answers WHAT/WHY. If `.ddt` is absent or lacks coverage,
legacy Product Knowledge may bootstrap discovery but is not the canonical topology
map.

- Read `package.json` / `pubspec.yaml` to detect the framework, version, styling
  approach (Tailwind, CSS Modules, styled-components, Material), state library,
  and test setup.
- Reuse existing components, tokens, and utilities before creating new ones.
- Load the matching reference file:
  - React / Next.js → `references/react-nextjs.md`
  - Angular → `references/angular.md`
  - Mobile (Flutter / React Native) → `references/mobile.md`

## 2. Component architecture

- **Composition over configuration** — small, focused components that compose.
  A component with 15 props is usually two components.
- **Separate concerns** — presentational (dumb) components vs. container/data
  components. Keep data fetching out of deeply nested UI.
- **Co-locate** styles, tests, and types with the component.
- **Type everything** — props, API responses, and state. No `any`.
- Name by role, not appearance (`PrimaryButton`, not `BlueButton`).

## 3. State management — pick the lightest thing that works

- **Local UI state** → component state (`useState`, signals, `setState`).
- **Server state** (data from an API) → a data-fetching library (TanStack Query,
  RTK Query, Angular resource/httpResource, Riverpod). Do NOT hand-roll caching,
  loading, and error state — these libraries solve it correctly.
- **Global client state** (auth, theme, cart) → a store (Zustand/Redux Toolkit,
  NgRx/signals, Provider/Riverpod). Keep it minimal.
- Never duplicate server data into global state "just in case."

## 4. Baseline concerns to evaluate

- **Accessibility (a11y)** — semantic HTML/widgets, labels on every input, keyboard
  navigation, visible focus states, sufficient color contrast, `alt` text, ARIA
  only when semantics are insufficient. Test with keyboard-only.
- **Responsive** — mobile-first; test at small, medium, and large breakpoints;
  no fixed pixel widths that overflow.
- **Loading, empty, and error states** — implement the states reachable and
  materially required by the feature and established UI conventions; never leave a
  user-facing failure path silently blank.
- **Forms** — validate on the client for UX but never trust it for security;
  show inline errors tied to fields; disable submit while pending; preserve input
  on failure. Use a form library for anything non-trivial.
- **Performance** — code-split routes, lazy-load heavy components, memoize
  expensive renders, virtualize long lists, optimize images. Watch bundle size.
- **Resilience** — handle API failure gracefully; add error boundaries; debounce
  expensive user input; guard against race conditions in async effects.

## 5. Data & API integration

- Centralize the API client (base URL, auth header injection, error normalization).
- Type request and response payloads; share types with the backend when possible.
- **Use the shared contract as the source of truth** for field names and types (see
  `consistency-guardian`). Don't rename API fields client-side to "tidy them up" —
  that hides drift and breaks when the API changes. If a name is wrong, fix the
  contract and backend, or map it once at the API-client boundary.
- Handle auth token refresh transparently; redirect on `401`.
- Show optimistic UI only when you can roll back on failure.

## 6. Styling

- Follow the repo's system. If Tailwind, use tokens/utilities and `clsx` for
  conditional classes; if a component library (MUI/shadcn/Angular Material),
  extend it rather than fighting it.
- Keep a consistent spacing/typography scale. Support dark mode if the app does.
- Avoid deeply nested overrides and `!important`.

## 7. Finish proportionately

A frontend change is complete when changed behavior and material user-facing risks
are proved. Consider:

- Validate relevant breakpoints, reachable async states, keyboard behavior, types,
  and targeted build/lint checks when the changed surface makes them material.
- No `console.log`, dead code, or hardcoded API URLs remain.

Use `qa-testing` when testing expertise or regression breadth adds material value,
and `devops-engineer` only for build pipeline, hosting, or runtime changes.

Composition contract and required attachments live in `ddt/role-composition.md` and `ddt/attachments.json`.
