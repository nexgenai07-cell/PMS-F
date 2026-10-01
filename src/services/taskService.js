// src/services/taskService.js
import api, { endpoints } from '../utils/api';

class TaskService {
  /**
   * GET /api/task
   *
   * Returns the raw task list, enriched with full detail from each task's
   * detail endpoint when the list is missing critical fields
   * (assign_to, assign_to_name, progress).
   */
  async getTasks() {
    try {
      const response = await api.get(endpoints.tasks.list);
      const data = response.data;

      let tasksList = data?.data || data || [];
      if (!Array.isArray(tasksList) || tasksList.length === 0) {
        return data;
      }

      // Only enrich tasks that are missing critical fields.
      const needsEnrichment = (t) =>
        t.assign_to === undefined || t.assign_to === null;

      const enriched = await Promise.all(
        tasksList.map(async (task) => {
          const taskId = task.t_id ?? task.id;

          if (!needsEnrichment(task)) {
            // Already good — normalize numeric fields only.
            return {
              ...task,
              t_id: taskId ? Number(taskId) : null,
              id: taskId ? Number(taskId) : null,
              assign_to: task.assign_to != null ? Number(task.assign_to) : null,
              progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : 0,
            };
          }

          try {
            const detailResponse = await this.getTask(taskId);
            const detailData = detailResponse?.data || detailResponse || {};

            // Assignee-change detection:
            // If the list's `assign_to` differs from the detail's `assign_to`,
            // the task was reassigned since the list was cached. In that case
            // the list's `assign_to_name` is STALE and must NOT be trusted —
            // only the detail's name is authoritative.
            const listAssignee   = task.assign_to != null ? Number(task.assign_to) : null;
            const detailAssignee = detailData?.assign_to != null ? Number(detailData.assign_to) : null;
            const assigneeChanged = listAssignee !== detailAssignee;

            const resolvedAssignTo = detailData?.assign_to != null
              ? Number(detailData.assign_to)
              : (task.assign_to != null ? Number(task.assign_to) : null);

            const resolvedAssignToName = assigneeChanged
              ? (detailData?.assign_to_name ?? null)
              : (detailData?.assign_to_name ?? task.assign_to_name ?? null);

            return {
              ...task,
              ...detailData,
              t_id: taskId ? Number(taskId) : null,
              id: taskId ? Number(taskId) : null,
              assign_to: resolvedAssignTo,
              assign_to_name: resolvedAssignToName,
              progress: Number.isFinite(Number(detailData?.progress))
                ? Number(detailData.progress)
                : (Number.isFinite(Number(task.progress)) ? Number(task.progress) : 0),
            };
          } catch (err) {
            return {
              ...task,
              t_id: taskId ? Number(taskId) : null,
              id: taskId ? Number(taskId) : null,
              assign_to: task.assign_to != null ? Number(task.assign_to) : null,
              assign_to_name: task.assign_to_name || null,
              progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : 0,
            };
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
        target.t_id      = target.t_id != null ? Number(target.t_id) : null;
        target.id        = target.id != null ? Number(target.id) : null;
        target.p         = target.p != null ? Number(target.p) : null;
        target.progress  = Number.isFinite(Number(target.progress))
          ? Number(target.progress)
          : 0;
      }

      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createTask(taskData) {
    try {
      const rawAssign = Array.isArray(taskData.assignTo)
        ? taskData.assignTo[0]
        : taskData.assignTo;
      const assignTo = rawAssign != null && rawAssign !== ''
        ? Number(rawAssign)
        : null;

      const payload = {
        title: taskData.title,
        desc: taskData.description || '',
        status: taskData.status || 'todo',
        priority: taskData.priority || 'medium',
        p: taskData.projectId || taskData.p,
        assign_to: Number.isFinite(assignTo) ? assignTo : null,
        due_date: taskData.dueDate || null,
        start_date: taskData.startDate || null,
        progress: taskData.progress ?? 0,
      };

      console.log('📤 Creating task with payload:', payload);

      const response = await api.post(endpoints.tasks.list, payload);
      const data = response.data;

      const target = data?.data ?? data;
      if (target) {
        target.assign_to = target.assign_to != null ? Number(target.assign_to) : null;
        target.t_id      = target.t_id != null ? Number(target.t_id) : null;
        target.id        = target.id != null ? Number(target.id) : null;
        target.progress  = Number.isFinite(Number(target.progress))
          ? Number(target.progress)
          : 0;
      }

      return data;
    } catch (error) {
      console.error('TaskService: Error creating task:', error);
      throw this.handleError(error);
    }
  }

  async updateTask(id, taskData) {
    try {
      const rawAssign = Array.isArray(taskData.assignTo)
        ? taskData.assignTo[0]
        : taskData.assignTo;
      const assignTo = rawAssign != null && rawAssign !== ''
        ? Number(rawAssign)
        : null;

      const payload = {
        title: taskData.title,
        desc: taskData.description || '',
        status: taskData.status,
        priority: taskData.priority,
        progress: taskData.progress ?? undefined,
        assign_to: Number.isFinite(assignTo) ? assignTo : null,
        due_date: taskData.dueDate || null,
        start_date: taskData.startDate || null,
      };

      console.log('📤 Updating task with payload:', payload);

      const response = await api.patch(endpoints.tasks.byId(id), payload);
      const data = response.data;

      const target = data?.data ?? data;
      if (target) {
        target.assign_to = target.assign_to != null ? Number(target.assign_to) : null;
        target.t_id      = target.t_id != null ? Number(target.t_id) : null;
        target.id        = target.id != null ? Number(target.id) : null;
        target.progress  = Number.isFinite(Number(target.progress))
          ? Number(target.progress)
          : 0;
      }

      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async assignTask(taskId, memberId) {
    try {
      const assignTo = memberId != null && memberId !== ''
        ? Number(memberId)
        : null;
      const response = await api.patch(endpoints.tasks.byId(taskId), {
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
      const response = await api.patch(endpoints.tasks.byId(id), {
        status: status,
      });
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