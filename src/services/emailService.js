// src/services/emailService.js
import emailjs from '@emailjs/browser';

const EMAILJS_CONFIG = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID || 'your_service_id',
  verificationTemplateId: import.meta.env.VITE_EMAILJS_VERIFICATION_TEMPLATE_ID || 'your_verification_template_id',
  taskTemplateId: import.meta.env.VITE_EMAILJS_TASK_TEMPLATE_ID || 'your_task_template_id',
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'your_public_key',
};

/**
 * Send a verification email using EmailJS
 */
export const sendVerificationEmail = async (email, name, verificationLink) => {
  try {
    console.log('📧 Sending verification email to:', email);
    
    const templateParams = {
      to_email: email,
      to_name: name || email.split('@')[0],
      verification_link: verificationLink || `${window.location.origin}/verify-email?token=${generateToken(email)}`,
      year: new Date().getFullYear(),
      company_name: 'AEEL-PMS',
    };

    console.log('📤 Template params:', templateParams);

    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.verificationTemplateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );

    console.log('📧 Verification email sent successfully to:', email);
    console.log('📧 Response:', response);
    
    return { success: true, message: 'Verification email sent!', response };
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    return { 
      success: false, 
      message: error?.text || 'Failed to send verification email. Please try again.' 
    };
  }
};

/**
 * ✅ Send task assignment email using EmailJS
 * This matches your HTML template exactly
 */
export const sendTaskAssignmentEmail = async (assigneeEmail, assigneeName, assignerName, task, project) => {
  try {
    // Get the project ID for the task link
    const projectId = project?.p_id || project?.id || task.p_id || task.p;
    const taskId = task.t_id || task.id;
    
    // Create a task link - you can customize this based on your routing
    // For lead: /lead/projects/${projectId}/tasks/${taskId}
    // For supervisor: /supervisor/projects/${projectId}/tasks/${taskId}
    // Using a generic link that works for both
    const taskLink = `${window.location.origin}/lead/projects/${projectId}/tasks/${taskId}`;
    
    // ✅ These variables must match your EmailJS template EXACTLY
    const templateParams = {
      to_email: assigneeEmail,  // This tells EmailJS who to send to
      assignee_name: assigneeName || 'Team Member',
      assigner_name: assignerName || 'Your Supervisor',
      task_title: task.title || 'New Task',
      task_description: task.desc || task.description || 'No description provided',
      project_name: project?.p_name || project?.name || 'Unknown Project',
      task_priority: task.priority || 'medium',
      task_status: task.status || 'todo',
      due_date: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Not set',
      task_link: taskLink,
      year: new Date().getFullYear(),
    };

    console.log('📤 Sending task assignment email to:', assigneeEmail);
    console.log('📤 Template params:', templateParams);

    // ✅ Send using the task template ID
    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.taskTemplateId,  // ← This must be your task assignment template ID
      templateParams,
      EMAILJS_CONFIG.publicKey
    );

    console.log('📧 Task assignment email sent successfully:', response);
    return { success: true, message: 'Assignment email sent!', response };
  } catch (error) {
    console.error('❌ Failed to send task assignment email:', error);
    console.error('❌ Error details:', {
      status: error?.status,
      text: error?.text,
      message: error?.message,
    });
    return { 
      success: false, 
      message: error?.text || 'Failed to send assignment email'
    };
  }
};

/**
 * Generate a verification token
 */
export const generateToken = (email) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const tokenData = `${email}|${timestamp}|${random}`;
  return btoa(encodeURIComponent(tokenData))
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 64);
};

/**
 * Verify a token
 */
export const verifyToken = (token) => {
  try {
    const decoded = decodeURIComponent(atob(token));
    const [email, timestamp] = decoded.split('|');
    const age = Date.now() - parseInt(timestamp);
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (age > maxAge) {
      return { valid: false, error: 'Token expired. Please request a new verification email.' };
    }
    
    return { valid: true, email };
  } catch (error) {
    return { valid: false, error: 'Invalid verification token.' };
  }
};