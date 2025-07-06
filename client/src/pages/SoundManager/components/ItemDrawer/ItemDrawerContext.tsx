import React, { createContext, useContext, useState, ReactNode } from 'react';

// Provider component
interface ItemDrawerProviderProps {
  children: ReactNode;
}

interface ItemDrawerContextValue {
  isDrawerVisible: boolean;
  showItemDrawer: () => void;
  hideItemDrawer: () => void;
}

const ItemDrawerContext = createContext<ItemDrawerContextValue | null>(null);

export const ItemDrawerProvider: React.FC<ItemDrawerProviderProps> = ({ children }) => {
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);

  const showItemDrawer = () => setIsDrawerVisible(true);
  const hideItemDrawer = () => setIsDrawerVisible(false);

  return (
    <ItemDrawerContext.Provider value={{ isDrawerVisible, showItemDrawer, hideItemDrawer }}>
      {children}
    </ItemDrawerContext.Provider>
  );
};

export const useItemDrawer = () => {
  const context = useContext(ItemDrawerContext);
  if (!context) {
    throw new Error("useItemDrawer must be used within an ItemDrawerProvider");
  }
  return context;
};