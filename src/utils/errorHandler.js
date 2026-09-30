// src/utils/errorHandler.js
import toast from 'react-hot-toast';

/**
 * Extract a human-readable STRING from any backend error shape.
 * Handles:
 *   - { success:false, error:{ non_field_errors:["..."] } }
 *   - { email: ["..."] }
 *   - { detail: "..." }
 *   - { message: "..." }
 *   - plain strings, arrays, nested objects
 * ALWAYS returns a string. Never returns an object (which would crash React).
 *
 * (Extracted from Login.jsx — same logic, shared everywhere.)
 */
export function extractErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data;

  const unwrap = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? unwrap(v[0]) : null;
    if (typeof v === 'object') {
      const k = Object.keys(v)[0];
      return k ? unwrap(v[k]) : null;
    }
    return String(v);
  };

  if (data) {
    const inner =
      data.error && typeof data.error === 'object' && !Array.isArray(data.error)
        ? data.error
        : data;

    const keys = ['non_field_errors', 'detail', 'message', 'email', 'password', 'error'];
    for (const key of keys) {
      if (inner[key] != null) {
        const msg = unwrap(inner[key]);
        if (msg) return msg;
      }
    }

    for (const key of Object.keys(inner)) {
      if (key === 'success') continue;
      const msg = unwrap(inner[key]);
      if (msg) return msg;
    }

    if (typeof data === 'string') return data;
  }

  if (err?.message && typeof err.message === 'string') return err.message;
  return fallback;
}

/**
 * Show a toast + return the message.
 * Use in catch blocks: `const msg = handleApiError(err, 'Login failed.');`
 */
export function handleApiError(err, fallback) {
  const message = extractErrorMessage(err, fallback);
  const status = err?.response?.status;

  // Optional: use status to pick a smarter toast style
  if (status === 401) toast.error(message || 'Session expired. Please log in again.');
  else if (status === 403) toast.error(message || 'You do not have permission to do that.');
  else if (status === 404) toast.error(message || 'Not found.');
  else if (status === 409) toast.error(message || 'Conflict — action requires more info.');
  else if (status >= 500) toast.error(message || 'Server error. Please try again.');
  else toast.error(message);

  return message;
}