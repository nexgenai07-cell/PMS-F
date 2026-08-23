// src/services/notificationHelper.js
// This is now empty - notifications are generated from existing data
export const NotificationHelper = {
  // All methods are no longer needed since we fetch from existing data
  // Keeping for compatibility
  async taskCreated() { return null; },
  async taskUpdated() { return null; },
  async taskAssigned() { return null; },
  async taskCompleted() { return null; },
  async commentAdded() { return null; },
  async commentPinned() { return null; },
  async memberAdded() { return null; },
  async leadAssigned() { return null; },
};

export default NotificationHelper;