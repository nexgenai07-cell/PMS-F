// src/services/taskService.js
import api, { endpoints } from '../utils/api';

const asArray = (v) => (Array.isArray(v) ? v : []);

class TaskService {
  /**
   * GET /api/task
   *
   * Returns the raw task list, enriched with full detail from each task's
   * detail endpoint when the list is missing critical fields.
   */
  async getTasks() {
    try {
      const response = await api.get(endpoints.tasks.list);
      const data = response.data;

      let tasksList = data?.data || data || [];
      if (!Array.isArray(tasksList) || tasksList.length === 0) {
        return data;
      }

      const needsEnrichment = (t) =>
        t.assign_to === undefined || t.assign_to === null;

      const normalizeIds = (t) => {
        const assigneeIds = Array.isArray(t.assignees)
          ? t.assignees.map(Number).filter(Number.isFinite)
          : [];
        return {
          ...t,
          t_id: t.t_id != null ? Number(t.t_id) : (t.id != null ? Number(t.id) : null),
          id:   t.id   != null ? Number(t.id)   : (t.t_id != null ? Number(t.t_id) : null),
          assign_to: t.assign_to != null ? Number(t.assign_to) : null,
          assignees: assigneeIds,
          progress: Number.isFinite(Number(t.progress)) ? Number(t.progress) : 0,
          subtask_count: Number(t.subtask_count) || 0,
          completed_subtasks: Number(t.completed_subtasks) || 0,
          parent: t.parent != null ? Number(t.parent) : null,
        };
      };

      const enriched = await Promise.all(
        tasksList.map(async (task) => {
          if (!needsEnrichment(task)) {
            return normalizeIds(task);
          }

          const taskId = task.t_id ?? task.id;
          try {
            const detailResponse = await this.getTask(taskId);
            const detailData = detailResponse?.data || detailResponse || {};
            return normalizeIds({ ...task, ...detailData });
          } catch {
            return normalizeIds(task);
          }
        })
      );

      return data?.data ? { ...data, data: enriched } : enriched;
    } catch (error) {
      console.error('TaskService: Error fetching tasks:', error);
      return { data: [] };
    }
  }

  async getTask(id) {
    try {
      const response = await api.get(endpoints.tasks.byId(id));
      const data = response.data;
      const target = data?.data ?? data;
      if (target) {
        target.assign_to = target.assign_to != null ? Number(target.assign_to) : null;
        target.assignees = Array.isArray(target.assignees)
          ? target.assignees.map(Number).filter(Number.isFinite)
          : [];
        target.t_id = target.t_id != null ? Number(target.t_id) : null;
        target.id   = target.id   != null ? Number(target.id)   : null;
        target.p    = target.p    != null ? Number(target.p)    : null;
        target.parent = target.parent != null ? Number(target.parent) : null;
        target.progress = Number.isFinite(Number(target.progress)) ? Number(target.progress) : 0;
        target.subtask_count = Number(target.subtask_count) || 0;
        target.completed_subtasks = Number(target.completed_subtasks) || 0;
      }
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createTask(taskData) {
    try {
      const rawAssignees = Array.isArray(taskData.assignees)
        ? taskData.assignees
        : (taskData.assignTo != null && taskData.assignTo !== '' ? [taskData.assignTo] : []);
      const assignees = rawAssignees.map(v => Number(v)).filter(Number.isFinite);

      const payload = {
        title: taskData.title,
        desc: taskData.description || '',
        status: taskData.status || 'todo',
        priority: taskData.priority || 'medium',
        p: taskData.projectId || taskData.p,
        assignees: assignees,
        assign_to: assignees[0] ?? null,
        due_date: taskData.dueDate || null,
        start_date: taskData.startDate || null,
        progress: taskData.progress ?? 0,
      };

      const response = await api.post(endpoints.tasks.list, payload);
      return response.data;
    } catch (error) {
      console.error('TaskService: Error creating task:', error);
      throw this.handleError(error);
    }
  }

  async updateTask(id, taskData) {
    try {
      const rawAssignees = Array.isArray(taskData.assignees)
        ? taskData.assignees
        : (taskData.assignTo != null && taskData.assignTo !== '' ? [taskData.assignTo] : []);
      const assignees = rawAssignees.map(v => Number(v)).filter(Number.isFinite);

      const payload = {
        title: taskData.title,
        desc: taskData.description || '',
        status: taskData.status,
        priority: taskData.priority,
        progress: taskData.progress ?? undefined,
        assignees: assignees,
        assign_to: assignees[0] ?? null,
        due_date: taskData.dueDate || null,
        start_date: taskData.startDate || null,
      };

      const response = await api.patch(endpoints.tasks.byId(id), payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async assignTask(taskId, memberId) {
    try {
      const assignTo = memberId != null && memberId !== '' ? Number(memberId) : null;
      const response = await api.patch(endpoints.tasks.byId(taskId), {
        assignees: Number.isFinite(assignTo) ? [assignTo] : [],
        assign_to: Number.isFinite(assignTo) ? assignTo : null,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async unassignTask(taskId) {
    try {
      const response = await api.patch(endpoints.tasks.byId(taskId), {
        assignees: [],
        assign_to: null,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteTask(id) {
    try {
      const response = await api.delete(endpoints.tasks.byId(id));
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateTaskStatus(id, status) {
    try {
      const response = await api.patch(endpoints.tasks.byId(id), { status });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /* ─── Subtasks ─── */
  async getSubtasks(parentTaskId) {
    try {
      const response = await api.get(`/task/${parentTaskId}/subtasks`);
      const data = response.data;
      const subs = asArray(data?.data || data);
      return { data: subs };
    } catch (error) {
      console.error('TaskService: Error fetching subtasks:', error);
      return { data: [] };
    }
  }

  async createSubtask(parentTaskId, taskData) {
    try {
      const rawAssignees = Array.isArray(taskData.assignees)
        ? taskData.assignees
        : (taskData.assignTo != null && taskData.assignTo !== '' ? [taskData.assignTo] : []);
      const assignees = rawAssignees.map(v => Number(v)).filter(Number.isFinite);

      const payload = {
        title: taskData.title,
        desc: taskData.description || '',
        status: taskData.status || 'todo',
        priority: taskData.priority || 'medium',
        due_date: taskData.dueDate || null,
        start_date: taskData.startDate || null,
        progress: taskData.progress ?? 0,
        assignees: assignees,
        assign_to: assignees[0] ?? null,
      };

      const response = await api.post(`/task/${parentTaskId}/subtasks`, payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
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
    return {
      message: error.message || 'Network error occurred',
    };
  }
}

export default new TaskService();