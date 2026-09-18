// src/services/projectService.js
import api, { endpoints } from '../utils/api';

class ProjectService {
  async getProjects() {
    try {
      const response = await api.get(endpoints.projects.list);
      return response.data;
    } catch (error) {
      console.error('ProjectService: Error fetching projects:', error);
      return { data: [] };
    }
  }

  async getProject(id) {
    try {
      const response = await api.get(endpoints.projects.byId(id));
      return response.data;
    } catch (error) {
      console.error(`ProjectService: Error fetching project ${id}:`, error);
      return { data: null };
    }
  }

  async getProjectTasks(projectId) {
    try {
      const response = await api.get(`/projects/${projectId}/tasks`);
      const data = response.data;

      let tasksList = data?.data || data || [];

      if (Array.isArray(tasksList) && tasksList.length > 0 && !tasksList[0].assign_to) {
        const { default: taskService } = await import('./taskService');
        const detailedTasks = await Promise.all(
          tasksList.map(async (task) => {
            try {
              const detailResponse = await taskService.getTask(task.t_id || task.id);
              const detailData = detailResponse?.data || detailResponse;
              return {
                ...task,
                ...detailData,
                assign_to: detailData?.assign_to || null,
                assign_to_name: detailData?.assign_to_name || null,
              };
            } catch (error) {
              return { ...task, assign_to: null, assign_to_name: null };
            }
          })
        );
        return { data: detailedTasks };
      }

      return data;
    } catch (error) {
      console.error(`ProjectService: Error fetching tasks for project ${projectId}:`, error);
      return { data: [] };
    }
  }

  async getUserProjects(userId, userRole) {
    try {
      const response = await api.get(endpoints.projects.list);
      const allProjects = response.data?.data || response.data || [];

      let filteredProjects = [];

      if (userRole === 'supervisor' || userRole === 'manager' || userRole === 'admin') {
        filteredProjects = allProjects;
      } else {
        filteredProjects = allProjects;
      }

      console.log(`📊 Filtered projects for user ${userId} (${userRole}):`, filteredProjects.length);
      return { data: filteredProjects };
    } catch (error) {
      console.error('ProjectService: Error fetching user projects:', error);
      return { data: [] };
    }
  }

  async createProject(projectData) {
    try {
      const payload = {
        p_name: projectData.name,
        desc: projectData.description || '',
        priority: projectData.priority || 'medium',
        status: projectData.status || 'planning',
        deadline: projectData.deadline || null,
        start_at: projectData.startDate || null,
        created_by: projectData.created_by || null,
      };

      // 👇 NEW: include supervisors if the backend supports it
      if (Array.isArray(projectData.supervisors) && projectData.supervisors.length > 0) {
        payload.supervisors = projectData.supervisors;
      }

      console.log('📤 Creating project with payload:', payload);

      const response = await api.post(endpoints.projects.list, payload);
      return response.data;
    } catch (error) {
      console.error('ProjectService: Error creating project:', error);
      throw error;
    }
  }

  async updateProject(id, projectData) {
    try {
      const payload = {
        p_name: projectData.name,
        desc: projectData.description || '',
        priority: projectData.priority || 'medium',
        status: projectData.status || 'planning',
        deadline: projectData.deadline || null,
        start_at: projectData.startDate || null,
      };

      // 👇 NEW: include supervisors if the backend supports it
      if (Array.isArray(projectData.supervisors) && projectData.supervisors.length > 0) {
        payload.supervisors = projectData.supervisors;
      }

      console.log('📤 Updating project with payload:', payload);

      const response = await api.patch(endpoints.projects.byId(id), payload);
      return response.data;
    } catch (error) {
      console.error(`ProjectService: Error updating project ${id}:`, error);
      throw error;
    }
  }

  async deleteProject(id) {
    try {
      const response = await api.delete(endpoints.projects.byId(id));
      return response.data;
    } catch (error) {
      console.error(`ProjectService: Error deleting project ${id}:`, error);
      throw error;
    }
  }

  async getProjectMembers(projectId) {
    try {
      const tasksResponse = await api.get('/task');
      const allTasks = tasksResponse.data?.data || tasksResponse.data || [];

      const projectTasks = allTasks.filter(t => {
        const taskProjectId = t.p_id || t.p;
        return Number(taskProjectId) === Number(projectId);
      });

      const memberIds = [...new Set(projectTasks
        .filter(t => t.assign_to)
        .map(t => t.assign_to)
      )];

      if (memberIds.length === 0) {
        return { data: [] };
      }

      const membersResponse = await api.get('/team_members');
      const allMembers = membersResponse.data?.data || membersResponse.data || [];

      const projectMembers = allMembers.filter(m => memberIds.includes(m.id));

      return { data: projectMembers };
    } catch (error) {
      console.error(`ProjectService: Error getting members for project ${projectId}:`, error);
      return { data: [] };
    }
  }

  async getProjectStats(projectId) {
    try {
      const response = await api.get(`/projects/${projectId}/stats`);
      return response.data;
    } catch (error) {
      console.error(`ProjectService: Error fetching stats for project ${projectId}:`, error);
      return { data: null };
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

export default new ProjectService();