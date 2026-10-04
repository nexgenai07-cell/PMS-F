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
          // Ensure role is present
          role: member.role || 'Member',
        }));
      } else if (Array.isArray(data)) {
        data.forEach(member => {
          member.id = Number(member.id);
          member.added_by = member.added_by ? Number(member.added_by) : null;
          member.role = member.role || 'Member';
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
        data.data.role = data.data.role || 'Member';
      } else if (data) {
        data.id = Number(data.id);
        data.added_by = data.added_by ? Number(data.added_by) : null;
        data.role = data.role || 'Member';
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getTeamMemberStats(memberId) {
    try {
      const response = await api.get(`/team-members/${memberId}/stats`);

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
  email: memberData.email || '',         // ← must be present
  desc: memberData.description || '',
  skills: memberData.skills || '',
  role: memberData.role || 'Member',
  qualitifcation: memberData.qualification || '',
  experience: parseInt(memberData.experience) || 0,
};
      
      console.log('📤 Adding team member with payload:', payload);
      
      const response = await api.post(endpoints.teamMembers.list, payload);
      const data = response.data;
      
      if (data?.data) {
        data.data.id = Number(data.data.id);
        data.data.role = data.data.role || 'Member';
      } else if (data) {
        data.id = Number(data.id);
        data.role = data.role || 'Member';
      }
      
      return data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

   async createUserAndTeamMember(userData, memberData) {
    try {
      // Step 1: Create user
      const userPayload = {
        u_name: userData.u_name || memberData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role || memberData.role || 'member',
      };

      const userResponse = await api.post(endpoints.auth.register, userPayload);
      const newUser = userResponse.data?.data || userResponse.data || userResponse;

      // Step 2: Create team member linked to user
      const memberPayload = {
        name: memberData.name,
        desc: memberData.description || '',
        skills: memberData.skills || '',
        role: memberData.role || 'member',
        qualitifcation: memberData.qualification || '',
        experience: parseInt(memberData.experience) || 0,
        added_by: newUser.id || newUser.user_id,
      };

      const memberResponse = await api.post(endpoints.teamMembers.list, memberPayload);
      const newMember = memberResponse.data?.data || memberResponse.data || memberResponse;

      return {
        success: true,
        user: newUser,
        teamMember: newMember,
      };
    } catch (error) {
      console.error('Error creating user and team member:', error);
      throw this.handleError(error);
    }
  }
  
  async updateTeamMember(id, memberData) {
    try {
      const payload = {
        name: memberData.name,
        desc: memberData.description || '',
        skills: memberData.skills || '',
        role: memberData.role || 'Member',
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