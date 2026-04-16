"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type KioskModeContextValue = {
  kiosk: boolean;
  setKiosk: (value: boolean) => void;
};

const KioskModeContext = createContext<KioskModeContextValue | null>(null);

export function KioskModeProvider({ children }: { children: ReactNode }) {
  const [kiosk, setKioskState] = useState(false);
  const setKiosk = useCallback((value: boolean) => {
    setKioskState(value);
  }, []);
  const value = useMemo(() => ({ kiosk, setKiosk }), [kiosk, setKiosk]);
  return <KioskModeContext.Provider value={value}>{children}</KioskModeContext.Provider>;
}

export function useKioskMode(): KioskModeContextValue {
  const ctx = useContext(KioskModeContext);
  if (!ctx) {
    throw new Error("useKioskMode must be used within KioskModeProvider");
  }
  return ctx;
}
