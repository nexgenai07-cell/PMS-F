// src/services/notificationService.js
import api, { endpoints } from '../utils/api';

class NotificationService {
  // ✅ Get all activities filtered by user's projects
  async getNotifications(userId = null, userRole = null) {
    try {
      // Fetch all data in parallel
      const [projectsData, tasksData, commentsData, membersData, usersData, pteamData] = await Promise.all([
        api.get(endpoints.projects.list),
        api.get(endpoints.tasks.list),
        api.get(endpoints.comments.list),
        api.get(endpoints.teamMembers.list),
        api.get(endpoints.users.list),
        api.get(endpoints.pteam.list),
      ]);

      const projects = projectsData?.data?.data || projectsData?.data || projectsData || [];
      const tasks = tasksData?.data?.data || tasksData?.data || tasksData || [];
      const comments = commentsData?.data?.data || commentsData?.data || commentsData || [];
      const members = membersData?.data?.data || membersData?.data || membersData || [];
      const users = usersData?.data?.data || usersData?.data || usersData || [];
      const pteam = pteamData?.data?.data || pteamData?.data || pteamData || [];

      console.log('📊 Projects for activities:', projects.length);
      console.log('📊 Tasks for activities:', tasks.length);
      console.log('📊 Comments for activities:', comments.length);
      console.log('📊 Members for activities:', members.length);
      console.log('📊 PTeam entries:', pteam.length);

      // ✅ Get user info
      const currentUserId = Number(userId);
      const currentUser = users.find(u => Number(u.id || u.u_id) === currentUserId);
      const isSupervisor = userRole === 'manager' || userRole === 'admin' || userRole === 'supervisor';
      
      // ✅ Find TeamMember ID for current user
      const userTeamMember = members.find(m => 
        (m.name || '').toLowerCase().trim() === (currentUser?.u_name || '').toLowerCase().trim()
      );
      const userTeamMemberId = userTeamMember ? Number(userTeamMember.id) : null;

      console.log('👤 Current User:', currentUser?.u_name, 'ID:', currentUserId, 'TeamMember ID:', userTeamMemberId);
      console.log('👤 Is Supervisor:', isSupervisor);

      // ✅ Get ALL project IDs this user has access to
      let userProjectIds = new Set();

      if (isSupervisor) {
        // ✅ SUPERVISOR: Can see ALL projects
        userProjectIds = new Set(projects.map(p => Number(p.p_id || p.id)));
        console.log('📊 Supervisor has access to ALL projects:', userProjectIds.size);
      } else {
        // ✅ LEAD/MEMBER: Only projects they created OR are added to via PTeam
        // 1. Projects created by user
        const createdProjects = projects.filter(p => Number(p.created_by) === currentUserId);
        createdProjects.forEach(p => userProjectIds.add(Number(p.p_id || p.id)));
        
        // 2. Projects where user is added via PTeam
        pteam.forEach(entry => {
          const projectId = Number(entry.p);
          const teamMemberId = Number(entry.tm);
          
          // Check if this PTeam entry matches the user (by TeamMember ID or User ID)
          const isUser = teamMemberId === currentUserId || teamMemberId === userTeamMemberId;
          
          // Also check by name
          const member = members.find(m => Number(m.id) === teamMemberId);
          const isUserByName = member && (member.name || '').toLowerCase().trim() === (currentUser?.u_name || '').toLowerCase().trim();
          
          if (isUser || isUserByName) {
            userProjectIds.add(projectId);
          }
        });

        console.log('📊 Lead/Member has access to projects:', userProjectIds.size);
      }

      // ✅ Get ALL TeamMember IDs that belong to user's projects
      const projectMemberIds = new Set();
      pteam.forEach(entry => {
        const projectId = Number(entry.p);
        if (userProjectIds.has(projectId)) {
          const memberId = Number(entry.tm);
          if (memberId) projectMemberIds.add(memberId);
        }
      });
      
      // Add current user's TeamMember ID if not already added
      if (userTeamMemberId) {
        projectMemberIds.add(userTeamMemberId);
      }

      console.log('📊 TeamMember IDs in user projects:', projectMemberIds.size);

      const activities = [];

      // ─── 1. PROJECT ACTIVITIES ───
      projects.forEach(project => {
        const projectId = Number(project.p_id || project.id);
        
        // ✅ ONLY show if project is in user's accessible projects
        if (!userProjectIds.has(projectId)) return;

        // Project created - ONLY if creator is part of the project
        if (project.created_at) {
          const creator = users.find(u => Number(u.id || u.u_id) === Number(project.created_by));
          // ✅ Check if creator is in project members OR is supervisor
          const isCreatorInProject = projectMemberIds.has(Number(project.created_by)) || isSupervisor;
          if (isCreatorInProject) {
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

      // ─── 2. TASK ACTIVITIES ───
      tasks.forEach(task => {
        const taskProjectId = Number(task.p_id || task.p);
        
        // ✅ ONLY show if task's project is in user's accessible projects
        if (!userProjectIds.has(taskProjectId)) return;

        const creator = users.find(u => Number(u.id || u.u_id) === Number(task.created_by));
        const assignee = members.find(m => Number(m.id) === Number(task.assign_to));
        const updater = users.find(u => Number(u.id || u.u_id) === Number(task.assign_by));

        // ✅ Task created - ONLY if within user's project
        if (task.created_at) {
          activities.push({
            n_id: `task-created-${task.t_id || task.id}`,
            type: 'task_created',
            message: `${creator?.u_name || creator?.name || 'Someone'} created task "${task.title}" in ${this.getProjectName(taskProjectId, projects)}`,
            is_read: false,
            created_at: task.created_at,
            u: task.created_by,
            entity_type: 'task',
            entity_id: task.t_id || task.id,
          });
        }

        // ✅ Task updated - ONLY if within user's project
        if (task.update_last && task.update_last !== task.created_at) {
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

        // ✅ Task assigned - ONLY if within user's project AND assignee is in the project
        if (task.assign_to) {
          const isAssigneeInProject = projectMemberIds.has(Number(task.assign_to)) || isSupervisor;
          if (isAssigneeInProject) {
            activities.push({
              n_id: `task-assigned-${task.t_id || task.id}`,
              type: 'task_assigned',
              message: `${creator?.u_name || creator?.name || 'Someone'} assigned task "${task.title}" to ${assignee?.name || 'someone'}`,
              is_read: false,
              created_at: task.created_at || task.update_last,
              u: task.assign_by,
              entity_type: 'task',
              entity_id: task.t_id || task.id,
            });
          }
        }

        // ✅ Task completed - ONLY if within user's project
        if (task.status === 'done' || task.status === 'completed') {
          activities.push({
            n_id: `task-completed-${task.t_id || task.id}`,
            type: 'task_completed',
            message: `${updater?.u_name || updater?.name || 'Someone'} completed task "${task.title}"`,
            is_read: false,
            created_at: task.update_last || task.created_at,
            u: task.assign_by,
            entity_type: 'task',
            entity_id: task.t_id || task.id,
          });
        }
      });

      // ─── 3. COMMENT ACTIVITIES ───
      comments.forEach(comment => {
        const taskId = Number(comment.t);
        const task = tasks.find(t => Number(t.t_id || t.id) === taskId);
        const taskProjectId = task ? Number(task.p_id || task.p) : null;
        
        // ✅ ONLY show if comment's task project is in user's accessible projects
        if (!taskProjectId || !userProjectIds.has(taskProjectId)) return;

        const commenter = users.find(u => Number(u.id || u.u_id) === Number(comment.u));
        
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
            message: `${commenter?.u_name || commenter?.name || 'Someone'} pinned a comment on "${task?.title || 'a task'}"`,
            is_read: false,
            created_at: comment.updated_at || comment.created_at,
            u: comment.u,
            entity_type: 'task',
            entity_id: comment.t,
          });
        }
      });

      // ─── 4. TEAM MEMBER ACTIVITIES ───
      members.forEach(member => {
        // ✅ ONLY show if member is in the user's project members
        const isMemberInProject = projectMemberIds.has(Number(member.id)) || isSupervisor;
        if (!isMemberInProject) return;

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

  // ✅ Helper function to get project name (now properly defined as a class method)
  getProjectName(projectId, projects) {
    const project = projects.find(p => Number(p.p_id || p.id) === Number(projectId));
    return project?.p_name || project?.name || 'a project';
  }

  // Get notifications for a specific user
  async getUserNotifications(userId, userRole) {
    return this.getNotifications(userId, userRole);
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
      // Mark all current notifications as read by storing all IDs
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
  async getUnreadCount(userId, userRole) {
    try {
      const readItems = JSON.parse(localStorage.getItem('read_notifications') || '[]');
      const deletedItems = JSON.parse(localStorage.getItem('deleted_notifications') || '[]');
      const notifications = await this.getNotifications(userId, userRole);
      const allData = notifications.data || [];
      
      // Filter out deleted notifications
      const filteredData = allData.filter(n => !deletedItems.includes(n.n_id || n.id));
      const total = filteredData.length;
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