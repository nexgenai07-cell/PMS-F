// components/shared/ProjectTeamManager.jsx
import { useState, useEffect } from 'react';
import { Users, UserPlus, X, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import projectTeamService from '../../services/projectTeamService';
import teamService from '../../services/teamService';

export default function ProjectTeamManager({ projectId, onUpdate }) {
  const [members, setMembers] = useState([]);
  const [allTeamMembers, setAllTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [membersData, allMembersData] = await Promise.all([
        projectTeamService.getProjectMembers(projectId),
        teamService.getTeamMembers(),
      ]);

      let projectMembers = membersData?.data || membersData || [];
      const allMembers = allMembersData?.data || allMembersData || [];

      // Filter out members that are marked as deleted (is_deleted === 1)
      // Also filter out members that don't exist in the allMembers list
      const validProjectMembers = projectMembers.filter(m => {
        // Check if member exists in allMembers and is not deleted
        const exists = allMembers.some(am => Number(am.id) === Number(m.id));
        return exists && m.is_deleted !== 1;
      });

      // Filter all team members to only show active ones
      const activeAllMembers = allMembers.filter(m => m.is_deleted !== 1);

      setMembers(validProjectMembers);
      setAllTeamMembers(activeAllMembers);
    } catch (error) {
      console.error('Error fetching project team:', error);
      toast.error('Failed to load project team');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success('Team refreshed');
  };

  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId]);

  const handleAddMember = async () => {
    if (!selectedMember) {
      toast.error('Please select a team member');
      return;
    }

    setAdding(true);
    try {
      await projectTeamService.addMemberToProject(projectId, selectedMember);
      toast.success('Team member added to project');
      setSelectedMember('');
      setShowAddModal(false);
      await fetchData();
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Failed to add team member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (ptId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this project?`)) return;
    
    try {
      await projectTeamService.removeMemberFromProject(ptId);
      toast.success('Team member removed from project');
      await fetchData();
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Failed to remove team member');
    }
  };

  // Get members not already in the project (only active members)
  const availableMembers = allTeamMembers.filter(
    m => !members.some(pm => Number(pm.id) === Number(m.id))
  );

  if (loading) {
    return (
      <div className="project-team-loading">
        <Loader2 size={20} className="spin" />
        <span>Loading team...</span>
      </div>
    );
  }

  return (
    <div className="project-team-manager">
      <div className="project-team-header">
        <h4 className="project-team-title">
          <Users size={16} />
          Team Members
          <span className="project-team-count">{members.length}</span>
        </h4>
        <div className="project-team-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh team list"
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAddModal(true)}
            disabled={availableMembers.length === 0}
          >
            <UserPlus size={14} /> Add Member
          </button>
        </div>
      </div>

      <div className="project-team-list">
        {members.length === 0 ? (
          <div className="project-team-empty">
            <Users size={24} style={{ opacity: 0.3 }} />
            <p>No team members assigned</p>
            <span>Add members to this project</span>
          </div>
        ) : (
          members.map((member) => (
            <div key={member.id} className="project-team-member">
              <div className="member-avatar">
                {(member.name || '?')[0].toUpperCase()}
              </div>
              <div className="member-info">
                <span className="member-name">{member.name}</span>
                <span className="member-role">{member.role || 'Member'}</span>
              </div>
              <button
                className="member-remove-btn"
                onClick={() => handleRemoveMember(member.pt_id, member.name)}
                title="Remove from project"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Team Member</h3>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Select Team Member</label>
                <select
                  className="form-input"
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                >
                  <option value="">Select a member...</option>
                  {availableMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role || 'Member'})
                    </option>
                  ))}
                </select>
              </div>
              {availableMembers.length === 0 && (
                <p className="no-members-msg">
                  All active team members are already assigned to this project.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddMember}
                disabled={adding || !selectedMember}
              >
                {adding ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}
                {adding ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .project-team-manager {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .project-team-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .project-team-actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .project-team-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .project-team-count {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 1px 10px;
          border-radius: 20px;
        }

        .project-team-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .project-team-member {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          transition: all 0.15s;
        }

        .project-team-member:hover {
          border-color: var(--border-default);
        }

        .member-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent-muted);
          color: var(--accent-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .member-info {
          flex: 1;
          min-width: 0;
        }

        .member-name {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .member-role {
          font-size: 11px;
          color: var(--text-muted);
        }

        .member-remove-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.14s;
          opacity: 0.5;
        }

        .member-remove-btn:hover {
          opacity: 1;
          color: #f87171;
          background: rgba(248, 113, 113, 0.1);
        }

        .project-team-empty {
          text-align: center;
          padding: 20px 0;
          color: var(--text-muted);
        }

        .project-team-empty p {
          font-size: 13px;
          margin: 4px 0 2px;
        }

        .project-team-empty span {
          font-size: 11px;
        }

        .project-team-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 0;
          color: var(--text-muted);
        }

        .no-members-msg {
          text-align: center;
          padding: 10px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }

        .modal-box {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          width: 100%;
          max-width: 420px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .modal-title {
          font-size: 17px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .modal-close-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.14s;
        }

        .modal-close-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .modal-body {
          padding: 18px 20px;
        }

        .modal-footer {
          display: flex;
          gap: 10px;
          padding: 14px 20px 20px;
          border-top: 1px solid var(--border-subtle);
          justify-content: flex-end;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .form-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .form-input {
          padding: 9px 12px;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          transition: all 0.2s;
          font-family: inherit;
          width: 100%;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: none;
        }

        .btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
        }

        .btn-secondary:hover:not(:disabled) {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          background: var(--bg-card);
        }

        .btn-primary {
          background: var(--accent-primary);
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.85;
          transform: translateY(-1px);
        }

        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}