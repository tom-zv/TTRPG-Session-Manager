import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoginForm from './components/LoginForm.js';
import RegisterForm from './components/RegisterForm.js';
import { useAuth } from 'src/app/contexts/AuthContext.js';
import './AuthPage.css';

const AuthPage: React.FC = () => {
  const [showLoginDialog, setShowLoginDialog] = useState(true);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  // If user is already authenticated, redirect to home
  if (isAuthenticated && !isLoading) {
    return <Navigate to="/" replace />;
  }

  const openLoginDialog = () => {
    setShowRegisterDialog(false);
    setShowLoginDialog(true);
  };

  const openRegisterDialog = () => {
    setShowLoginDialog(false);
    setShowRegisterDialog(true);
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <h1>TTRPG Session Manager</h1>
        </div>
        <div className="auth-content">
          <div className="auth-buttons">
            <button 
              className={`btn auth-tab-btn${showLoginDialog ? ' selected' : ''}`} 
              onClick={openLoginDialog}
            >
              Login
            </button>
            <button 
              className={`btn auth-tab-btn${showRegisterDialog ? ' selected' : ''}`} 
              onClick={openRegisterDialog}
            >
              Register
            </button>
          </div>
          {/* Render forms directly instead of in Dialog */}
          {showLoginDialog && (
            <div className="auth-form-wrapper">
              <h2 className="auth-form-title">Login to Your Account</h2>
              <LoginForm onRegisterClick={openRegisterDialog} />
            </div>
          )}
          {showRegisterDialog && (
            <div className="auth-form-wrapper">
              <h2 className="auth-form-title">Create New Account</h2>
              <RegisterForm 
                onLoginClick={openLoginDialog} 
                onSuccess={() => {
                  setShowRegisterDialog(false);
                  setShowLoginDialog(true);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;