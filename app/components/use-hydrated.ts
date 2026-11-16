import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false — поки React гідратує серверний HTML, true — після цього.
 *
 * Потрібен для даних, яких немає на сервері (кошик з localStorage):
 * компонент у межі <Suspense> гідратується пізніше за решту сторінки,
 * і до того часу кошик уже прочитано. Якщо одразу показати його вміст,
 * HTML не збігається з серверним — помилка гідратації (React #418).
 * useSyncExternalStore під час гідратації завжди повертає «серверне» значення.
 */
export const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
