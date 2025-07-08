import React, { createContext, useState, useEffect, useContext } from 'react';
import { getCurrentUser, login, logout } from 'src/api/authApi.js'
import { LoginDTO } from 'shared/DTO/auth/types.js';
import { User } from 'src/api/types.js';

interface AuthContextType {
  currentUser: User | null;
  sessionToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginDTO) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(
    localStorage.getItem('sessionToken')
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in when app loads
    const checkUserSession = async () => {
      if (!sessionToken) {
        setIsLoading(false);
        return;
      }

      try {
        const userSession = await getCurrentUser(sessionToken);
        if (userSession) {
          setCurrentUser(userSession.user);
        } else {
          // Clear invalid token
          setSessionToken(null);
          localStorage.removeItem('sessionToken');
        }
      } catch (error) {
        console.error('Failed to verify session:', error);
        setSessionToken(null);
        localStorage.removeItem('sessionToken');
      } finally {
        setIsLoading(false);
      }
    };

    checkUserSession();
  }, [sessionToken]);

  const handleLogin = async (credentials: LoginDTO) => {
    setIsLoading(true);
    try {
      const userSession = await login(credentials);
      setCurrentUser(userSession.user);
      setSessionToken(userSession.session.token);
      localStorage.setItem('sessionToken', userSession.session.token); 
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!sessionToken) return;

    setIsLoading(true);
    try {
      await logout(sessionToken);
    } finally {
      setCurrentUser(null);
      setSessionToken(null);
      localStorage.removeItem('sessionToken');
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    if (!sessionToken) return;
    try {
      const userSession = await getCurrentUser(sessionToken);
      if (userSession) setCurrentUser(userSession.user);
    } catch (err) {
      console.error("Failed to refresh user", err);
    }
  };

  const value = {
    currentUser,
    sessionToken,
    isLoading,
    isAuthenticated: !!currentUser,
    login: handleLogin,
    logout: handleLogout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};