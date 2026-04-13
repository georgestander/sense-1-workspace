export type ThreadMenuState = {
  homeThreadMenuOpenId: string | null;
  sidebarThreadMenuOpenId: string | null;
};

export type ThreadMenuValue = string | null | ((current: string | null) => string | null);
export type ThreadMenuTarget = "home" | "sidebar";

export function createThreadMenuState(): ThreadMenuState {
  return {
    homeThreadMenuOpenId: null,
    sidebarThreadMenuOpenId: null,
  };
}

export function closeThreadMenuState(): ThreadMenuState {
  return createThreadMenuState();
}

export function applyThreadMenuStateUpdate(
  state: ThreadMenuState,
  target: ThreadMenuTarget,
  value: ThreadMenuValue,
): ThreadMenuState {
  const currentValue = target === "sidebar" ? state.sidebarThreadMenuOpenId : state.homeThreadMenuOpenId;
  const nextValue = typeof value === "function" ? value(currentValue) : value;

  if (target === "sidebar") {
    return {
      sidebarThreadMenuOpenId: nextValue,
      homeThreadMenuOpenId: null,
    };
  }

  return {
    sidebarThreadMenuOpenId: null,
    homeThreadMenuOpenId: nextValue,
  };
}
