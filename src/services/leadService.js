// src/services/leadService.js
import api from '../utils/api';

class LeadService {
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