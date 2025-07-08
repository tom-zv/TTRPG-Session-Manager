import React, { useState } from 'react';
import { registerUser } from 'src/api/authApi.js';
import './Auth.css';

interface RegisterFormProps {
  onLoginClick?: () => void;
  onSuccess?: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onLoginClick, onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isDM, setIsDM] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!username || !password || !email) {
      setError('Please fill in all required fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await registerUser({ username, password, email, isDM });
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
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
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
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
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="form-group-checkbox">
          <input
            id="isDM"
            type="checkbox"
            checked={isDM}
            onChange={(e) => setIsDM(e.target.checked)}
            disabled={isLoading}
          />
          <label htmlFor="isDM">I am a Dungeon Master</label>
        </div>
        <button type="submit" disabled={isLoading} className="btn btn-primary auth-button">
          {isLoading ? 'Registering...' : 'Register'}
        </button>
        {onLoginClick && (
          <p className="auth-switch">
            Already have an account?{' '}
            <button type="button" onClick={onLoginClick} className="text-button">
              Login
            </button>
          </p>
        )}
      </form>
    </div>
  );
};

export default RegisterForm;