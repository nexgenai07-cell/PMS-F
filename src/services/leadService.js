// src/services/leadService.js
import api from '../utils/api';

class LeadService {
  /**
   * GET /api/leads/stats/
   *
   * Returns server-computed stats for every lead-ish user.
   * Backend handles the tricky TeamMember-by-name matching, so the
   * frontend doesn't have to guess.
   */
  async getLeadsStats() {
    try {
      const response = await api.get('/leads/stats/');
      return response.data;
    } catch (error) {
      console.error('LeadService: Error fetching lead stats:', error);
      return { success: false, data: [] };
    }
  }
}

export default new LeadService();