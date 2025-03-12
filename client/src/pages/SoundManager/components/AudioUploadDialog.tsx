import React from 'react';
import Dialog from '../../../components/Dialog/Dialog.js';

interface AudioUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const AudioUploadDialog: React.FC<AudioUploadDialogProps> = ({ 
  isOpen, 
  onClose, 
  children 
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Audio"
    >
      {children}
    </Dialog>
  );
};

export default AudioUploadDialog;
