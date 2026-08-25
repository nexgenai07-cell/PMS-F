// src/services/emailService.js
import emailjs from '@emailjs/browser';

// Initialize EmailJS with your public key
// Get these from your EmailJS dashboard: https://dashboard.emailjs.com/
const EMAILJS_CONFIG = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID || 'your_service_id',
  templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'your_template_id',
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'your_public_key',
};

/**
 * Send a verification email using EmailJS
 * @param {string} email - Recipient email address
 * @param {string} name - Recipient name
 * @param {string} verificationLink - Verification URL
 * @returns {Promise<boolean>} - Success status
 */
export const sendVerificationEmail = async (email, name, verificationLink) => {
  try {
    const templateParams = {
      to_email: email,
      to_name: name || email.split('@')[0],
      verification_link: verificationLink || `${window.location.origin}/verify-email?token=${generateToken(email)}`,
      year: new Date().getFullYear(),
      company_name: 'FlowDesk',
    };

    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );

    console.log('📧 Email sent successfully:', response);
    return true;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return false;
  }
};

/**
 * Generate a simple verification token
 * In production, this should be handled by your backend
 */
export const generateToken = (email) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return btoa(`${email}|${timestamp}|${random}`).replace(/[^a-zA-Z0-9]/g, '');
};

/**
 * Verify a token (client-side)
 * In production, this should be handled by your backend
 */
export const verifyToken = (token) => {
  try {
    const decoded = atob(token);
    const [email, timestamp] = decoded.split('|');
    const age = Date.now() - parseInt(timestamp);
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (age > maxAge) {
      return { valid: false, error: 'Token expired' };
    }
    
    return { valid: true, email };
  } catch (error) {
    return { valid: false, error: 'Invalid token' };
  }
};