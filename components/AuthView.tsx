import React, { useState } from 'react';
import { logIn, signUp } from '../services/authService';
import LoadingSpinner from './LoadingSpinner';
import { DreamWeaverLogoIcon } from './icons/AppIcons';

const AuthView: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        await logIn(email, password);
      } else {
        await signUp(email, password);
      }
      // onLogin is no longer needed; the App's onAuthStateChanged listener will handle the update.
    } catch (err: any) {
      // Provide more user-friendly error messages from Firebase
      let message = 'An unexpected error occurred.';
      if (err.code) {
          switch (err.code) {
              case 'auth/user-not-found':
              case 'auth/wrong-password':
                  message = 'Invalid email or password.';
                  break;
              case 'auth/email-already-in-use':
                  message = 'An account with this email already exists.';
                  break;
              case 'auth/weak-password':
                  message = 'Password should be at least 6 characters.';
                  break;
              default:
                  message = err.message;
          }
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError(null);
    setEmail('');
    setPassword('');
  };

  return (
    <div className="min-h-screen font-sans flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <DreamWeaverLogoIcon className="h-24 w-24 mx-auto text-white" />
        <h1 className="text-5xl font-bold tracking-wider text-white mt-4">
          Dream Weaver
        </h1>
        <p className="text-gray-300 mt-4 max-w-xs mx-auto">
          Capture, analyze, and visualize your dreams. Turn your subconscious stories into personal insights.
        </p>
      </div>

      <div className="bg-[#1a1c2e]/50 border border-[#6C63FF]/20 rounded-xl p-8 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-center text-white mb-6">
          {mode === 'login' ? 'Welcome Back' : 'Create Your Account'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-300" htmlFor="email">
              Email
            </label>
             <div className="mt-1 glowing-border">
                <input
                id="email"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#1a1c2e] text-gray-200 p-3 rounded-lg outline-none"
                />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300" htmlFor="password">
              Password
            </label>
             <div className="mt-1 glowing-border">
                <input
                id="password"
                type="password"
                value={password}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-[#1a1c2e] text-gray-200 p-3 rounded-lg outline-none"
                />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-gradient-to-r from-[#6C63FF] via-[#a163ff] to-[#FF00A0] text-white font-bold rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {isLoading ? <LoadingSpinner /> : (mode === 'login' ? 'Log In' : 'Sign Up')}
          </button>
        </form>

        <p className="text-center text-sm mt-6">
          {mode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
          <button onClick={toggleMode} className="font-semibold text-cyan-400 hover:underline">
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthView;
