// src/services/taskService.js
import api, { endpoints } from '../utils/api';

class TaskService {
  async getTasks() {
    try {
      const response = await api.get(endpoints.tasks.list);
      const data = response.data;
      
      // ✅ Get the tasks list
      let tasksList = data?.data || data || [];
      
      // ✅ For each task, fetch its details to get assign_to
      if (Array.isArray(tasksList) && tasksList.length > 0) {
        const detailedTasks = await Promise.all(
          tasksList.map(async (task) => {
            try {
              const detailResponse = await this.getTask(task.t_id || task.id);
              const detailData = detailResponse?.data || detailResponse;
              // Merge the detail data with the list data
              return {
                ...task,
                ...detailData,
                assign_to: detailData?.assign_to || task.assign_to || null,
                assign_to_name: detailData?.assign_to_name || task.assign_to_name || null,
              };
            } catch (error) {
              // If detail fetch fails, return the task without assign_to
              return {
                ...task,
                assign_to: null,
                assign_to_name: null,
              };
            }
          })
        );
        
        // Return the enriched data
        if (data?.data) {
          return { ...data, data: detailedTasks };
        }
        return detailedTasks;
      }
      
      return data;
    } catch (error) {
      console.error('TaskService: Error fetching tasks:', error);
      return { data: [] };
    }
  }

  async getTask(id) {
    try {
      const response = await api.get(endpoints.tasks.byId(id));
      const data = response.data;
      
      // Normalize assign_to
      if (data?.data) {
        data.data.assign_to = data.data.assign_to ? Number(data.data.assign_to) : null;
        data.data.t_id = data.data.t_id ? Number(data.data.t_id) : null;
        data.data.id = data.data.id ? Number(data.data.id) : null;
        data.data.p = data.data.p ? Number(data.data.p) : null;
      } else if (data) {
        data.assign_to = data.assign_to ? Number(data.assign_to) : null;
        data.t_id = data.t_id ? Number(data.t_id) : null;
        data.id = data.id ? Number(data.id) : null;
        data.p = data.p ? Number(data.p) : null;
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }
 async createTask(taskData) {
    try {
      const payload = {
        title: taskData.title,
        desc: taskData.description || '',
        status: taskData.status || 'todo',
        priority: taskData.priority || 'medium',
        p: taskData.projectId || taskData.p,  // Project ID (foreign key)
        assign_to: taskData.assignTo || null,  // TeamMember ID
        due_date: taskData.dueDate || null,
        start_date: taskData.startDate || null,
      };
      
      console.log('📤 Creating task with payload:', payload);
      
      const response = await api.post(endpoints.tasks.list, payload);
      const data = response.data;
      
      // ✅ Normalize assign_to in response
      if (data?.data) {
        data.data.assign_to = data.data.assign_to ? Number(data.data.assign_to) : null;
        data.data.t_id = data.data.t_id ? Number(data.data.t_id) : null;
        data.data.id = data.data.id ? Number(data.data.id) : null;
      } else if (data) {
        data.assign_to = data.assign_to ? Number(data.assign_to) : null;
        data.t_id = data.t_id ? Number(data.t_id) : null;
        data.id = data.id ? Number(data.id) : null;
      }
      
      console.log('✅ Task created with assign_to:', data?.assign_to || data?.data?.assign_to);
      return data;
    } catch (error) {
      console.error('TaskService: Error creating task:', error);
      throw this.handleError(error);
    }
  }
  
  async updateTask(id, taskData) {
    try {
      const payload = {
        title: taskData.title,
        desc: taskData.description || '',
        status: taskData.status,
        priority: taskData.priority,
        assign_to: taskData.assignTo || null,
        due_date: taskData.dueDate || null,
        start_date: taskData.startDate || null,
      };
      
      console.log('📤 Updating task with payload:', payload);
      
      const response = await api.patch(endpoints.tasks.byId(id), payload);
      const data = response.data;
      
      // ✅ Normalize assign_to
      if (data?.data) {
        data.data.assign_to = data.data.assign_to ? Number(data.data.assign_to) : null;
        data.data.t_id = data.data.t_id ? Number(data.data.t_id) : null;
        data.data.id = data.data.id ? Number(data.data.id) : null;
      } else if (data) {
        data.assign_to = data.assign_to ? Number(data.assign_to) : null;
        data.t_id = data.t_id ? Number(data.t_id) : null;
        data.id = data.id ? Number(data.id) : null;
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async assignTask(taskId, memberId) {
    try {
      const response = await api.patch(endpoints.tasks.byId(taskId), {
        assign_to: memberId,
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
        message: error.response.data.message || error.response.data.detail || 'An error occurred',
        data: error.response.data,
      };
    }
    return {
      message: error.message || 'Network error occurred',
    };
  }
}

export default new TaskService();