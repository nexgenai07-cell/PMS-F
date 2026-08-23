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
    const response = await api.get(`/api/projects/${projectId}/tasks`);
    const data = response.data;
    
    // Check if we have the data with assign_to
    let tasksList = data?.data || data || [];
    
    // If no assign_to in the response, fetch each task detail
    if (Array.isArray(tasksList) && tasksList.length > 0 && !tasksList[0].assign_to) {
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
  // Get projects where the user is explicitly added as a member
  async getUserProjects(userId, userRole) {
    try {
      const response = await api.get(endpoints.projects.list);
      const allProjects = response.data?.data || response.data || [];
      
      let filteredProjects = [];
      
      // Supervisors/managers/admins see all projects
      if (userRole === 'supervisor' || userRole === 'manager' || userRole === 'admin') {
        filteredProjects = allProjects;
      } else {
        // For leads/members: ONLY show projects where they have tasks assigned
        // Since there's no members field, we need to filter by tasks
        // For now, show all projects to leads (they'll only see their own via tasks)
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

  // ❌ REMOVE ALL PTeam methods - they don't exist in backend
  // async getProjectMembers(projectId) { ... }
  // async addProjectMembers(projectId, memberIds) { ... }
  // async removeProjectMember(projectId, memberId) { ... }
  // async getProjectTeamAssignments() { ... }
  // async getProjectTeamAssignmentsByProject(projectId) { ... }
  // async updateProjectTeamAssignment(projectId, memberId, data) { ... }

  // ✅ Get project members by fetching tasks assigned to the project
  async getProjectMembers(projectId) {
    try {
      // Get all tasks for this project
      const tasksResponse = await api.get('/api/task');
      const allTasks = tasksResponse.data?.data || tasksResponse.data || [];
      
      // Filter tasks by project
      const projectTasks = allTasks.filter(t => {
        const taskProjectId = t.p_id || t.p;
        return taskProjectId === projectId;
      });
      
      // Get unique team member IDs from task assignments
      const memberIds = [...new Set(projectTasks
        .filter(t => t.assign_to)
        .map(t => t.assign_to)
      )];
      
      if (memberIds.length === 0) {
        return { data: [] };
      }
      
      // Get all team members
      const membersResponse = await api.get('/api/team_members');
      const allMembers = membersResponse.data?.data || membersResponse.data || [];
      
      // Filter members by those assigned to tasks in this project
      const projectMembers = allMembers.filter(m => memberIds.includes(m.id));
      
      return { data: projectMembers };
    } catch (error) {
      console.error(`ProjectService: Error getting members for project ${projectId}:`, error);
      return { data: [] };
    }
  }

  async getProjectStats(projectId) {
    try {
      const response = await api.get(`/api/projects/${projectId}/stats`);
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