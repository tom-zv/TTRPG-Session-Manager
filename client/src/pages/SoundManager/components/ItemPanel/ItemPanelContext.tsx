import React, { createContext, useState, useContext, ReactNode } from 'react';

// Define what each panel type needs as props
export interface ItemPanelOptions {
  showFiles?: boolean;
  showMacros?: boolean;
  showCollections?: boolean;
  // Add other panel-specific options as needed
}

interface ItemPanelContextValue {
  // Current panel state
  itemPanelOptions: ItemPanelOptions;
  // Flag indicating if any panel content is currently showing
  isItemPanelActive: boolean;
  
  // Methods to control the panel
  showItemPanel: (options?: ItemPanelOptions) => void;
  hideItemPanel: () => void;
  updateItemPanelOptions: (options: Partial<ItemPanelOptions>) => void;
}

// Create the context with default values
const ItemPanelContext = createContext<ItemPanelContextValue>({
  itemPanelOptions: {},
  isItemPanelActive: false,
  showItemPanel: () => {},
  hideItemPanel: () => {},
  updateItemPanelOptions: () => {},
});

// Hook to use the context
export const useItemPanel = () => useContext(ItemPanelContext);

// Provider component
interface ItemPanelProviderProps {
  children: ReactNode;
}

export const ItemPanelProvider: React.FC<ItemPanelProviderProps> = ({ children }) => {
  const [itemPanelOptions, setPanelOptions] = useState<ItemPanelOptions>({}); // Default options

  // Derive isPanelActive from panelOptions
  const isItemPanelActive = Boolean(
    itemPanelOptions.showFiles || 
    itemPanelOptions.showMacros || 
    itemPanelOptions.showCollections
  );

  const showItemPanel = (options: ItemPanelOptions = {}) => {
    setPanelOptions(options);
  };

  const hideItemPanel = () => {
    setPanelOptions({});
  };

  const updateItemPanelOptions = (options: Partial<ItemPanelOptions>) => {
    // Create a new object with all options set to false by default
    const newOptions: ItemPanelOptions = {
      showFiles: false,
      showMacros: false,
      showCollections: false,
    };
    
    //set to true the options that are explicitly provided with true
    Object.keys(options).forEach(key => {
      const typedKey = key as keyof ItemPanelOptions;
      if (options[typedKey] === true) {
        newOptions[typedKey] = true;
      }
    });
    
    setPanelOptions(newOptions);
  };

  return (
    <ItemPanelContext.Provider
      value={{
        itemPanelOptions,
        isItemPanelActive,
        showItemPanel,
        hideItemPanel,
        updateItemPanelOptions
      }}
    >
      {children}
    </ItemPanelContext.Provider>
  );
};