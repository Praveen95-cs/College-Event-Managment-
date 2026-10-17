export const getBackendUrl = () => {
  if (process.env.REACT_APP_BACKEND_URL !== undefined && process.env.REACT_APP_BACKEND_URL !== '') {
    return process.env.REACT_APP_BACKEND_URL;
  }
  if (process.env.REACT_APP_API_URL !== undefined && process.env.REACT_APP_API_URL !== '') {
    return process.env.REACT_APP_API_URL;
  }
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
};
