import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL || (window.location.port === '5173' ? "http://localhost:3000" : window.location.origin);

export default function OAuthCallbackHandler() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const errorParam = searchParams.get('error');

    if (errorParam || !token) {
      setError('OAuth login failed');
      setTimeout(() => navigate('/login'), 2000);
      return;
    }

    if (token.split('.').length !== 3) {
      setError('Invalid token');
      setTimeout(() => navigate('/login'), 2000);
      return;
    }

    localStorage.setItem('token', token);

    fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error();
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/home', { replace: true });
      })
      .catch(() => {
        setError('Authentication failed');
        setTimeout(() => navigate('/login'), 2000);
      });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      {error ? (
        <div className="text-center text-red-400">
          <AlertCircle size={40} className="mx-auto mb-4" />
          {error}
        </div>
      ) : (
        <div className="text-center text-white">
          <Loader2 size={40} className="animate-spin mx-auto mb-4" />
          Signing you in...
        </div>
      )}
    </div>
  );
}