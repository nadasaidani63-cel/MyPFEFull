import { createContext, useContext, useState, type ReactNode } from "react";

export interface DatacenterInfo {
  id: string;
  name: string;
  location: string;
  status: "normal" | "warning" | "critical";
  nodes: number;
  currentLoad: number;
}

type ConnectStep = 0 | 1 | 2 | 3;

interface DatacenterContextType {
  connectedDC: DatacenterInfo | null;
  connecting: string | null;   // dc.id en cours
  connectStep: ConnectStep;    // 1..3 étapes (0=none)
  connect: (dc: DatacenterInfo) => Promise<void>;
  disconnect: () => void;
}

const DatacenterContext = createContext<DatacenterContextType | null>(null);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function DatacenterProvider({ children }: { children: ReactNode }) {
  const [connectedDC, setConnectedDC] = useState<DatacenterInfo | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectStep, setConnectStep] = useState<ConnectStep>(0);

  const connect = async (dc: DatacenterInfo) => {
    setConnecting(dc.id);
    setConnectStep(1);

    try {
      // (optionnel) reset l'ancien hub pour éviter confusion UI
      setConnectedDC(null);

      await sleep(700);
      setConnectStep(2);

      await sleep(700);
      setConnectStep(3);

      await sleep(700);
      setConnectedDC(dc);
    } finally {
      setConnecting(null);
      setConnectStep(0);
    }
  };

  const disconnect = () => {
    setConnectedDC(null);
    setConnecting(null);
    setConnectStep(0);
  };

  return (
    <DatacenterContext.Provider value={{ connectedDC, connecting, connectStep, connect, disconnect }}>
      {children}
    </DatacenterContext.Provider>
  );
}

export function useDatacenter() {
  const ctx = useContext(DatacenterContext);
  if (!ctx) throw new Error("useDatacenter must be used within DatacenterProvider");
  return ctx;
}