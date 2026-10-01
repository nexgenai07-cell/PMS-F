import api, { endpoints } from '../utils/api';

class LeadService {
  async getLeadStats() {
    try {
      const response = await api.get(endpoints.leads.stats);
      return response.data;
    } catch (error) {
      console.error('LeadService: Error fetching lead stats:', error);
      return { data: [] };
    }
  }
}

export default new LeadService();