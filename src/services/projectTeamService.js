// src/services/projectTeamService.js
import api, { endpoints } from '../utils/api';

class ProjectTeamService {
  // Get all PTeam entries (optionally filter by project)
  async getProjectTeams(projectId = null) {
    try {
      let url = endpoints.pteam.list;
      if (projectId) {
        url = endpoints.pteam.byProject(projectId);
      }
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('ProjectTeamService: Error fetching project teams:', error);
      return { data: [] };
    }
  }

  // Get all team members for a specific project
  async getProjectMembers(projectId) {
    try {
      const response = await api.get(endpoints.pteam.byProject(projectId));
      const data = response.data;
      
      // Extract team members from the response
      const teamEntries = data?.data || data || [];
      const members = teamEntries.map(entry => ({
        ...entry.tm,
        pt_id: entry.pt_id,
        project_id: entry.p,
        task_id: entry.t,
        member_name: entry.member_name,
        project_name: entry.project_name,
        task_title: entry.task_title,
      }));
      
      return { success: true, data: members, raw: teamEntries };
    } catch (error) {
      console.error(`ProjectTeamService: Error fetching members for project ${projectId}:`, error);
      return { data: [] };
    }
  }

  // Add a team member to a project
  async addMemberToProject(projectId, teamMemberId, taskId = null) {
    try {
      const payload = {
        p: projectId,
        tm: teamMemberId,
        t: taskId,
      };
      
      console.log('📤 Adding team member to project:', payload);
      
      const response = await api.post(endpoints.pteam.add, payload);
      return response.data;
    } catch (error) {
      console.error('ProjectTeamService: Error adding member to project:', error);
      throw error;
    }
  }

  // Remove a team member from a project
  async removeMemberFromProject(ptId) {
    try {
      const response = await api.delete(endpoints.pteam.remove(ptId));
      return response.data;
    } catch (error) {
      console.error(`ProjectTeamService: Error removing member (pt_id: ${ptId}):`, error);
      throw error;
    }
  }

  // Get a specific PTeam entry
  async getProjectTeamEntry(ptId) {
    try {
      const response = await api.get(endpoints.pteam.byId(ptId));
      return response.data;
    } catch (error) {
      console.error(`ProjectTeamService: Error fetching PTeam entry ${ptId}:`, error);
      return { data: null };
    }
  }

  // Check if a team member is in a project
  async isMemberInProject(projectId, teamMemberId) {
    try {
      const response = await this.getProjectMembers(projectId);
      const members = response.data || [];
      return members.some(m => Number(m.id) === Number(teamMemberId));
    } catch (error) {
      console.error('ProjectTeamService: Error checking member in project:', error);
      return false;
    }
  }

  // Get all projects for a team member
  async getMemberProjects(teamMemberId) {
    try {
      const response = await api.get(endpoints.pteam.list);
      const data = response.data?.data || response.data || [];
      
      // Filter entries for this team member
      const memberEntries = data.filter(entry => Number(entry.tm) === Number(teamMemberId));
      
      // Extract project IDs
      const projectIds = memberEntries.map(entry => entry.p);
      
      return { success: true, data: projectIds, entries: memberEntries };
    } catch (error) {
      console.error(`ProjectTeamService: Error fetching projects for member ${teamMemberId}:`, error);
      return { data: [] };
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

export default new ProjectTeamService();