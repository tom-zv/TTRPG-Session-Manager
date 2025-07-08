///src/pages/Auth/components/LoginForm.tsx
import React, { useState } from 'react';
import { useAuth } from 'src/app/contexts/AuthContext.js';
import './Auth.css';


interface LoginFormProps {
  onRegisterClick?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onRegisterClick }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { login, isLoading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    try {
      await login({ username, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <button type="submit" disabled={isLoading} className="btn btn-primary auth-button">
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
        {onRegisterClick && (
          <p className="auth-switch">
            Don&#39;t have an account?{' '}
            <button type="button" onClick={onRegisterClick} className="text-button">
              Register
            </button>
          </p>
        )}
      </form>
    </div>
  );
};

export default LoginForm;