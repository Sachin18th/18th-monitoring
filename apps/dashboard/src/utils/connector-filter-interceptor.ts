/**
 * Axios interceptor configuration for connector-instance-id injection
 * 
 * Automatically adds the connector_instance_id query parameter to all outbound requests
 * when a specific store is selected (not "all").
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export interface ConnectorFilterInterceptorConfig {
  getConnectorInstanceId: () => string | null | undefined;
}

export function setupConnectorFilterInterceptor(
  axiosInstance: AxiosInstance,
  config: ConnectorFilterInterceptorConfig
): void {
  axiosInstance.interceptors.request.use(
    (requestConfig: InternalAxiosRequestConfig) => {
      const connectorInstanceId = config.getConnectorInstanceId?.();

      // Only inject if a specific connector is selected (not 'all' or undefined)
      if (connectorInstanceId && connectorInstanceId !== 'all') {
        // Build params object if it doesn't exist
        if (!requestConfig.params) {
          requestConfig.params = {};
        }

        // Inject the connector_instance_id parameter
        requestConfig.params.connector_instance_id = connectorInstanceId;
      }

      return requestConfig;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
}

/**
 * Helper to build query params with connector filter
 * Usage: const params = buildConnectorParams({ limit: 10 }, connectorInstanceId);
 */
export function buildConnectorParams(
  baseParams: Record<string, any>,
  connectorInstanceId: string | null | undefined
): Record<string, any> {
  const params = { ...baseParams };
  
  if (connectorInstanceId && connectorInstanceId !== 'all') {
    params.connector_instance_id = connectorInstanceId;
  }

  return params;
}
