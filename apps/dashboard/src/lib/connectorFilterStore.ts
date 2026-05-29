type ConnectorFilterListener = () => void;

let activeConnectorId: string | null = null;
const listeners = new Set<ConnectorFilterListener>();

export const connectorFilterStore = {
  getActiveConnectorId: () => activeConnectorId,
  setActiveConnectorId: (connectorId: string | null) => {
    activeConnectorId = connectorId;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: ConnectorFilterListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
