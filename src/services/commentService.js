// src/services/commentService.js
import api, { endpoints } from '../utils/api';

class CommentService {
  // Get all comments
  async getComments() {
    try {
      const response = await api.get(endpoints.comments.list);
      return response.data;
    } catch (error) {
      console.error('CommentService: Error fetching comments:', error);
      return { data: [] };
    }
  }

  // Get comments for a specific task
  async getCommentsByTask(taskId) {
    try {
      const response = await api.get(endpoints.comments.byTask(taskId));
      return response.data;
    } catch (error) {
      console.error(`CommentService: Error fetching comments for task ${taskId}:`, error);
      return { data: [] };
    }
  }

  // Get a single comment
  async getComment(id) {
    try {
      const response = await api.get(endpoints.comments.byId(id));
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Add a new comment
  async addComment(commentData) {
    try {
      const payload = {
        t: commentData.taskId,      // Task ID (foreign key)
        desc: commentData.desc,      // Comment content
        priority: commentData.priority || 'normal',
        pin: commentData.pin || false,
      };
      
      console.log('📤 Adding comment with payload:', payload);
      
      const response = await api.post(endpoints.comments.list, payload);
      console.log('✅ Comment added:', response.data);
      return response.data;
    } catch (error) {
      console.error('CommentService: Error adding comment:', error);
      throw this.handleError(error);
    }
  }
// Update comment priority
async updatePriority(id, priority) {
  try {
    const response = await api.patch(endpoints.comments.byId(id), {
      priority: priority, // 'low', 'normal', 'high'
    });
    return response.data;
  } catch (error) {
    throw this.handleError(error);
  }
}

  // Update a comment
  async updateComment(id, commentData) {
    try {
      const payload = {
        desc: commentData.desc,
        priority: commentData.priority,
        pin: commentData.pin,
      };
      
      console.log('📤 Updating comment with payload:', payload);
      
      const response = await api.patch(endpoints.comments.byId(id), payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Delete a comment
  async deleteComment(id) {
    try {
      const response = await api.delete(endpoints.comments.byId(id));
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Toggle pin status of a comment
  async togglePin(id) {
    try {
      const response = await api.patch(endpoints.comments.pin(id));
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

export default new CommentService();