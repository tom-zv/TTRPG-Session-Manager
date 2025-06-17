import React from "react";
import AudioApi from "src/pages/SoundManager/api/AudioApi.js";
import { VscSync } from "react-icons/vsc";

interface FileScanButtonProps {
  onScanComplete?: () => Promise<void>;
}

const FileScanButton: React.FC<FileScanButtonProps> = ({ onScanComplete }) => {
  const handleScanClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering folder click
    const res = await AudioApi.scanAudioLibrary();
    
    // Call the callback to trigger data refresh if provided
    if (onScanComplete && res.success) {
      await onScanComplete();
    }
  };

  return (
    <button className="icon-button scan-button" onClick={handleScanClick}
      title="Scan for new files"
    >
      <VscSync />
    </button>
  );
};

export default FileScanButton;
