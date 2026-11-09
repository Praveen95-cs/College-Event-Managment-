import axios from 'axios';
import { getBackendUrl } from './apiConfig';

export const DEFAULT_DEPARTMENTS = [
  'Computer Science',
  'Computer Technology',
  'Information Technology',
  'Electronics',
  'Mechanical',
  'Civil'
];

export async function fetchDepartments({ includeInactive = false, includeStats = false } = {}) {
  try {
    const backendUrl = getBackendUrl();
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios.get(`${backendUrl}/api/departments`, {
      headers,
      params: {
        ...(includeInactive ? { includeInactive: 'true' } : {}),
        ...(includeStats ? { includeStats: 'true' } : {})
      }
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
  } catch (err) {
    console.warn('Using fallback department list:', err?.message || err);
  }
  return DEFAULT_DEPARTMENTS.map((name, idx) => ({
    _id: `fallback_${idx}`,
    name,
    code: '',
    isActive: true
  }));
}

