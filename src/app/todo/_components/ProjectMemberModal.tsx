'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type {
  ProjectInterface,
  ProjectMemberInterface,
  ProjectRole,
  UserInterface,
} from '@/lib/types';
import styles from './ProjectTree.module.css';

interface ProjectMemberModalProps {
  open: boolean;
  project: ProjectInterface | null;
  projects: ProjectInterface[];
  members: ProjectMemberInterface[];
  searchQuery: string;
  searchResults: UserInterface[];
  searching: boolean;
  inviting: boolean;
  inviteRole: ProjectRole;
  inviteAllChildren: boolean;
  inviteChildIds: string[];
  onClose: () => void;
  onSearch: (query: string) => void;
  onInvite: (user: UserInterface) => void;
  onRemove: (userId: string) => void;
  onRoleChange: (role: ProjectRole) => void;
  onAllChildrenChange: (all: boolean) => void;
  onChildIdsChange: (ids: string[]) => void;
}

export function ProjectMemberModal({
  open,
  project,
  projects,
  members,
  searchQuery,
  searchResults,
  searching,
  inviting,
  inviteRole,
  inviteAllChildren,
  inviteChildIds,
  onClose,
  onSearch,
  onInvite,
  onRemove,
  onRoleChange,
  onAllChildrenChange,
  onChildIdsChange,
}: ProjectMemberModalProps) {
  const children = project
    ? projects.filter((candidate) => candidate.parentProjectId === project.id)
    : [];
  const scopeIncomplete = Boolean(
    project?.isGroup && children.length > 0 && !inviteAllChildren && inviteChildIds.length === 0,
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={project ? `${project.name} 멤버 관리` : '멤버 관리'}
      size="md"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">사용자 검색</label>
          <div className="mb-2 flex rounded border border-gray-200 overflow-hidden w-fit">
            {(['editor', 'viewer'] as ProjectRole[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => onRoleChange(role)}
                className={`px-3 py-1 text-xs ${
                  inviteRole === role
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
          {project?.isGroup && children.length > 0 && (
            <fieldset className="mb-3">
              <legend className="text-sm font-medium text-gray-700 mb-1">
                현재 서브프로젝트 포함 범위
              </legend>
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                <input
                  type="radio"
                  checked={inviteAllChildren}
                  onChange={() => onAllChildrenChange(true)}
                />
                현재 서브프로젝트 모두
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                <input
                  type="radio"
                  checked={!inviteAllChildren}
                  onChange={() => onAllChildrenChange(false)}
                />
                선택한 서브프로젝트만
              </label>
              {!inviteAllChildren && (
                <div className={styles.scopeList}>
                  {children.map((child) => (
                    <label key={child.id} className={styles.scopeItem}>
                      <input
                        type="checkbox"
                        checked={inviteChildIds.includes(child.id)}
                        onChange={(event) => onChildIdsChange(
                          event.target.checked
                            ? [...inviteChildIds, child.id]
                            : inviteChildIds.filter((id) => id !== child.id),
                        )}
                      />
                      {child.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">
                이후 새로 만드는 서브프로젝트에는 자동으로 초대되지 않습니다.
              </p>
              {scopeIncomplete && (
                <p className="mt-1 text-xs text-red-600">서브프로젝트를 하나 이상 선택하세요.</p>
              )}
            </fieldset>
          )}
          <Input
            value={searchQuery}
            onChange={onSearch}
            placeholder="이름 또는 아이디로 검색..."
          />
          {searching && <p className="text-sm text-gray-500 mt-1">검색 중...</p>}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded max-h-40 overflow-y-auto">
              {searchResults.map((user) => {
                const alreadyMember = members.some((member) => member.userId === user.id);
                const canUpdateChildScope = Boolean(project?.isGroup);
                const inviteBlocked = user.canInviteToTodo === false;
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900">{user.displayName}</span>
                      <span className="text-xs text-gray-500 ml-2">@{user.username}</span>
                    </div>
                    {alreadyMember && !canUpdateChildScope ? (
                      <span className="text-xs text-gray-400">이미 멤버</span>
                    ) : inviteBlocked ? (
                      <span className="text-xs text-gray-400">사용 신청 필요</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => onInvite(user)}
                        disabled={inviting || inviteBlocked || scopeIncomplete}
                      >
                        {alreadyMember ? '범위 적용' : '초대'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            현재 멤버 ({members.length})
          </label>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500">멤버가 없습니다.</p>
          ) : (
            <div className="border border-gray-200 rounded max-h-48 overflow-y-auto">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900">{member.displayName}</span>
                    <span className="text-xs text-gray-500 ml-2">@{member.username}</span>
                    <span className="text-xs text-gray-400 ml-2">({member.role})</span>
                  </div>
                  {project?.canManage && member.role !== 'owner' && (
                    <button
                      onClick={() => onRemove(member.userId)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      제거
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
