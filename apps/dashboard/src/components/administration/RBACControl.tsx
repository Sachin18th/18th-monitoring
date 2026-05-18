import React from 'react';
import { Card, Typography, Badge, OperationalTable, Column, Button } from '@kpi-platform/ui';
import { Users, UserPlus, Shield, Lock, Key, MoreHorizontal } from 'lucide-react';

export interface GovernanceUser {
  id: string;
  name: string;
  role: string;
  lastActive: string;
}

export interface RBACControlProps {
  users: GovernanceUser[];
  roles: any[];
  onAddUser: () => void;
  loading?: boolean;
}

export const RBACControl: React.FC<RBACControlProps> = ({
  users,
  roles,
  onAddUser,
  loading
}) => {
  const userColumns: Column<GovernanceUser>[] = [
    { 
      key: 'name', 
      header: 'Identity Name', 
      render: (val) => (
        <div className="flex items-center gap-2">
           <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-text-muted">
              {val.split(' ').map((n: string) => n[0]).join('')}
           </div>
           <Typography variant="body" weight="bold" className="text-sm">{val}</Typography>
        </div>
      )
    },
    { 
      key: 'role', 
      header: 'Assigned Role', 
      render: (val) => <Badge variant={val === 'Admin' ? 'success' : 'info'} size="sm">{val}</Badge>
    },
    { key: 'lastActive', header: 'Session State' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: () => <button className="p-1 hover:bg-muted rounded transition-all"><MoreHorizontal size={14} /></button>
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {roles.map((role, idx) => (
            <Card key={idx} className="p-5 border-subtle relative overflow-hidden group hover:border-primary/50 transition-all">
               <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Shield size={64} />
               </div>
               <div className="flex justify-between items-start mb-4">
                  <div className="p-2 rounded bg-primary/5 text-primary">
                     <Lock size={16} />
                  </div>
                  <Badge variant="default" size="sm">{role.users} Users</Badge>
               </div>
               <Typography variant="body" weight="bold" className="text-sm block">{role.name}</Typography>
               <Typography variant="micro" className="text-text-muted mt-2 mb-4 block line-clamp-2">
                  Permissions: {role.scopes.join(', ')}
               </Typography>
               <button className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                  Manage Scope <Key size={10} />
               </button>
            </Card>
         ))}
      </div>

      <Card className="p-0 border-subtle overflow-hidden">
         <div className="p-4 border-b border-subtle flex justify-between items-center bg-muted/20">
            <div className="flex items-center gap-2">
               <Users size={18} className="text-text-muted" />
               <Typography variant="body" weight="bold" className="text-sm uppercase tracking-wider text-text-muted">
                  Directory & Access Control
               </Typography>
            </div>
            <Button size="sm" onClick={onAddUser} className="flex items-center gap-2" variant="outline">
               <UserPlus size={14} /> Invite User
            </Button>
         </div>
         <OperationalTable columns={userColumns} data={users} isLoading={loading} />
      </Card>
    </div>
  );
};
