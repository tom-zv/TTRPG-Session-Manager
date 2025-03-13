import React from 'react';

interface StatusMessagesProps {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
}

export const StatusMessages: React.FC<StatusMessagesProps> = ({ 
  isLoading, 
  error, 
  isEmpty
}) => {
  if (isLoading) {
    return <div className="loading-indicator">Loading audio items...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (isEmpty) {
    return <div className="empty-state">No audio items found.</div>;
  }

  return null;
};

export default StatusMessages;