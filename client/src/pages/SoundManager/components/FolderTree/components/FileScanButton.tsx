import React from "react";
import AudioApi from "src/pages/SoundManager/api/AudioApi.js";

interface FileScanButtonProps {
  onScanComplete?: () => void;
}

const FileScanButton: React.FC<FileScanButtonProps> = ({ onScanComplete }) => {
  const handleScanClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering folder click
    await AudioApi.initiateScan();
    
    // Call the callback to trigger data refresh if provided
    if (onScanComplete) {
      onScanComplete();
    }
  };

  return (
    <button className="scan-button" onClick={handleScanClick}>
      Scan
    </button>
  );
};

export default FileScanButton;