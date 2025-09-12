import React, { createContext, useContext, useEffect, useState } from 'react';

export type UILayoutType = 'current' | 'compact' | 'glass' | 'classic' | 'minimal' | 'gaming';

interface UILayoutContextType {
  layout: UILayoutType;
  setLayout: (layout: UILayoutType) => void;
}

const UILayoutContext = createContext<UILayoutContextType | undefined>(undefined);

export const useUILayout = () => {
  const context = useContext(UILayoutContext);
  if (!context) {
    throw new Error('useUILayout must be used within a UILayoutProvider');
  }
  return context;
};

export const UILayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [layout, setLayoutState] = useState<UILayoutType>('current');

  useEffect(() => {
    const stored = localStorage.getItem('uiLayout');
    if (stored && ['current', 'compact', 'glass', 'classic', 'minimal', 'gaming'].includes(stored)) {
      setLayoutState(stored as UILayoutType);
    }
  }, []);

  const setLayout = (newLayout: UILayoutType) => {
    setLayoutState(newLayout);
    localStorage.setItem('uiLayout', newLayout);
    
    // Apply layout-specific CSS classes to body
    document.body.className = document.body.className
      .replace(/layout-\w+/g, '') + ` layout-${newLayout}`;
  };

  useEffect(() => {
    document.body.className = document.body.className
      .replace(/layout-\w+/g, '') + ` layout-${layout}`;
  }, [layout]);

  return (
    <UILayoutContext.Provider value={{ layout, setLayout }}>
      <div className={`layout-${layout}`}>
        {children}
      </div>
    </UILayoutContext.Provider>
  );
};