'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  Trash2,
} from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Customs Specialist' | 'Auditor';
  status: 'Active' | 'Pending';
  joinedAt: string;
}

type InviteRole = Exclude<TeamMember['role'], 'Owner'>;

const INITIAL_MEMBERS: TeamMember[] = [
  {
    id: 'mem-1',
    name: 'Admin User',
    email: 'privatepple@gmail.com',
    role: 'Owner',
    status: 'Active',
    joinedAt: '2026-08-01',
  },
  {
    id: 'mem-2',
    name: 'Tariq Al-Mansoor',
    email: 'tariq.customs@saudiclearance.sa',
    role: 'Customs Specialist',
    status: 'Active',
    joinedAt: '2026-08-15',
  },
  {
    id: 'mem-3',
    name: 'Layla Al-Ghamdi',
    email: 'layla.audit@saudiclearance.sa',
    role: 'Auditor',
    status: 'Active',
    joinedAt: '2026-08-20',
  },
];

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(INITIAL_MEMBERS);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('Customs Specialist');
  const [isInviting, setIsInviting] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setIsInviting(true);
    setTimeout(() => {
      const newMember: TeamMember = {
        id: `mem-${Date.now()}`,
        name: inviteEmail.split('@')[0],
        email: inviteEmail,
        role: inviteRole,
        status: 'Pending',
        joinedAt: new Date().toISOString().split('T')[0],
      };
      setMembers([...members, newMember]);
      setInviteEmail('');
      setIsInviting(false);
      toast.success(`Invitation sent to ${inviteEmail}`);
    }, 500);
  };

  const handleRemove = (id: string, name: string) => {
    setMembers(members.filter((m) => m.id !== id));
    toast.success(`Removed ${name} from organization`);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <Users className="w-6 h-6 text-brand-teal-light" />
          Organization & Team Management
        </h1>
        <p className="text-muted text-sm mt-1">
          Invite customs brokers, compliance officers, and staff to collaborate on invoice clearances.
        </p>
      </div>

      {/* Invite Box */}
      <div className="glass-card p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-brand-teal-light" />
          Invite New Member
        </h2>

        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="form-input"
              required
            />
          </div>

          <div className="w-full sm:w-56">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InviteRole)}
              className="form-input bg-surface-overlay border-surface-border text-white"
            >
              <option value="Customs Specialist">Customs Specialist</option>
              <option value="Admin">Administrator</option>
              <option value="Auditor">Compliance Auditor</option>
            </select>
          </div>

          <button type="submit" disabled={isInviting} className="btn-primary shrink-0">
            {isInviting ? 'Sending...' : 'Send Invitation'}
          </button>
        </form>
      </div>

      {/* Members List */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Active Organization Members ({members.length})
          </h3>
          <span className="badge badge-info">Enterprise Plan (Unlimited Seats)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-surface-raised/40 transition-colors">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-teal/20 text-brand-teal-light flex items-center justify-center font-bold text-sm">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{member.name}</p>
                        <p className="text-xs text-muted">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${
                      member.role === 'Owner' || member.role === 'Admin'
                        ? 'bg-brand-gold/20 text-brand-gold'
                        : 'bg-brand-teal/15 text-brand-teal-light'
                    } text-xs font-semibold`}>
                      {member.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      member.status === 'Active' ? 'badge-success' : 'badge-warning'
                    }`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="text-xs text-muted">{member.joinedAt}</td>
                  <td className="text-right">
                    {member.role !== 'Owner' && (
                      <button
                        type="button"
                        onClick={() => handleRemove(member.id, member.name)}
                        className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
