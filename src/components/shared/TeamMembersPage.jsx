// src/components/shared/TeamMembersPage.jsx
import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users,
  User,
  Mail,
  Briefcase,
  Calendar,
  Search,
  X,
  RefreshCw,
  UserCog,
  Shield,
  Star,
  Code,
  UserCheck,
  MoreHorizontal,
} from "lucide-react";
import toast from "react-hot-toast";

import Topbar from "./Topbar";
import { Avatar } from "./UIComponents";
import teamService from "../../services/teamService";
import userService from "../../services/userService";
import { useAuth } from "../../context/AuthContext";

const ROLE_COLORS = {
  admin: { bg: "rgba(167, 139, 250, 0.15)", color: "#a78bfa", icon: Shield },
  manager: { bg: "rgba(129, 140, 248, 0.15)", color: "#818cf8", icon: Shield },
  supervisor: { bg: "rgba(52, 211, 153, 0.15)", color: "#34d399", icon: Star },
  lead: { bg: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", icon: Star },
  member: { bg: "rgba(148, 163, 184, 0.15)", color: "#94a3b8", icon: User },
  developer: { bg: "rgba(45, 212, 191, 0.15)", color: "#2dd4bf", icon: Code },
};

const getRoleColor = (role) => {
  const key = role?.toLowerCase() || 'member';
  return ROLE_COLORS[key] || ROLE_COLORS.member;
};

const getInitials = (name) => {
  if (!name) return "?";
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

export default function TeamMembersPage() {
  const { user } = useAuth();
  const ctx = useOutletContext?.() || {};
  const onMenuClick = ctx.onMenuClick;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all"); // "all", "users", "team"

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersResponse, teamResponse] = await Promise.all([
        userService.getUsers(),
        teamService.getTeamMembers(),
      ]);

      const usersList = usersResponse?.data || usersResponse || [];
      const teamList = teamResponse?.data || teamResponse || [];

      setUsers(usersList);
      setTeamMembers(teamList);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load members");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success("Refreshed");
  };

  // Check if a user is a team member
  const isTeamMember = (userId) => {
    const user = users.find(u => (u.id || u.u_id) === userId);
    if (!user) return false;
    return teamMembers.some(m => {
      const memberName = (m.name || '').toLowerCase().trim();
      const userName = (user.u_name || '').toLowerCase().trim();
      return memberName === userName;
    });
  };

  // Get team member data for a user
  const getTeamMemberForUser = (userId) => {
    const user = users.find(u => (u.id || u.u_id) === userId);
    if (!user) return null;
    return teamMembers.find(m => {
      const memberName = (m.name || '').toLowerCase().trim();
      const userName = (user.u_name || '').toLowerCase().trim();
      return memberName === userName;
    });
  };

  // Get all members with user and team info
  const getAllMembers = () => {
    return users.map(u => {
      const userId = u.id || u.u_id;
      const tm = getTeamMemberForUser(userId);
      const hasTeamProfile = !!tm;
      return {
        ...u,
        userId,
        teamMember: tm,
        hasTeamProfile,
        role: tm?.role || u.role || 'Member',
        displayName: u.u_name || u.name || 'Unknown',
        email: u.email || '',
      };
    });
  };

  // Filter members
  const filteredMembers = getAllMembers().filter(m => {
    const searchMatch = m.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         m.email.toLowerCase().includes(searchTerm.toLowerCase());
    const roleMatch = roleFilter === "all" || m.role?.toLowerCase() === roleFilter.toLowerCase();
    return searchMatch && roleMatch;
  });

  // Filter by tab
  const tabFilteredMembers = filteredMembers.filter(m => {
    if (activeTab === "team") return m.hasTeamProfile;
    if (activeTab === "users") return !m.hasTeamProfile;
    return true;
  });

  // Get unique roles for filter
  const uniqueRoles = [...new Set(users.map(u => u.role))].filter(Boolean);

  if (loading) {
    return (
      <div>
        <Topbar title="Members" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <div style={{ 
              width: 40, height: 40, 
              border: '3px solid var(--border-subtle)', 
              borderTopColor: 'var(--accent-primary)', 
              borderRadius: '50%', 
              animation: 'spin 0.8s linear infinite' 
            }} />
          </div>
        </div>
      </div>
    );
  }

  const totalUsers = users.length;
  const totalTeamMembers = teamMembers.length;

  return (
    <div>
      <Topbar 
        title="Members" 
        onMenuClick={onMenuClick}
        actions={
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div className="page-container">
        {/* Stats */}
        <div className="tm-stats-row">
          <div className="tm-stat-card">
            <div className="tm-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8' }}>
              <Users size={18} />
            </div>
            <div className="tm-stat-info">
              <span className="tm-stat-value">{totalUsers}</span>
              <span className="tm-stat-label">Total Users</span>
            </div>
          </div>
          <div className="tm-stat-card">
            <div className="tm-stat-icon" style={{ background: 'rgba(52, 211, 153, 0.12)', color: '#34d399' }}>
              <UserCheck size={18} />
            </div>
            <div className="tm-stat-info">
              <span className="tm-stat-value">{totalTeamMembers}</span>
              <span className="tm-stat-label">Team Members</span>
            </div>
          </div>
          <div className="tm-stat-card">
            <div className="tm-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
              <User size={18} />
            </div>
            <div className="tm-stat-info">
              <span className="tm-stat-value">{totalUsers - totalTeamMembers}</span>
              <span className="tm-stat-label">Without Profile</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tm-tabs">
          <button 
            className={`tm-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button 
            className={`tm-tab ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            <UserCheck size={14} /> Team Members ({totalTeamMembers})
          </button>
          <button 
            className={`tm-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <User size={14} /> Users ({totalUsers - totalTeamMembers})
          </button>
        </div>

        {/* Search & Filters */}
        <div className="tm-filters-container">
          <div className="tm-search-wrapper">
            <Search size={16} className="tm-search-icon" />
            <input
              className="tm-search-input"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="tm-search-clear" onClick={() => setSearchTerm('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="tm-filter-group">
            <select 
              className="tm-filter-select" 
              value={roleFilter} 
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map(role => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Members Grid */}
        {tabFilteredMembers.length === 0 ? (
          <div className="tm-empty">
            <Users size={48} style={{ opacity: 0.3 }} />
            <h3>No members found</h3>
            <p>Try adjusting your filters</p>
          </div>
        ) : (
          <div className="tm-grid">
            {tabFilteredMembers.map((m) => {
              const roleInfo = getRoleColor(m.role);
              const RoleIcon = roleInfo.icon;
              const userId = m.userId;

              return (
                <motion.div 
                  key={userId} 
                  className={`tm-card ${m.hasTeamProfile ? 'has-profile' : 'no-profile'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="tm-card-header">
                    <div className="tm-avatar" style={{ borderColor: roleInfo.color }}>
                      {getInitials(m.displayName)}
                    </div>
                    <div className="tm-user-info">
                      <h4 className="tm-user-name">{m.displayName}</h4>
                      <span className="tm-user-email">
                        <Mail size={12} /> {m.email}
                      </span>
                    </div>
                  </div>

                  <div className="tm-card-body">
                    <div className="tm-detail-row">
                      <div className="tm-role-badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                        <RoleIcon size={12} />
                        {m.role || 'Member'}
                      </div>
                      {m.hasTeamProfile ? (
                        <span className="tm-profile-status active">
                          <UserCheck size={12} /> Team Profile
                        </span>
                      ) : (
                        <span className="tm-profile-status inactive">
                          <User size={12} /> No Profile
                        </span>
                      )}
                    </div>
                    {m.hasTeamProfile && m.teamMember && (
                      <div className="tm-detail-row">
                        <Briefcase size={14} className="tm-detail-icon" />
                        <span className="tm-detail-text">
                          {m.teamMember.skills || 'No skills listed'}
                        </span>
                      </div>
                    )}
                    <div className="tm-detail-row">
                      <Calendar size={14} className="tm-detail-icon" />
                      <span className="tm-detail-text">
                        Joined: {m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="tm-detail-row">
                      <span className={`tm-status-dot ${m.is_active ? 'active' : 'inactive'}`} />
                      <span className="tm-detail-text">
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {m.is_verified && (
                        <span className="tm-verified-badge">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="tm-card-footer">
                    <span className="tm-user-id">ID: {userId}</span>
                    {!m.hasTeamProfile && (
                      <button 
                        className="tm-add-btn"
                        onClick={() => {
                          // This would open the add team member modal
                          toast.info(`Add "${m.displayName}" as team member`);
                        }}
                      >
                        <UserCog size={12} /> Add to Team
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        /* ─── STATS ─── */
        .tm-stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .tm-stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-radius: 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
        }

        .tm-stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .tm-stat-info {
          display: flex;
          flex-direction: column;
        }

        .tm-stat-value {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .tm-stat-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        /* ─── TABS ─── */
        .tm-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 16px;
          background: var(--bg-secondary);
          padding: 4px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          width: fit-content;
        }

        .tm-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .tm-tab:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }

        .tm-tab.active {
          background: var(--bg-card);
          color: var(--accent-primary);
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        /* ─── FILTERS ─── */
        .tm-filters-container {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .tm-search-wrapper {
          position: relative;
          flex: 1;
          min-width: 200px;
        }

        .tm-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .tm-search-input {
          width: 100%;
          padding: 9px 36px 9px 38px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }

        .tm-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .tm-search-clear {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border: none;
          border-radius: 50%;
          background: var(--bg-hover);
          color: var(--text-muted);
          cursor: pointer;
        }

        .tm-search-clear:hover {
          background: var(--border-default);
          color: var(--text-primary);
        }

        .tm-filter-group {
          flex-shrink: 0;
        }

        .tm-filter-select {
          padding: 9px 32px 9px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
        }

        .tm-filter-select:focus {
          border-color: var(--accent-primary);
        }

        /* ─── GRID ─── */
        .tm-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .tm-card {
          padding: 18px;
          border-radius: 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all 0.2s ease;
        }

        .tm-card:hover {
          border-color: var(--border-default);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }

        .tm-card.has-profile {
          border-left: 3px solid #34d399;
        }

        .tm-card.no-profile {
          border-left: 3px solid #f59e0b;
        }

        .tm-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .tm-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid;
          background: var(--bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 800;
          color: var(--text-primary);
          flex-shrink: 0;
        }

        .tm-user-info {
          flex: 1;
          min-width: 0;
        }

        .tm-user-name {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .tm-user-email {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tm-card-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
        }

        .tm-detail-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
          flex-wrap: wrap;
        }

        .tm-detail-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .tm-detail-text {
          color: var(--text-secondary);
        }

        .tm-role-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }

        .tm-profile-status {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 500;
        }

        .tm-profile-status.active {
          color: #34d399;
        }

        .tm-profile-status.inactive {
          color: #f59e0b;
        }

        .tm-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .tm-status-dot.active {
          background: #34d399;
        }

        .tm-status-dot.inactive {
          background: #f87171;
        }

        .tm-verified-badge {
          font-size: 10px;
          color: #34d399;
          background: rgba(52, 211, 153, 0.12);
          padding: 1px 8px;
          border-radius: 10px;
        }

        .tm-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
        }

        .tm-user-id {
          font-size: 11px;
          color: var(--text-muted);
        }

        .tm-add-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          border: none;
          border-radius: 6px;
          background: var(--accent-muted);
          color: var(--accent-primary);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .tm-add-btn:hover {
          background: var(--accent-primary);
          color: #fff;
        }

        .tm-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-muted);
        }

        .tm-empty h3 {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 12px 0 4px;
        }

        @media (max-width: 640px) {
          .tm-grid {
            grid-template-columns: 1fr;
          }

          .tm-stats-row {
            grid-template-columns: 1fr;
          }

          .tm-filters-container {
            flex-direction: column;
          }

          .tm-tabs {
            width: 100%;
            overflow-x: auto;
          }

          .tm-tab {
            flex: 1;
            justify-content: center;
            white-space: nowrap;
          }
        }
      `}</style>
    </div>
  );
}