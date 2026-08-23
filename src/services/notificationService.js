// src/services/notificationService.js
import api, { endpoints } from '../utils/api';

class NotificationService {
  // ✅ Get all activities from existing data (projects, tasks, comments, team members)
  async getNotifications() {
    try {
      // Fetch all data in parallel
      const [projectsData, tasksData, commentsData, membersData, usersData] = await Promise.all([
        api.get(endpoints.projects.list),
        api.get(endpoints.tasks.list),
        api.get(endpoints.comments.list),
        api.get(endpoints.teamMembers.list),
        api.get(endpoints.users.list),
      ]);

      const projects = projectsData?.data?.data || projectsData?.data || projectsData || [];
      const tasks = tasksData?.data?.data || tasksData?.data || tasksData || [];
      const comments = commentsData?.data?.data || commentsData?.data || commentsData || [];
      const members = membersData?.data?.data || membersData?.data || membersData || [];
      const users = usersData?.data?.data || usersData?.data || usersData || [];

      console.log('📊 Projects for activities:', projects.length);
      console.log('📊 Tasks for activities:', tasks.length);
      console.log('📊 Comments for activities:', comments.length);
      console.log('📊 Members for activities:', members.length);

      const activities = [];

      // 1. Project activities
      projects.forEach(project => {
        // Project created
        if (project.created_at) {
          const creator = users.find(u => Number(u.id || u.u_id) === Number(project.created_by));
          activities.push({
            n_id: `project-created-${project.p_id || project.id}`,
            type: 'project_created',
            message: `${creator?.u_name || creator?.name || 'Someone'} created project "${project.p_name || project.name}"`,
            is_read: false,
            created_at: project.created_at,
            u: project.created_by,
            entity_type: 'project',
            entity_id: project.p_id || project.id,
          });
        }
        // Project updated
        if (project.updated_at && project.updated_at !== project.created_at) {
          activities.push({
            n_id: `project-updated-${project.p_id || project.id}`,
            type: 'project_updated',
            message: `Project "${project.p_name || project.name}" was updated`,
            is_read: false,
            created_at: project.updated_at,
            u: project.created_by,
            entity_type: 'project',
            entity_id: project.p_id || project.id,
          });
        }
      });

      // 2. Task activities
      tasks.forEach(task => {
        // Task created
        if (task.created_at) {
          const creator = users.find(u => Number(u.id || u.u_id) === Number(task.created_by));
          activities.push({
            n_id: `task-created-${task.t_id || task.id}`,
            type: 'task_created',
            message: `${creator?.u_name || creator?.name || 'Someone'} created task "${task.title}"`,
            is_read: false,
            created_at: task.created_at,
            u: task.created_by,
            entity_type: 'task',
            entity_id: task.t_id || task.id,
          });
        }
        // Task updated
        if (task.update_last && task.update_last !== task.created_at) {
          const updater = users.find(u => Number(u.id || u.u_id) === Number(task.assign_by));
          activities.push({
            n_id: `task-updated-${task.t_id || task.id}`,
            type: 'task_updated',
            message: `${updater?.u_name || updater?.name || 'Someone'} updated task "${task.title}"`,
            is_read: false,
            created_at: task.update_last,
            u: task.assign_by,
            entity_type: 'task',
            entity_id: task.t_id || task.id,
          });
        }
        // Task assigned
        if (task.assign_to) {
          const assigner = users.find(u => Number(u.id || u.u_id) === Number(task.assign_by));
          const assignee = members.find(m => Number(m.id) === Number(task.assign_to));
          activities.push({
            n_id: `task-assigned-${task.t_id || task.id}`,
            type: 'task_assigned',
            message: `${assigner?.u_name || assigner?.name || 'Someone'} assigned task "${task.title}" to ${assignee?.name || 'someone'}`,
            is_read: false,
            created_at: task.created_at || task.update_last,
            u: task.assign_by,
            entity_type: 'task',
            entity_id: task.t_id || task.id,
          });
        }
        // Task completed
        if (task.status === 'done' || task.status === 'completed') {
          const completer = users.find(u => Number(u.id || u.u_id) === Number(task.assign_by));
          activities.push({
            n_id: `task-completed-${task.t_id || task.id}`,
            type: 'task_completed',
            message: `${completer?.u_name || completer?.name || 'Someone'} completed task "${task.title}"`,
            is_read: false,
            created_at: task.update_last || task.created_at,
            u: task.assign_by,
            entity_type: 'task',
            entity_id: task.t_id || task.id,
          });
        }
      });

      // 3. Comment activities
      comments.forEach(comment => {
        const commenter = users.find(u => Number(u.id || u.u_id) === Number(comment.u));
        const task = tasks.find(t => Number(t.t_id || t.id) === Number(comment.t));
        activities.push({
          n_id: `comment-${comment.c_id || comment.id}`,
          type: 'comment_added',
          message: `${commenter?.u_name || commenter?.name || 'Someone'} commented on task "${task?.title || 'a task'}"`,
          is_read: false,
          created_at: comment.created_at,
          u: comment.u,
          entity_type: 'task',
          entity_id: comment.t,
        });
        // Comment pinned
        if (comment.pin) {
          activities.push({
            n_id: `comment-pinned-${comment.c_id || comment.id}`,
            type: 'comment_pinned',
            message: `${commenter?.u_name || commenter?.name || 'Someone'} pinned a comment`,
            is_read: false,
            created_at: comment.updated_at || comment.created_at,
            u: comment.u,
            entity_type: 'task',
            entity_id: comment.t,
          });
        }
      });

      // 4. Team member activities
      members.forEach(member => {
        const adder = users.find(u => Number(u.id || u.u_id) === Number(member.added_by));
        if (member.created_at || member.updated_at) {
          activities.push({
            n_id: `member-added-${member.id}`,
            type: 'member_added',
            message: `${adder?.u_name || adder?.name || 'Someone'} added ${member.name} as a team member`,
            is_read: false,
            created_at: member.created_at || member.updated_at,
            u: member.added_by,
            entity_type: 'team_member',
            entity_id: member.id,
          });
        }
      });

      // Sort by created_at (newest first)
      activities.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });

      console.log('📊 Activities generated:', activities.length);
      console.log('📊 Sample activities:', activities.slice(0, 3));

      return { success: true, data: activities };
    } catch (error) {
      console.error('NotificationService: Error fetching activities:', error);
      return { data: [] };
    }
  }

  // Mark a notification as read (local only)
  async markAsRead(id) {
    try {
      const readItems = JSON.parse(localStorage.getItem('read_notifications') || '[]');
      if (!readItems.includes(id)) {
        readItems.push(id);
        localStorage.setItem('read_notifications', JSON.stringify(readItems));
      }
      return { success: true };
    } catch (error) {
      console.error('Error marking as read:', error);
      return { success: false };
    }
  }

  // Mark all notifications as read (local only)
  async markAllRead() {
    try {
      // Get all notification IDs from the current list
      // This will be handled in the component
      return { success: true };
    } catch (error) {
      console.error('Error marking all as read:', error);
      return { success: false };
    }
  }

  // Delete a notification (local only)
  async deleteNotification(id) {
    try {
      const deletedItems = JSON.parse(localStorage.getItem('deleted_notifications') || '[]');
      if (!deletedItems.includes(id)) {
        deletedItems.push(id);
        localStorage.setItem('deleted_notifications', JSON.stringify(deletedItems));
      }
      return { success: true };
    } catch (error) {
      console.error('Error deleting notification:', error);
      return { success: false };
    }
  }

  // Get unread count
  async getUnreadCount() {
    try {
      const readItems = JSON.parse(localStorage.getItem('read_notifications') || '[]');
      const notifications = await this.getNotifications();
      const total = notifications.data?.length || 0;
      const read = readItems.length;
      return { count: Math.max(0, total - read) };
    } catch (error) {
      console.error('NotificationService: Error fetching unread count:', error);
      return { count: 0 };
    }
  }

  handleError(error) {
    if (error.response) {
      return {
        status: error.response.status,
        message: error.response.data.message || error.response.data.detail || 'An error occurred',
        data: error.response.data,
      };
    }
    return {
      message: error.message || 'Network error occurred',
    };
  }
}

export default new NotificationService();