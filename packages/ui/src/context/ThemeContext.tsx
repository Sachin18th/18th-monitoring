import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    const initialTheme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';

    setTheme(initialTheme);
    setMounted(true);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next === 'dark');
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      }
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted }}>
      {/* 
        We avoid applying the theme attribute on the server to prevent hydration mismatches.
        The useEffect will handle the initial theme application on the client.
      */}
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
