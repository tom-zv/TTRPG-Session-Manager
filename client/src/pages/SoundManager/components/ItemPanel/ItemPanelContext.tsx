import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define what each panel type needs as props
export interface ItemPanelOptions {
  showFiles?: boolean;
  showMacros?: boolean;
  showCollections?: boolean;
}

interface ItemPanelContextValue {
  // Current panel state
  itemPanelOptions: ItemPanelOptions;
  // Flag indicating if any panel content is currently showing
  isPanelVisible: boolean;
  // Macro panel collapse state
  isMacroPanelCollapsed: boolean;
  // Methods to control the panel
  showItemPanel: (options?: ItemPanelOptions) => void;
  hideItemPanel: () => void;
  updateItemPanelOptions: (options: Partial<ItemPanelOptions>) => void;
  togglePanelVisibility: () => void;
  // Methods to control macro panel collapse state
  collapseMacroPanel: () => void;
  expandMacroPanel: () => void;
  toggleMacroPanel: () => void;
}

// Create the context with default values
const defaultItemPanelOptions = {
  showFiles: true,
  showMacros: true,
  showCollections: false,
};

const ItemPanelContext = createContext<ItemPanelContextValue | null>(null);

// Hook to use the context
export const useItemPanel = () => {
  const context = useContext(ItemPanelContext);
  if (!context) {
    throw new Error("useItemPanel must be used within an ItemPanelProvider");
  }
  return context;
};

// Provider component
interface ItemPanelProviderProps {
  children: ReactNode;
}

export const ItemPanelProvider: React.FC<ItemPanelProviderProps> = ({ children }) => {
  const [itemPanelOptions, setItemPanelOptions] = useState<ItemPanelOptions>(defaultItemPanelOptions);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isMacroPanelCollapsed, setIsMacroPanelCollapsed] = useState(true);

  const togglePanelVisibility = () => {
    setIsPanelVisible(prev => !prev);
  };

  const showItemPanel = (options: ItemPanelOptions = {}) => {
    setItemPanelOptions(options);
  };

  const hideItemPanel = () => {
    setItemPanelOptions({});
  };

  const updateItemPanelOptions = (options: Partial<ItemPanelOptions>) => {
    // Create a new object with all options set to false by default
    const newOptions: ItemPanelOptions = {
      showFiles: false,
      showMacros: false,
      showCollections: false,
    };
    
    // set to true the options that are explicitly provided with true
    Object.keys(options).forEach(key => {
      const typedKey = key as keyof ItemPanelOptions;
      if (options[typedKey] === true) {
        newOptions[typedKey] = true;
      }
    });
    
    setItemPanelOptions(newOptions);
  };

  const collapseMacroPanel = () => {
    setIsMacroPanelCollapsed(true);
  };

  const expandMacroPanel = () => {
    setIsMacroPanelCollapsed(false);
  };

  const toggleMacroPanel = () => {
    setIsMacroPanelCollapsed(prev => !prev);
  };

  return (
    <ItemPanelContext.Provider
      value={{
        itemPanelOptions,
        isPanelVisible,
        isMacroPanelCollapsed,
        showItemPanel,
        hideItemPanel,
        updateItemPanelOptions,
        togglePanelVisibility,
        collapseMacroPanel,
        expandMacroPanel,
        toggleMacroPanel,
      }}
    >
      {children}
    </ItemPanelContext.Provider>
  );
};