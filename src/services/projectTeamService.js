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

      const memberEntries = data.filter(entry => Number(entry.tm) === Number(teamMemberId));

      const projectIds = memberEntries.map(entry => entry.p);

      return { success: true, data: projectIds, entries: memberEntries };
    } catch (error) {
      console.error(`ProjectTeamService: Error fetching projects for member ${teamMemberId}:`, error);
      return { data: [] };
    }
  }

  /**
   * Promote a Lead to be a Project Lead (supervisor role on this project).
   *
   * Uses the existing PATCH /api/projects/<id> endpoint with the `supervisors`
   * array — the backend already validates this field and uses it to grant
   * project visibility.
   *
   * `existingSupervisorIds` should be the current list of supervisor user ids
   * on the project so we don't drop anyone when we merge.
   */
  async promoteLeadOnProject(projectId, leadUserId, existingSupervisorIds = []) {
    try {
      const merged = Array.from(new Set([
        ...existingSupervisorIds.map(Number),
        Number(leadUserId),
      ]));

      console.log(`📤 Promoting user ${leadUserId} to Project Lead on project ${projectId}`);

      const response = await api.patch(endpoints.projects.byId(projectId), {
        supervisors: merged,
      });
      return response.data;
    } catch (error) {
      console.error(`ProjectTeamService: Error promoting lead ${leadUserId}:`, error);
      throw error;
    }
  }

  /**
   * Ensure a Lead also exists as a TeamMember row for this project, by
   * converting their User account into a TeamMember (if not already done)
   * and then creating a PTeam link.
   *
   * This is the "add this lead as a team member" path.
   */
  async addLeadAsTeamMember(projectId, leadUser, existingTeamMembers = []) {
    try {
      // 1. Does a TeamMember profile already exist for this Lead (by name)?
      const nameLower = (leadUser?.u_name || leadUser?.name || '').toLowerCase().trim();
      let teamMemberId = null;

      const byName = existingTeamMembers.find(m =>
        (m.name || '').toLowerCase().trim() === nameLower
      );
      if (byName) {
        teamMemberId = Number(byName.id);
      }

      // 2. If not, create one via the team-members endpoint.
      if (!teamMemberId) {
        console.log(`📤 Creating TeamMember profile for Lead "${leadUser.u_name || leadUser.name}"`);

        const created = await api.post(endpoints.teamMembers.list, {
          name: leadUser.u_name || leadUser.name,
          role: 'Lead',
          email: leadUser.email || '',
          added_by: leadUser.id,
        });

        const createdData = created.data?.data || created.data;
        teamMemberId = Number(createdData?.id);
      }

      if (!teamMemberId) throw new Error('Could not resolve TeamMember id for lead');

      // 3. Add them to the project's team (PTeam).
      const linkResponse = await api.post(endpoints.pteam.add, {
        p: projectId,
        tm: teamMemberId,
      });
      return linkResponse.data;
    } catch (error) {
      console.error('ProjectTeamService: Error adding lead as team member:', error);
      throw error;
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