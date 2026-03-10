import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL || (window.location.port === '5173' ? "http://localhost:3000" : window.location.origin);

export default function Login() {
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      });

      let data = {};
      try { data = await response.json(); } catch { /* empty response */ }

      if (response.ok && data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        navigate('/home', { replace: true });
      } else {
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to connect to server. Please make sure the backend is running on port 3000.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Sign in to your AI Expense Tracker</p>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl p-8 border border-gray-800 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="text-red-500 flex shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={20} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-linear-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-gray-700"></div>
            <span className="text-gray-500 text-sm">OR</span>
            <div className="flex-1 h-px bg-gray-700"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full bg-white text-gray-900 py-3 rounded-lg font-semibold hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Don't have an account?{' '}
              <Link to="/signup" className="text-blue-500 hover:text-blue-400 font-semibold">
                Sign Up
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            By continuing, you agree to our Terms & Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}