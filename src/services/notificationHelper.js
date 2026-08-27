// src/services/notificationHelper.js
import { sendTaskAssignmentEmail } from './emailService';

/**
 * NotificationHelper - Handles both in-app notifications (from existing data) 
 * and email notifications for real-time updates
 * 
 * NOTE: Most notifications are now generated from existing data via notificationService.getNotifications()
 * However, email notifications for task assignments are sent in real-time via EmailJS
 */
export const NotificationHelper = {
  /**
   * ✅ TASK ASSIGNED - Send email notification
   * This creates a real-time email notification when a task is assigned
   */
  taskAssigned: async (task, assignee, currentUser, project) => {
    try {
      console.log('📢 Task Assigned Notification:', { task, assignee, currentUser });
      
      // 1. Send email notification
      if (assignee && assignee.email) {
        // Try to get project if not already provided
        let projectData = project;
        if (!projectData && (task.p_id || task.p)) {
          try {
            const projectService = (await import('./projectService')).default;
            const projectId = task.p_id || task.p;
            const response = await projectService.getProject(projectId);
            projectData = response?.data || response;
          } catch (error) {
            console.error('Error fetching project for email:', error);
          }
        }
        
        const result = await sendTaskAssignmentEmail(
          assignee.email,
          assignee.name || assignee.u_name || 'Team Member',
          currentUser?.u_name || currentUser?.name || 'System',
          task,
          projectData
        );
        console.log('📧 Email sent result:', result);
        return result;
      } else {
        console.warn('⚠️ No assignee email found, skipping email notification');
        return { success: false, message: 'No assignee email' };
      }
    } catch (error) {
      console.error('Error sending task assignment notification:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * ✅ TASK CREATED - In-app notification (handled by notificationService)
   */
  taskCreated: async (task, currentUser) => {
    try {
      console.log('📢 Task Created (in-app):', task?.title);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in taskCreated notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ TASK UPDATED - In-app notification (handled by notificationService)
   */
  taskUpdated: async (task, currentUser) => {
    try {
      console.log('📢 Task Updated (in-app):', task?.title);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in taskUpdated notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ TASK COMPLETED - In-app notification (handled by notificationService)
   */
  taskCompleted: async (task, currentUser) => {
    try {
      console.log('📢 Task Completed (in-app):', task?.title);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in taskCompleted notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ COMMENT ADDED - In-app notification (handled by notificationService)
   */
  commentAdded: async (comment, currentUser) => {
    try {
      console.log('📢 Comment Added (in-app)');
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in commentAdded notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ COMMENT PINNED - In-app notification (handled by notificationService)
   */
  commentPinned: async (comment, currentUser) => {
    try {
      console.log('📢 Comment Pinned (in-app)');
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in commentPinned notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ MEMBER ADDED - In-app notification (handled by notificationService)
   */
  memberAdded: async (member, currentUser) => {
    try {
      console.log('📢 Member Added (in-app):', member?.name);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in memberAdded notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ MEMBER UPDATED - In-app notification (handled by notificationService)
   */
  memberUpdated: async (member, currentUser) => {
    try {
      console.log('📢 Member Updated (in-app):', member?.name);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in memberUpdated notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ MEMBER DELETED - In-app notification (handled by notificationService)
   */
  memberDeleted: async (member, currentUser) => {
    try {
      console.log('📢 Member Deleted (in-app):', member?.name);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in memberDeleted notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ LEAD ASSIGNED - In-app notification (handled by notificationService)
   */
  leadAssigned: async (lead, project, currentUser) => {
    try {
      console.log('📢 Lead Assigned (in-app):', lead?.u_name);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in leadAssigned notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ PROJECT CREATED - In-app notification (handled by notificationService)
   */
  projectCreated: async (project, currentUser) => {
    try {
      console.log('📢 Project Created (in-app):', project?.p_name);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in projectCreated notification:', error);
      return { success: false };
    }
  },

  /**
   * ✅ PROJECT UPDATED - In-app notification (handled by notificationService)
   */
  projectUpdated: async (project, currentUser) => {
    try {
      console.log('📢 Project Updated (in-app):', project?.p_name);
      // In-app notification is handled by notificationService from existing data
      return { success: true };
    } catch (error) {
      console.error('Error in projectUpdated notification:', error);
      return { success: false };
    }
  },
};

export default NotificationHelper;