/**
 * useConnectorFilter - Global hook for accessing the active connector instance filter
 * 
 * This hook provides centralized access to the currently selected connector store instance
 * that is used for data filtering across all dashboard pages and components.
 * 
 * Usage:
 *   const { connectorInstanceId, connectorLabel } = useConnectorFilter();
 *   
 *   // Use in API calls:
 *   const params = new URLSearchParams();
 *   if (connectorInstanceId && connectorInstanceId !== 'all') {
 *     params.append('connector_instance_id', connectorInstanceId);
 *   }
 */

import { useContext } from 'react';
import { ConnectorPlatformContext } from '../context/ConnectorPlatformContext';

export interface ConnectorFilterResult {
  connectorInstanceId: string | null;
  connectorLabel: string;
  isAllStores: boolean;
  filterParam: Record<string, string>;
  setConnectorInstanceId: (id: string | null) => void;
  connectorSelectionTick?: number;
}

export function useConnectorFilter() {
  const context = useContext(ConnectorPlatformContext);
  
  if (!context) {
    throw new Error('useConnectorFilter must be used within ConnectorPlatformProvider');
  }

  const connectorInstanceId = context.activeConnectorId ?? null;
  const isAllStores = connectorInstanceId === null;
  const connectorLabel = context.selectedStoreLabel || 'All Stores';
  const connectorSelectionTick = (context as any).connectorSelectionTick || 0;

  return {
    connectorInstanceId,
    connectorLabel,
    isAllStores,
    connectorSelectionTick,
    filterParam: connectorInstanceId ? { connector_instance_id: connectorInstanceId } : {},
    setConnectorInstanceId: context.setActiveConnector,
  };
}
