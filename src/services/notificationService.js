// src/services/notificationService.js
import api, { endpoints } from '../utils/api';

class NotificationService {
  /* ─────────── Tiny helpers ─────────── */
  _asArray(v) {
    return Array.isArray(v) ? v : [];
  }
  _unwrap(response) {
    if (!response) return [];
    const d = response?.data?.data ?? response?.data ?? response;
    return Array.isArray(d) ? d : [];
  }
  _norm(s) {
    return (s || '').toLowerCase().trim();
  }

  /**
   * GET activities filtered STRICTLY by the user's actual membership.
   *
   * Rules:
   *  - Admin            → sees everything.
   *  - Manager/Supervisor → sees ONLY projects they created OR supervise OR are PTeam members of.
   *  - Lead/Member      → sees ONLY projects they created OR are PTeam members of.
   *  - New user (no projects, no tasks, no PTeam) → sees NOTHING.
   *
   * ADDITIONALLY: only activities created ON OR AFTER the user's own
   * `created_at` are shown. A freshly registered user therefore starts
   * with an empty inbox, even if they happen to share a name with an
   * existing TeamMember profile.
   */
  async getNotifications(userId = null, userRole = null, userCreatedAt = null) {
    try {
      const currentUserId = Number(userId);
      const role = (userRole || '').toLowerCase();

      // ─── No user → nothing to show ───
      if (!Number.isFinite(currentUserId)) {
        return { success: true, data: [] };
      }

      const isAdmin = role === 'admin';

      // ─── Fetch all data in parallel ───
      const [projectsRes, tasksRes, commentsRes, membersRes, usersRes, pteamRes] =
        await Promise.all([
          api.get(endpoints.projects.list).catch(() => null),
          api.get(endpoints.tasks.list).catch(() => null),
          api.get(endpoints.comments.list).catch(() => null),
          api.get(endpoints.teamMembers.list).catch(() => null),
          api.get(endpoints.users.list).catch(() => null),
          api.get(endpoints.pteam.list).catch(() => null),
        ]);

      const projects = this._unwrap(projectsRes);
      const tasks    = this._unwrap(tasksRes);
      const comments = this._unwrap(commentsRes);
      const members  = this._unwrap(membersRes);
      const users    = this._unwrap(usersRes);
      const pteam    = this._unwrap(pteamRes);

      const currentUser = users.find(u => Number(u.id ?? u.u_id) === currentUserId);
      const userName = this._norm(currentUser?.u_name || currentUser?.name);

      // ─── Find this user's TeamMember profile(s) by name match ───
      const userTeamMemberIds = new Set(
        members
          .filter(m => this._norm(m.name) === userName && userName)
          .map(m => Number(m.id))
          .filter(Number.isFinite)
      );
      const userTeamMemberId = userTeamMemberIds.size > 0
        ? [...userTeamMemberIds][0]
        : null;

      // ═══════════════════════════════════════════════════════════
      // 1) Which projects can this user see?
      // ═══════════════════════════════════════════════════════════
      const userProjectIds = new Set();

      if (isAdmin) {
        // Admin sees everything
        projects.forEach(p => userProjectIds.add(Number(p.p_id ?? p.id)));
      } else {
        // Everyone else: created OR supervised OR PTeam-linked
        projects.forEach(p => {
          const pid = Number(p.p_id ?? p.id);

          const isCreator = Number(p.created_by) === currentUserId;
          const isSupervisor = this._asArray(p.supervisors).map(Number).includes(currentUserId);
          if (isCreator || isSupervisor) userProjectIds.add(pid);
        });

        // Via PTeam
        if (userTeamMemberIds.size > 0) {
          pteam.forEach(entry => {
            const tmId = Number(entry.tm ?? entry.tm_id);
            if (userTeamMemberIds.has(tmId)) {
              const pid = Number(entry.p ?? entry.p_id);
              if (Number.isFinite(pid)) userProjectIds.add(pid);
            }
          });
        }
      }

      // ─── New user: no projects → nothing to show ───
      if (userProjectIds.size === 0) {
        return { success: true, data: [] };
      }

      // ═══════════════════════════════════════════════════════════
      // 2) Which TeamMember IDs belong to those projects?
      //    (Only used to gate "member added" events.)
      // ═══════════════════════════════════════════════════════════
      const projectMemberIds = new Set();
      pteam.forEach(entry => {
        const pid = Number(entry.p ?? entry.p_id);
        const tmId = Number(entry.tm ?? entry.tm_id);
        if (userProjectIds.has(pid) && Number.isFinite(tmId)) {
          projectMemberIds.add(tmId);
        }
      });

      const activities = [];

      // ═══════════════════════════════════════════════════════════
      // 3) PROJECT activities (only for visible projects)
      // ═══════════════════════════════════════════════════════════
      projects.forEach(project => {
        const projectId = Number(project.p_id ?? project.id);
        if (!userProjectIds.has(projectId)) return;

        const creator = users.find(
          u => Number(u.id ?? u.u_id) === Number(project.created_by)
        );

        if (project.created_at) {
          activities.push({
            n_id: `project-created-${projectId}`,
            type: 'project_created',
            message: `${creator?.u_name || 'Someone'} created project "${project.p_name || project.name}"`,
            is_read: false,
            created_at: project.created_at,
            u: project.created_by,
            entity_type: 'project',
            entity_id: projectId,
          });
        }

        if (project.updated_at && project.updated_at !== project.created_at) {
          activities.push({
            n_id: `project-updated-${projectId}`,
            type: 'project_updated',
            message: `Project "${project.p_name || project.name}" was updated`,
            is_read: false,
            created_at: project.updated_at,
            u: project.created_by,
            entity_type: 'project',
            entity_id: projectId,
          });
        }
      });

      // ═══════════════════════════════════════════════════════════
      // 4) TASK activities (only tasks in visible projects)
      // ═══════════════════════════════════════════════════════════
      tasks.forEach(task => {
        const taskProjectId = Number(task.p_id ?? task.p);
        if (!userProjectIds.has(taskProjectId)) return;

        const creator  = users.find(u => Number(u.id ?? u.u_id) === Number(task.created_by));
        const updater  = users.find(u => Number(u.id ?? u.u_id) === Number(task.assign_by));
        const assignee = members.find(m => Number(m.id) === Number(task.assign_to));

        if (task.created_at) {
          activities.push({
            n_id: `task-created-${task.t_id ?? task.id}`,
            type: 'task_created',
            message: `${creator?.u_name || 'Someone'} created task "${task.title}"`,
            is_read: false,
            created_at: task.created_at,
            u: task.created_by,
            entity_type: 'task',
            entity_id: task.t_id ?? task.id,
          });
        }

        if (task.update_last && task.update_last !== task.created_at) {
          activities.push({
            n_id: `task-updated-${task.t_id ?? task.id}`,
            type: 'task_updated',
            message: `${updater?.u_name || 'Someone'} updated task "${task.title}"`,
            is_read: false,
            created_at: task.update_last,
            u: task.assign_by,
            entity_type: 'task',
            entity_id: task.t_id ?? task.id,
          });
        }

        if (task.assign_to) {
          activities.push({
            n_id: `task-assigned-${task.t_id ?? task.id}`,
            type: 'task_assigned',
            message: `${creator?.u_name || 'Someone'} assigned task "${task.title}" to ${assignee?.name || 'someone'}`,
            is_read: false,
            created_at: task.created_at || task.update_last,
            u: task.assign_by,
            entity_type: 'task',
            entity_id: task.t_id ?? task.id,
          });
        }

        const s = (task.status || '').toLowerCase();
        if (s === 'done' || s === 'completed') {
          activities.push({
            n_id: `task-completed-${task.t_id ?? task.id}`,
            type: 'task_completed',
            message: `${updater?.u_name || 'Someone'} completed task "${task.title}"`,
            is_read: false,
            created_at: task.update_last || task.created_at,
            u: task.assign_by,
            entity_type: 'task',
            entity_id: task.t_id ?? task.id,
          });
        }
      });

      // ═══════════════════════════════════════════════════════════
      // 5) COMMENT activities (only for tasks in visible projects)
      // ═══════════════════════════════════════════════════════════
      comments.forEach(comment => {
        const taskId = Number(comment.t ?? comment.t_id);
        const task = tasks.find(t => Number(t.t_id ?? t.id) === taskId);
        const taskProjectId = task ? Number(task.p_id ?? task.p) : null;

        if (!taskProjectId || !userProjectIds.has(taskProjectId)) return;

        const commenter = users.find(u => Number(u.id ?? u.u_id) === Number(comment.u));

        activities.push({
          n_id: `comment-${comment.c_id ?? comment.id}`,
          type: 'comment_added',
          message: `${commenter?.u_name || 'Someone'} commented on task "${task?.title || 'a task'}"`,
          is_read: false,
          created_at: comment.created_at,
          u: comment.u,
          entity_type: 'task',
          entity_id: comment.t ?? comment.t_id,
        });

        if (comment.pin) {
          activities.push({
            n_id: `comment-pinned-${comment.c_id ?? comment.id}`,
            type: 'comment_pinned',
            message: `${commenter?.u_name || 'Someone'} pinned a comment on "${task?.title || 'a task'}"`,
            is_read: false,
            created_at: comment.updated_at || comment.created_at,
            u: comment.u,
            entity_type: 'task',
            entity_id: comment.t ?? comment.t_id,
          });
        }
      });

      // ═══════════════════════════════════════════════════════════
      // 6) TEAM MEMBER activities
      //    Only members who are actually IN the user's projects.
      // ═══════════════════════════════════════════════════════════
      members.forEach(member => {
        if (!projectMemberIds.has(Number(member.id))) return;

        const adder = users.find(u => Number(u.id ?? u.u_id) === Number(member.added_by));
        const ts = member.created_at || member.updated_at;

        if (ts) {
          activities.push({
            n_id: `member-added-${member.id}`,
            type: 'member_added',
            message: `${adder?.u_name || 'Someone'} added ${member.name} as a team member`,
            is_read: false,
            created_at: ts,
            u: member.added_by,
            entity_type: 'team_member',
            entity_id: member.id,
          });
        }
      });

      // ═══════════════════════════════════════════════════════════
      // 7) NEW USER CUTOFF
      //    Hide anything that happened before this user registered.
      //    This is what stops a brand-new account from inheriting
      //    historical activity via name-based TeamMember matching.
      // ═══════════════════════════════════════════════════════════
      const cutoffTs = userCreatedAt ? new Date(userCreatedAt).getTime() : 0;

      const visibleActivities = cutoffTs
        ? activities.filter(a => {
            const ts = new Date(a.created_at || 0).getTime();
            return ts >= cutoffTs;
          })
        : activities;

      // ─── Sort newest first ───
      visibleActivities.sort((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return db - da;
      });

      console.log(
        `📬 notificationService: user=${userName || currentUserId} role=${role}`,
        `visibleProjects=${userProjectIds.size}`,
        `rawActivities=${activities.length}`,
        `visibleActivities=${visibleActivities.length}`,
        cutoffTs ? `cutoff=${new Date(cutoffTs).toISOString()}` : 'cutoff=none'
      );

      return { success: true, data: visibleActivities };
    } catch (error) {
      console.error('NotificationService: Error fetching activities:', error);
      return { success: false, data: [] };
    }
  }

  /* ─────────── Local-only read/delete (per user) ─────────── */

  _readKey(userId)    { return `read_notifications_${userId ?? 'anon'}`; }
  _deletedKey(userId) { return `deleted_notifications_${userId ?? 'anon'}`; }

  async markAsRead(id, userId = null) {
    try {
      const key = this._readKey(userId);
      const readItems = JSON.parse(localStorage.getItem(key) || '[]');
      if (!readItems.includes(id)) {
        readItems.push(id);
        localStorage.setItem(key, JSON.stringify(readItems));
      }
      return { success: true };
    } catch (error) {
      console.error('Error marking as read:', error);
      return { success: false };
    }
  }

  async markAllRead(ids = [], userId = null) {
    try {
      const key = this._readKey(userId);
      const readItems = JSON.parse(localStorage.getItem(key) || '[]');
      const merged = [...new Set([...readItems, ...ids])];
      localStorage.setItem(key, JSON.stringify(merged));
      return { success: true };
    } catch (error) {
      console.error('Error marking all as read:', error);
      return { success: false };
    }
  }

  async deleteNotification(id, userId = null) {
    try {
      const key = this._deletedKey(userId);
      const deletedItems = JSON.parse(localStorage.getItem(key) || '[]');
      if (!deletedItems.includes(id)) {
        deletedItems.push(id);
        localStorage.setItem(key, JSON.stringify(deletedItems));
      }
      return { success: true };
    } catch (error) {
      console.error('Error deleting notification:', error);
      return { success: false };
    }
  }

  /* ─────────── Read-state helpers ─────────── */
  getReadSet(userId = null) {
    try {
      return new Set(
        JSON.parse(localStorage.getItem(this._readKey(userId)) || '[]')
      );
    } catch { return new Set(); }
  }
  getDeletedSet(userId = null) {
    try {
      return new Set(
        JSON.parse(localStorage.getItem(this._deletedKey(userId)) || '[]')
      );
    } catch { return new Set(); }
  }

  async getUnreadCount(userId = null, userRole = null, userCreatedAt = null) {
    try {
      const deleted = this.getDeletedSet(userId);
      const read = this.getReadSet(userId);
      const res = await this.getNotifications(userId, userRole, userCreatedAt);
      const all = this._asArray(res?.data);

      const visible = all.filter(n => !deleted.has(n.n_id || n.id));
      const unread = visible.filter(n => !read.has(n.n_id || n.id)).length;
      return { count: unread };
    } catch (error) {
      console.error('NotificationService: Error fetching unread count:', error);
      return { count: 0 };
    }
  }

  handleError(error) {
    if (error.response) {
      return {
        status: error.response.status,
        message:
          error.response.data?.message ||
          error.response.data?.detail ||
          'An error occurred',
        data: error.response.data,
      };
    }
    return { message: error.message || 'Network error occurred' };
  }
}

export default new NotificationService();