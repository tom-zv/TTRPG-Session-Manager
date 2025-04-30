import { useState, useCallback, useEffect, RefObject } from "react";
import { ImperativePanelHandle } from "react-resizable-panels";

interface PanelMeasurements {
  itemHeight: number;
  headerHeight: number;
  panelGroupHeight: number;
}

export function usePlaylistPanelSizeCalc(
  playlistCount: number,
  panelRef: RefObject<ImperativePanelHandle>
) {
  const [measurements, setMeasurements] = useState<PanelMeasurements>({
    itemHeight: 40, // Default fallback values
    headerHeight: 42,
    panelGroupHeight: window.innerHeight - 40
  });

  // Measure actual DOM elements after render
  useEffect(() => {
    const updateMeasurements = () => {
      const panelGroup = document.querySelector('.sound-manager .sound-manager-left-panel > div');
      const playlistHeader = document.querySelector('.sound-manager .playlist-panel .panel-header');
      const playlistItem = document.querySelector('.sound-manager .audio-item-row');
      
      const newMeasurements = { ...measurements };
      if (panelGroup instanceof HTMLElement) {
        newMeasurements.panelGroupHeight = panelGroup.getBoundingClientRect().height;
      } else {
        newMeasurements.panelGroupHeight = window.innerHeight - 40; 
      }
      
      if (playlistHeader instanceof HTMLElement) {
        newMeasurements.headerHeight = playlistHeader.getBoundingClientRect().height;
      }
      
      if (playlistItem instanceof HTMLElement) {
        newMeasurements.itemHeight = playlistItem.getBoundingClientRect().height;
      }
      
      setMeasurements(newMeasurements);
    };

    // Initial measurement
    updateMeasurements();

    // Handle window resize
    window.addEventListener('resize', updateMeasurements);
    
    // Use ResizeObserver for more accurate measurements
    const resizeObserver = new ResizeObserver(updateMeasurements);
    const panelGroup = document.querySelector('.sound-manager .sound-manager-left-panel > div');
    if (panelGroup) resizeObserver.observe(panelGroup);
    
    return () => {
      window.removeEventListener('resize', updateMeasurements);
      resizeObserver.disconnect();
    };
  }, []);

  // Function to calculate ideal size based on playlist count and measured dimensions
  const calculatePlaylistPanelSize = useCallback(() => {
    const { itemHeight, headerHeight, panelGroupHeight } = measurements;
    
    // Calculate percentage needed for all playlists
    const neededPercentage = 
      ((playlistCount * itemHeight + headerHeight +5 ) / panelGroupHeight) * 100;  // +5 for margin, preventing scrollbar

    // Ensure percentage stays within reasonable bounds
    return Math.max(10, Math.min(neededPercentage, 40));
  }, [playlistCount, measurements]);

  // Apply the calculated size whenever it changes
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.resize(calculatePlaylistPanelSize());
    }
  }, [calculatePlaylistPanelSize, panelRef]);

  return {
    calculatePlaylistPanelSize
  };
}