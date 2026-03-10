
const API_URL = import.meta.env.VITE_API_URL || '';

export const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');

  const config = {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid server response');
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Request failed');
  }

  return data;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
};