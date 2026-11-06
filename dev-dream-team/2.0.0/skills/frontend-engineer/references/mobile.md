# Mobile — Flutter & React Native

Detect which is in use (`pubspec.yaml` → Flutter; `package.json` with
`react-native`/`expo` → React Native) and follow that section.

## Flutter

- **Language**: Dart, sound null-safety. `flutter_lints` enabled.
- **State**: Riverpod (preferred) or Bloc for larger apps; `setState` only for
  trivial local state.
- **Navigation**: `go_router` for declarative, deep-link-friendly routing.
- **Networking**: `dio` + typed models; `freezed` + `json_serializable` for
  immutable models and unions (great for loading/error/data states).
- **Structure**: feature-first folders (`features/orders/{data,domain,presentation}`).

**Patterns:**
- Build UI as a function of state; represent async as a sealed/union type
  (`AsyncValue` in Riverpod) so loading/error/data are exhaustively handled.
- `const` constructors everywhere possible to cut rebuilds.
- Keep `build()` methods cheap; extract widgets instead of huge nested trees.
- Dispose controllers/streams; avoid rebuilding whole subtrees — scope providers.

```dart
final orders = ref.watch(ordersProvider);
return orders.when(
  loading: () => const CircularProgressIndicator(),
  error: (e, _) => ErrorView(onRetry: () => ref.refresh(ordersProvider)),
  data: (list) => OrderList(list),
);
```

## React Native

- **Toolchain**: Expo for most apps (managed workflow, OTA updates); bare RN only
  when you need custom native modules.
- **Language**: TypeScript `strict`.
- **Navigation**: React Navigation (typed navigators).
- **State/data**: TanStack Query for server state; Zustand for global client state.
- **Styling**: NativeWind (Tailwind) or `StyleSheet.create`.

**Patterns:**
- Same server-state discipline as web — don't hand-roll caching.
- `FlatList`/`FlashList` (never `.map` in a `ScrollView`) for long lists; supply
  `keyExtractor` and `getItemLayout` where possible.
- Memoize list items and callbacks to avoid re-renders.
- Handle platform differences (`Platform.select`) and safe areas.

## Cross-cutting (both)

- **Responsive & adaptive** to screen sizes, orientation, notches/safe areas.
- **Offline & flaky network** — cache, retry, and show clear offline states.
- **Permissions** — request at point of use, handle denial gracefully.
- **Performance** — keep the UI thread free; move heavy work off it; profile with
  the platform tools (Flutter DevTools / RN performance monitor).
- **Accessibility** — semantic labels, dynamic font scaling, sufficient contrast,
  large-enough touch targets (44pt+).

## Checklist

- [ ] Async state handled exhaustively (loading/error/data)
- [ ] Long lists use virtualized list widgets, not scroll + map
- [ ] Controllers/subscriptions disposed; rebuilds/re-renders minimized
- [ ] Offline + error + permission-denied states handled
- [ ] Safe areas and multiple screen sizes tested
- [ ] Accessibility labels and scalable text
