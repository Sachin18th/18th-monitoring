'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface User {
    id: string;
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'CUSTOMER';
    status: 'active' | 'suspended';
    assignedProjects: string[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    currentProject: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    setProject: (id: string) => void;
    isLoading: boolean;
    apiFetch: (url: string, options?: any) => Promise<any>;
    outageStatus: 'none' | 'stale' | 'expired';
    lastUpdated: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [currentProject, setCurrentProject] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [outageStatus, setOutageStatus] = useState<'none' | 'stale' | 'expired'>('none');
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const router = useRouter();

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    useEffect(() => {
        const storedToken = localStorage.getItem('session-token');
        const storedUser = localStorage.getItem('session-user');
        const storedProject = localStorage.getItem('current-project');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            setCurrentProject(storedProject || null);
        }
        setIsLoading(false);
    }, []);

    const logout = React.useCallback(() => {
        setToken(null);
        setUser(null);
        setCurrentProject(null);
        localStorage.clear();
        router.push('/login');
    }, [router]);

    const apiFetch = React.useCallback(async (url: string, options: any = {}) => {
        const fetchUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
        const activeToken = token || localStorage.getItem('session-token');
        const cacheKey = `api_cache_${url.replace(/\W/g, '_')}`;

        const headers = {
            ...options.headers,
            'Authorization': activeToken ? `Bearer ${activeToken}` : '',
            'session-token': activeToken || ''
        };
        
        try {
            const res = await axios({
                url: fetchUrl,
                method: options.method || 'GET',
                headers,
                data: options.body ? JSON.parse(options.body) : undefined,
                timeout: 5000 
            });

            // Cache Success
            if (options.method === 'GET' || !options.method) {
                const timestamp = new Date().toISOString();
                localStorage.setItem(cacheKey, JSON.stringify({ data: res.data, timestamp }));
                setOutageStatus('none');
                setLastUpdated(timestamp);
            }

            return res.data;
        } catch (error: any) {
             const status = error.response?.status;
             
             if (status === 401) {
                logout();
                throw new Error('Unauthorized');
            }
            
            // Outage / Connectivity Error Handling
            if (!status || status >= 500 || error.code === 'ECONNABORTED') {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const { data, timestamp } = JSON.parse(cached);
                    const ageMs = Date.now() - new Date(timestamp).getTime();
                    const ageHours = ageMs / (1000 * 60 * 60);

                    if (ageHours < 24) {
                        console.warn(`[AuthContext] API Outage. Serving STALE data from ${timestamp}`);
                        if (ageHours > 1) setOutageStatus('stale');
                        setLastUpdated(timestamp);
                        return data;
                    } else {
                        console.error(`[AuthContext] API Outage. Cache EXPIRED (>24h).`);
                        setOutageStatus('expired');
                        return null; // Force empty state on page
                    }
                }
            }

            if (status === 403) {
                router.push('/unauthorized');
                throw new Error('Forbidden');
            }

            throw new Error(error.response?.data?.message || error.message);
        }
    }, [token, API_BASE, router, logout]);

    const setProject = React.useCallback((id: string) => {
        setCurrentProject(id);
        localStorage.setItem('current-project', id);
    }, []);

    const login = React.useCallback(async (email: string, password: string) => {
        try {
            const res = await axios.post(`${API_BASE}/api/v1/auth/login`, { email, password });
            const { token: newToken, user: newUser } = res.data;
            
            setToken(newToken);
            setUser(newUser);
            localStorage.setItem('session-token', newToken);
            localStorage.setItem('session-user', JSON.stringify(newUser));

            if (newUser.assignedProjects.length === 1) {
                setProject(newUser.assignedProjects[0]);
                router.push('/');
            } else {
                router.push('/projects');
            }
        } catch (error: any) {
            throw new Error(error.response?.data?.message || 'Invalid credentials');
        }
    }, [API_BASE, router, setProject]);

    return (
        <AuthContext.Provider value={{ 
            user, token, currentProject, login, logout, setProject, isLoading, apiFetch,
            outageStatus, lastUpdated 
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
