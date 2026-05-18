'use server';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  timezone: string;
  status?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProjectPayload {
  name: string;
  slug: string;
  description?: string;
  timezone?: string;
}

/**
 * Fetch all projects for the authenticated user's tenant
 */
export async function getProjects(token: string): Promise<Project[]> {
  try {
    const response = await axios.get(`${API_BASE}/api/v1/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'session-token': token,
      },
      timeout: 10000,
    });

    // Handle response wrapping
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return Array.isArray(response.data.data) ? response.data.data : [];
    }

    return Array.isArray(response.data) ? response.data : [];
  } catch (error: any) {
    console.error('[Projects API] Failed to fetch projects:', error.message);
    throw error;
  }
}

/**
 * Create a new project (superadmin only)
 */
export async function createProject(
  token: string,
  payload: CreateProjectPayload
): Promise<Project> {
  try {
    const response = await axios.post(
      `${API_BASE}/api/v1/projects`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'session-token': token,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    // Handle response wrapping
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return response.data.data as Project;
    }

    return response.data as Project;
  } catch (error: any) {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    const errorMessage = error.response?.data?.error?.message;

    console.error(`[Projects API] Failed to create project: ${status} - ${errorMessage}`);

    // Re-throw with context for the frontend to handle
    const err = new Error(errorMessage || 'Failed to create project');
    (err as any).statusCode = status;
    (err as any).code = errorCode;
    throw err;
  }
}
