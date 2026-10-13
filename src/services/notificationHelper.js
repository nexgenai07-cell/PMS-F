// src/services/notificationHelper.js
import api from '../utils/api';

/**
 * NotificationHelper — thin client for backend email endpoints.
 * All actual email sending now happens server-side via Django + Gmail SMTP.
 */
export const NotificationHelper = {
  /**
   * TASK ASSIGNED — call the backend SMTP endpoint
   */
  taskAssigned: async (task, assignee, currentUser, project) => {
    try {
      console.log('📢 Task Assigned Notification:', { task, assignee, currentUser });

      const taskId = task?.t_id || task?.id;
      if (!taskId) {
        console.warn('⚠️ No task id — skipping assignment email');
        return { success: false, message: 'No task id' };
      }

      const assigneeEmail =
        assignee?.email ||
        assignee?.email_address ||
        null;

      if (!assigneeEmail) {
        console.warn('⚠️ No assignee email found, skipping email notification');
        return { success: false, message: 'No assignee email' };
      }

      const assigneeName =
        assignee?.name ||
        assignee?.u_name ||
        'Team Member';

      const response = await api.post(
        `/tasks/${taskId}/send-assignment-email`,
        {
          assignee_email: assigneeEmail,
          assignee_name:  assigneeName,
        }
      );

      console.log('📧 Assignment email sent via backend:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error sending task assignment notification:', error);
      return {
        success: false,
        message:
          error?.response?.data?.error?.detail ||
          error?.response?.data?.error ||
          error.message,
      };
    }
  },

  /**
   * TASK CREATED — in-app notification (handled by notificationService).
   * Kept as a no-op so existing call-sites don't break.
   */
  taskCreated: async (task, currentUser) => {
    try {
      console.log('📢 Task Created (in-app):', task?.title);
      return { success: true };
    } catch (error) {
      console.error('Error in taskCreated notification:', error);
      return { success: false };
    }
  },

  /**
   * TASK UPDATED — in-app notification (handled by notificationService).
   */
  taskUpdated: async (task, currentUser) => {
    try {
      console.log('📢 Task Updated (in-app):', task?.title);
      return { success: true };
    } catch (error) {
      console.error('Error in taskUpdated notification:', error);
      return { success: false };
    }
  },

  /**
   * TASK COMPLETED — in-app notification (handled by notificationService).
   */
  taskCompleted: async (task, currentUser) => {
    try {
      console.log('📢 Task Completed (in-app):', task?.title);
      return { success: true };
    } catch (error) {
      console.error('Error in taskCompleted notification:', error);
      return { success: false };
    }
  },

  /**
   * COMMENT ADDED — in-app notification (handled by notificationService).
   */
  commentAdded: async (comment, currentUser) => {
    try {
      console.log('📢 Comment Added (in-app)');
      return { success: true };
    } catch (error) {
      console.error('Error in commentAdded notification:', error);
      return { success: false };
    }
  },

  /**
   * COMMENT PINNED — in-app notification (handled by notificationService).
   */
  commentPinned: async (comment, currentUser) => {
    try {
      console.log('📢 Comment Pinned (in-app)');
      return { success: true };
    } catch (error) {
      console.error('Error in commentPinned notification:', error);
      return { success: false };
    }
  },

  /**
   * MEMBER ADDED — in-app notification (handled by notificationService).
   */
  memberAdded: async (member, currentUser) => {
    try {
      console.log('📢 Member Added (in-app):', member?.name);
      return { success: true };
    } catch (error) {
      console.error('Error in memberAdded notification:', error);
      return { success: false };
    }
  },

  /**
   * MEMBER UPDATED — in-app notification (handled by notificationService).
   */
  memberUpdated: async (member, currentUser) => {
    try {
      console.log('📢 Member Updated (in-app):', member?.name);
      return { success: true };
    } catch (error) {
      console.error('Error in memberUpdated notification:', error);
      return { success: false };
    }
  },

  /**
   * MEMBER DELETED — in-app notification (handled by notificationService).
   */
  memberDeleted: async (member, currentUser) => {
    try {
      console.log('📢 Member Deleted (in-app):', member?.name);
      return { success: true };
    } catch (error) {
      console.error('Error in memberDeleted notification:', error);
      return { success: false };
    }
  },

  /**
   * LEAD ASSIGNED — in-app notification (handled by notificationService).
   */
  leadAssigned: async (lead, project, currentUser) => {
    try {
      console.log('📢 Lead Assigned (in-app):', lead?.u_name);
      return { success: true };
    } catch (error) {
      console.error('Error in leadAssigned notification:', error);
      return { success: false };
    }
  },

  /**
   *  PROJECT CREATED — in-app notification (handled by notificationService).
   */
  projectCreated: async (project, currentUser) => {
    try {
      console.log('📢 Project Created (in-app):', project?.p_name);
      return { success: true };
    } catch (error) {
      console.error('Error in projectCreated notification:', error);
      return { success: false };
    }
  },

  /**
   *  PROJECT UPDATED — in-app notification (handled by notificationService).
   */
  projectUpdated: async (project, currentUser) => {
    try {
      console.log('📢 Project Updated (in-app):', project?.p_name);
      return { success: true };
    } catch (error) {
      console.error('Error in projectUpdated notification:', error);
      return { success: false };
    }
  },
};

export default NotificationHelper;