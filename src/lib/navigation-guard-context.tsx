'use client';

import React, { createContext, useContext, useRef } from 'react';

export interface NavGuardHandle {
  /** True when the user has entered values but not yet submitted */
  isDirty: boolean;
  /**
   * Attempt to validate and submit the evaluation.
   * Returns true if submission succeeded (navigation may proceed).
   * Returns false if validation failed or submission errored (navigation blocked).
   */
  trySubmit: () => Promise<boolean>;
}

export interface NavigationGuardContextValue {
  /** Pages call this to register or clear their navigation guard */
  registerGuard: (handle: NavGuardHandle | null) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  registerGuard: () => {},
});

export function NavigationGuardProvider({
  children,
  registerGuard,
}: {
  children: React.ReactNode;
  registerGuard: (handle: NavGuardHandle | null) => void;
}) {
  return (
    <NavigationGuardContext.Provider value={{ registerGuard }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}
