import type { ProjectInterface, SyncIssueInterface } from '@/lib/types';
import { useApp } from "@/contexts/AppContext";
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Modal } from '@/components/ui/Modal';
import { useState, useEffect } from "react";
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import Add from '@/assets/add-icon.svg';
import Icon from '@/components/ui/Icon';
import { AllIcons } from '@/lib/constants';
import * as api from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function ProjectSection() {
  const {
    state: { projects, selectedProject: currentProject },
    selectProject,
    createProject,
    verifyProjectPassword,
    refreshProjects,
  } = useApp();
  const { user, logout } = useAuth();
  const {
    findIssue,
    canMerge,
    refresh: refreshSync,
  } = useSync();
  const isAdmin = user?.isAdmin ?? false;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingProject, setPendingProject] = useState<ProjectInterface | null>(null);
  const [duplicateIssue, setDuplicateIssue] = useState<SyncIssueInterface | null>(null);
  const [duplicateWinnerId, setDuplicateWinnerId] = useState('');
  const [duplicateCounts, setDuplicateCounts] = useState<Record<string, number>>({});
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');

  // Create Project Modal State
  const [projectName, setProjectName] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [password, setPassword] = useState('');

  // Password Modal State
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  // Keyboard shortcut: Cmd+Shift+X when no project is selected → open create project modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'x') {
        if (!currentProject && isAdmin) {
          e.preventDefault();
          e.stopPropagation();
          setShowCreateModal(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [currentProject, isAdmin]);

  // 뷰포트 리사이즈 중에는 반응형 폭 변경을 즉시 반영해 로고와 아이콘의 전환 지연을 없앤다.
  useEffect(() => {
    const root = document.documentElement;
    let resizeEndTimer: number | undefined;

    const handleResize = () => {
      root.classList.add('viewport-resizing');
      window.clearTimeout(resizeEndTimer);
      resizeEndTimer = window.setTimeout(() => {
        root.classList.remove('viewport-resizing');
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.clearTimeout(resizeEndTimer);
      root.classList.remove('viewport-resizing');
    };
  }, []);

  const handleProjectClick = async (project: ProjectInterface) => {
    const issue = findIssue('projects', project.id);
    if (issue?.kind === 'duplicate_project') {
      setDuplicateIssue(issue);
      setDuplicateWinnerId(project.id);
      setMergeError('');
      const ids = [issue.refId, issue.peerRefId].filter(
        (value): value is string => Boolean(value),
      );
      const counts = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, (await api.getProjectMemos(id)).length] as const;
          } catch {
            return [id, 0] as const;
          }
        }),
      );
      setDuplicateCounts(Object.fromEntries(counts));
      return;
    }
    if (project.isSecret) {
      setPendingProject(project);
      setShowPasswordModal(true);
      setPasswordInput('');
      setPasswordError('');
    } else {
      await selectProject(project);
    }
  };

  const duplicateProjects = duplicateIssue
    ? [duplicateIssue.refId, duplicateIssue.peerRefId]
        .map((id) => projects.find((project) => project.id === id))
        .filter((project): project is ProjectInterface => Boolean(project))
    : [];

  const handleMergeProject = async () => {
    if (!duplicateIssue || duplicateProjects.length !== 2) return;
    if (!canMerge) {
      setMergeError('오프라인 상태에서는 병합할 수 없습니다. 온라인에서 다시 시도하세요.');
      return;
    }
    const loser = duplicateProjects.find((project) => project.id !== duplicateWinnerId);
    const winner = duplicateProjects.find((project) => project.id === duplicateWinnerId);
    if (!loser || !winner) return;

    setIsMerging(true);
    setMergeError('');
    try {
      const result = await api.mergeProject(loser.id, winner.id);
      const appliedWinner = result.pullRequested
        ? await api.waitForProjectMergeApplied(loser.id, winner.id)
        : winner;
      await Promise.all([refreshProjects(), refreshSync()]);
      await selectProject(appliedWinner);
      setDuplicateIssue(null);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : '프로젝트 병합에 실패했습니다.');
    } finally {
      setIsMerging(false);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;

    if (isSecret && !password.trim()) {
      return;
    }

    try {
      await createProject({
        name: projectName,
        icon: AllIcons[Math.floor(Math.random() * AllIcons.length)],
        isSecret,
        password: isSecret ? password : undefined,
      });

      // Reset form
      setProjectName('');
      setIsSecret(false);
      setPassword('');
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleVerifyPassword = async () => {
    if (!pendingProject) return;

    const verified = await verifyProjectPassword(
      pendingProject.id,
      passwordInput
    );

    if (verified) {
      setShowPasswordModal(false);
      setPasswordInput('');
      setPasswordError('');
      await selectProject(pendingProject);
      setPendingProject(null);
    } else {
      setPasswordError('비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    <>
    <div className="left-sidebar">
      <div className="sidebar-logo">TD</div>
      <div className="project-container">
        {projects.map((project) => (
          <div
            key={project.id}
            className="project"
            onClick={() => {
              handleProjectClick(project);
            }}>
            <div className="project-icon">
              {project.isSecret && (
                <span className='project-secret'>🔒</span>
              )}
              <Icon icon={project.icon} />
            </div>
            <div className="project-name">
              <span className={findIssue('projects', project.id) ? 'sync-issue-dim' : ''}>
                {project.name}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="left-sidebar-footer">
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="new-project"
          >
            <div className="new-project-icon">
              <Add width="20px" height="20px" />
            </div>
            <div className="new-project-label">New Project</div>
          </button>
        )}
        <button
          onClick={logout}
          className="new-project"
          style={{ opacity: 0.6 }}
        >
          <div className="new-project-label" style={{ fontSize: '12px' }}>
            {user?.displayName ?? user?.username} · 로그아웃
          </div>
        </button>
      </div>
    </div>
      {/* Create Project Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="새 프로젝트 만들기"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              프로젝트 이름
            </label>
            <Input
              value={projectName}
              onChange={setProjectName}
              placeholder="프로젝트 이름을 입력하세요"
              className='w-full outline-none'
              autoFocus
            />
          </div>

          <div>
            <Checkbox
              checked={isSecret}
              onChange={setIsSecret}
              label="비밀 프로젝트"
            />
          </div>

          {isSecret && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호
              </label>
              <Input
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="비밀번호를 입력하세요"
                className='w-full outline-none'
              />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={handleCreateProject}>생성</Button>
            <Button
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              취소
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(duplicateIssue)}
        onClose={() => !isMerging && setDuplicateIssue(null)}
        title="중복 프로젝트 정리"
        size="lg"
      >
        <p className="text-sm text-gray-600 mb-4">
          생존자를 선택하면 다른 프로젝트의 메모와 멤버가 선택한 프로젝트로 이동합니다.
        </p>
        <div className="duplicate-project-grid">
          {duplicateProjects.map((project) => (
            <label
              key={project.id}
              className={`duplicate-project-card ${
                duplicateWinnerId === project.id ? 'duplicate-project-selected' : ''
              }`}
            >
              <input
                type="radio"
                name={`project-survivor-${duplicateIssue?.id}`}
                checked={duplicateWinnerId === project.id}
                onChange={() => setDuplicateWinnerId(project.id)}
              />
              <strong>{project.name}</strong>
              <span>메모 {duplicateCounts[project.id] ?? 0}개</span>
              <span>생성 {formatDate(project.createdAt)}</span>
            </label>
          ))}
        </div>
        {!canMerge && (
          <p className="mt-3 text-sm text-amber-700">
            오프라인에서는 병합할 수 없습니다. 온라인에서 정리하세요.
          </p>
        )}
        {mergeError && <p className="mt-3 text-sm text-red-600">{mergeError}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <Button
            onClick={handleMergeProject}
            disabled={
              isMerging ||
              duplicateProjects.length !== 2 ||
              !canMerge
            }
          >
            {isMerging ? '병합 중...' : '선택한 프로젝트로 병합'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setDuplicateIssue(null)}
            disabled={isMerging}
          >
            취소
          </Button>
        </div>
      </Modal>

      {/* Password Verification Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="비밀번호 입력"
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault(); // 새로고침 방지
            handleVerifyPassword();
          }}
        >
          <p className="text-sm text-gray-600">
            이 프로젝트는 비밀번호로 보호되어 있습니다.
          </p>

          <div>
            <Input
              type="password"
              value={passwordInput}
              onChange={setPasswordInput}
              placeholder="비밀번호를 입력하세요"
              className='w-full outline-none'
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-red-600 mt-1">{passwordError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={handleVerifyPassword}>확인</Button>
            <Button
              variant="secondary"
              onClick={() => setShowPasswordModal(false)}
            >
              취소
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
