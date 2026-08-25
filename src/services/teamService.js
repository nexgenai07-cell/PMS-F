// src/services/teamService.js
import api, { endpoints } from '../utils/api';

class TeamService {
  async getTeamMembers() {
    try {
      const response = await api.get(endpoints.teamMembers.list);
      const data = response.data;
      
      // ✅ Ensure IDs are numbers
      if (data?.data && Array.isArray(data.data)) {
        data.data = data.data.map(member => ({
          ...member,
          id: Number(member.id),
          added_by: member.added_by ? Number(member.added_by) : null,
        }));
      } else if (Array.isArray(data)) {
        data.forEach(member => {
          member.id = Number(member.id);
          member.added_by = member.added_by ? Number(member.added_by) : null;
        });
      }
      
      console.log('📊 Team members loaded with normalized IDs:', data?.data || data);
      return data;
    } catch (error) {
      console.error('TeamService: Error fetching team members:', error);
      return { data: [] };
    }
  }

  async getTeamMember(id) {
    try {
      const response = await api.get(endpoints.teamMembers.byId(id));
      const data = response.data;
      
      if (data?.data) {
        data.data.id = Number(data.data.id);
        data.data.added_by = data.data.added_by ? Number(data.data.added_by) : null;
      } else if (data) {
        data.id = Number(data.id);
        data.added_by = data.added_by ? Number(data.added_by) : null;
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }
async getTeamMemberStats(memberId) {
  try {
    const response = await api.get(`/api/team-members/${memberId}/stats`);
    return response.data;
  } catch (error) {
    console.error('Error fetching team member stats:', error);
    return { data: null };
  }
}
  async addTeamMember(memberData) {
    try {
      const payload = {
        name: memberData.name,
        desc: memberData.description || '',
        skills: memberData.skills || '',
        role: memberData.role || '',
        qualitifcation: memberData.qualification || '',
        experience: parseInt(memberData.experience) || 0,
      };
      
      console.log('📤 Adding team member with payload:', payload);
      
      const response = await api.post(endpoints.teamMembers.list, payload);
      const data = response.data;
      
      if (data?.data) {
        data.data.id = Number(data.data.id);
      } else if (data) {
        data.id = Number(data.id);
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateTeamMember(id, memberData) {
    try {
      const payload = {
        name: memberData.name,
        desc: memberData.description || '',
        skills: memberData.skills || '',
        role: memberData.role || '',
        qualitifcation: memberData.qualification || '',
        experience: parseInt(memberData.experience) || 0,
      };
      
      console.log('📤 Updating team member with payload:', payload);
      
      const response = await api.patch(endpoints.teamMembers.byId(id), payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteTeamMember(id) {
    try {
      const response = await api.delete(endpoints.teamMembers.byId(id));
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

export default new TeamService();