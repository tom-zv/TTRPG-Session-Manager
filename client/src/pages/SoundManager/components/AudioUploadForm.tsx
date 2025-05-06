import React, { useState } from 'react';
import { uploadAudioFile } from '../api/fileApi.js';
import Form, { FormField, FieldError } from '../../../components/Form/Form.js';

interface AudioUploadFormProps {
  onUploadSuccess: () => void;
  preselectedFolder?: number;
}

const AudioUploadForm: React.FC<AudioUploadFormProps> = ({ 
  onUploadSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'music' | 'sfx' | 'ambience'>('music');
  const [fileUrl, setFileUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[] | null>(null);

  const validateForm = (): boolean => {
    const errors: FieldError[] = [];
    
    // Validate title
    if (!title.trim()) {
      errors.push({
        fields: 'title',
        message: 'Title is required'
      });
    }

    // Validate file or URL is provided
    if (!file && !fileUrl) {
      errors.push({
        fields: ['file', 'fileUrl'],
        message: 'Please provide either a file to upload or a URL'
      });
    }

    if (errors.length > 0) {
      setFieldErrors(errors);
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors(null);
    
    if (!validateForm()) {
      return;
    }

    setIsUploading(true);

    try {
      await uploadAudioFile(
        {
          name: name,
          audioType: type,
          fileUrl: fileUrl || undefined
        },
        file || undefined
      );
      
      // Reset form
      setTitle('');
      setType('music');
      setFileUrl('');
      setFile(null);
      
      // Notify parent component
      onUploadSuccess();
    } catch (err: any) {
      // Check for specific error responses from API
      if (err.response && err.response.data && err.response.data.fields) {
        // Map API error response to our FieldError format
        const apiError: FieldError = {
          fields: err.response.data.fields,
          message: err.response.data.message || 'Invalid input'
        };
        setFieldErrors([apiError]);
      } else {
        setError('Failed to upload audio file. Please try again.');
        console.error(err);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const clearFieldErrors = () => {
    setFieldErrors(null);
    setError(null);
  };

  const formFields: FormField[] = [
    {
      id: 'title',
      label: 'Title',
      type: 'text',
      value: title,
      onChange: setTitle,
      required: true
    },
    {
      id: 'type',
      label: 'Type',
      type: 'select',
      value: type,
      onChange: setType,
      options: [
        { value: 'music', label: 'Music' },
        { value: 'sfx', label: 'Sound Effect' },
        { value: 'ambience', label: 'Ambience' }
      ]
    },
    {
      id: 'file',
      label: 'Audio File',
      type: 'file',
      value: file,
      onChange: setFile,
      accept: 'audio/*'
    },
    {
      id: 'fileUrl',
      label: 'Audio URL',
      type: 'url',
      value: fileUrl,
      onChange: setFileUrl,
      placeholder: 'https://example.com/audio.mp3'
    }
  ];

  return (
    <div className="audio-upload-form">
      <Form
        fields={formFields}
        onSubmit={handleSubmit}
        submitLabel="Upload Audio"
        isSubmitting={isUploading}
        error={error}
        className="upload-form"
        fieldErrors={fieldErrors}
        onClearErrors={clearFieldErrors}
      />
    </div>
  );
};

export default AudioUploadForm;
