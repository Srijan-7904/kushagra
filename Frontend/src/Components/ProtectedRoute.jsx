// import { useEffect, useState } from 'react';

// export default function ProtectedRoute({ children }) {
//   const [loading, setLoading] = useState(true);
//   const [authenticated, setAuthenticated] = useState(false);

//   useEffect(() => {
//     const checkAuth = async () => {
//       const token = localStorage.getItem('authToken');
      
//       if (!token) {
//         window.location.href = '/login';
//         return;
//       }

//       try {
//         const response = await fetch('http://localhost:3001/api/auth/me', {
//           headers: { Authorization: `Bearer ${token}` }
//         });

//         if (response.ok) {
//           setAuthenticated(true);
//         } else {
//           localStorage.removeItem('authToken');
//           localStorage.removeItem('user');
//           window.location.href = '/login';
//         }
//       } catch (error) {
//         console.error('Auth check failed:', error);
//         window.location.href = '/login';
//       } finally {
//         setLoading(false);
//       }
//     };

//     checkAuth();
//   }, []);

//   if (loading) {
//     return <div>Loading...</div>;
//   }

//   return authenticated ? children : null;
// }



















import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';















// PROTECTED ROUTE COMPONENT

const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = () => {
    try {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      
      if (token && user) {
        // Optional: Verify token with backend
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Render protected component
  return children;
};

export default ProtectedRoute;



