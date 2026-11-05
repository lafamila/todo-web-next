import type { ProjectInterface, SyncIssueInterface } from '@/lib/types';
import { useApp } from "@/contexts/AppContext";
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Modal } from '@/components/ui/Modal';
import { useState, useEffect, useRef } from "react";
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import Add from '@/assets/add-icon.svg';
import { AllIcons } from '@/lib/constants';
import * as api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { ProjectTree } from './ProjectTree';
import { openProjectMembers } from './projectEvents';
import styles from './ProjectTree.module.css';
import { normalizeProjectRename } from '@/lib/projectHierarchy';

export default function ProjectSection() {
  const {
    state: { projects, selectedProject: currentProject },
    selectProject,
    createProject,
    renameProject,
    deleteProject,
    verifyProjectPassword,
    refreshProjects,
  } = useApp();
  const { user, logout, features } = useAuth();
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [projectMenu, setProjectMenu] = useState<{
    project: ProjectInterface;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [createParent, setCreateParent] = useState<ProjectInterface | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectInterface | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [projectActionError, setProjectActionError] = useState('');
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectInterface | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenamingProject, setIsRenamingProject] = useState(false);

  // Create Project Modal State
  const [projectName, setProjectName] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [password, setPassword] = useState('');

  // Password Modal State
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  // 모바일 드로어 — 터치에는 hover 확장이 없으므로 사이드바를 버튼으로 여닫는다.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!projectMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setProjectMenu(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectMenu(null);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [projectMenu]);
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
    setProjectMenu(null);
    if (project.isGroup) {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(project.id)) next.delete(project.id);
        else next.add(project.id);
        return next;
      });
      return;
    }
    if (project.navigationOnly) return;
    setDrawerOpen(false);
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
      const created = await createProject({
        name: projectName,
        icon: AllIcons[Math.floor(Math.random() * AllIcons.length)],
        isSecret,
        password: isSecret ? password : undefined,
        parentProjectId: createParent?.id,
      });

      if (created.parentProjectId) {
        setExpandedIds((current) => new Set(current).add(created.parentProjectId as string));
      }

      // Reset form
      setProjectName('');
      setIsSecret(false);
      setPassword('');
      setShowCreateModal(false);
      setCreateParent(null);
    } catch (error) {
      setProjectActionError(
        error instanceof Error ? error.message : '프로젝트 생성에 실패했습니다.',
      );
    }
  };

  const openCreateProject = (parent: ProjectInterface | null = null) => {
    setCreateParent(parent);
    setProjectName('');
    setIsSecret(false);
    setPassword('');
    setProjectActionError('');
    setShowCreateModal(true);
    setProjectMenu(null);
  };

  const openDeleteProject = (project: ProjectInterface) => {
    setDeleteTarget(project);
    setDeleteConfirmation('');
    setProjectActionError('');
    setProjectMenu(null);
  };

  const openRenameProject = (project: ProjectInterface) => {
    setRenameTarget(project);
    setRenameName(project.name);
    setRenameError('');
    setProjectMenu(null);
  };

  const handleRenameProject = async () => {
    if (!renameTarget) return;
    const normalized = normalizeProjectRename(renameName, renameTarget.name);
    if (!normalized) return;
    setIsRenamingProject(true);
    setRenameError('');
    try {
      await renameProject(renameTarget.id, normalized);
      setRenameTarget(null);
      setRenameName('');
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : '프로젝트 이름을 변경하지 못했습니다.',
      );
    } finally {
      setIsRenamingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.name) return;
    setIsDeletingProject(true);
    setProjectActionError('');
    try {
      await deleteProject(deleteTarget.id, deleteConfirmation);
      setDeleteTarget(null);
      setDeleteConfirmation('');
    } catch (error) {
      setProjectActionError(
        error instanceof Error ? error.message : '프로젝트를 삭제하지 못했습니다.',
      );
    } finally {
      setIsDeletingProject(false);
    }
  };

  const openProjectMenu = (project: ProjectInterface, x: number, y: number) => {
    if (!project.canManage && !project.canDelete) return;
    setProjectMenu({
      project,
      x: Math.max(8, Math.min(x, window.innerWidth - 205)),
      y: Math.max(8, Math.min(y, window.innerHeight - 170)),
    });
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
    {/* 모바일 전용 — CSS 가 데스크톱에서 숨긴다 */}
    <button
      type="button"
      className="sidebar-drawer-toggle"
      aria-label={drawerOpen ? '프로젝트 목록 닫기' : '프로젝트 목록 열기'}
      aria-expanded={drawerOpen}
      onClick={() => setDrawerOpen((open) => !open)}
    >
      {drawerOpen ? '✕' : '☰'}
    </button>
    {drawerOpen && (
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
    )}
    <div className={`left-sidebar${drawerOpen ? ' drawer-open' : ''}${projectMenu ? ' menu-open' : ''}`}>
      <div className="sidebar-logo">TD</div>
      <div className={`project-container ${styles.container}`}>
        <ProjectTree
          projects={projects}
          selectedProjectId={currentProject?.id}
          expandedIds={expandedIds}
          issueFor={(projectId) => Boolean(findIssue('projects', projectId))}
          onActivate={(project) => void handleProjectClick(project)}
          onOpenMenu={openProjectMenu}
        />
      </div>
      <div className="left-sidebar-footer">
        {isAdmin && (
          <button
            onClick={() => openCreateProject()}
            className="new-project new-project--create"
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
      {projectMenu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${projectMenu.project.name} 프로젝트 기능`}
          className={styles.contextMenu}
          style={{ left: projectMenu.x, top: projectMenu.y }}
        >
          {!projectMenu.project.parentProjectId && projectMenu.project.canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => openCreateProject(projectMenu.project)}
            >
              서브프로젝트 생성
            </button>
          )}
          {projectMenu.project.canManage && features.memberInvite && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openProjectMembers(projectMenu.project.id);
                setProjectMenu(null);
              }}
            >
              멤버 관리
            </button>
          )}
          {projectMenu.project.canManage && (
            <button
              type="button"
              role="menuitem"
              onClick={() => openRenameProject(projectMenu.project)}
            >
              이름 수정
            </button>
          )}
          {projectMenu.project.canDelete && (
            <button
              type="button"
              role="menuitem"
              className={styles.danger}
              onClick={() => openDeleteProject(projectMenu.project)}
            >
              삭제
            </button>
          )}
        </div>
      )}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={() => !isRenamingProject && setRenameTarget(null)}
        title="프로젝트 이름 수정"
        size="sm"
      >
        {renameTarget && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameProject();
            }}
          >
            <label className="block text-sm font-medium text-gray-700">
              새 프로젝트 이름
            </label>
            <Input
              value={renameName}
              onChange={setRenameName}
              placeholder="프로젝트 이름을 입력하세요"
              autoFocus
            />
            <p className="text-xs text-gray-500">공백을 제외하고 1~255자로 입력하세요.</p>
            {renameError && <p className="text-sm text-red-600">{renameError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                disabled={
                  isRenamingProject ||
                  !normalizeProjectRename(renameName, renameTarget.name)
                }
              >
                {isRenamingProject ? '변경 중...' : '변경'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setRenameTarget(null)}
                disabled={isRenamingProject}
              >
                취소
              </Button>
            </div>
          </form>
        )}
      </Modal>
      {/* Create Project Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateParent(null);
          setProjectActionError('');
        }}
        title={createParent ? `${createParent.name} 서브프로젝트 만들기` : '새 프로젝트 만들기'}
      >
        <div className="space-y-4">
          {createParent && (
            <p className="text-sm text-gray-600">
              {createParent.isGroup
                ? '새 서브프로젝트에는 소유자만 포함됩니다. 필요한 멤버는 생성 후 직접 초대하세요.'
                : '첫 서브프로젝트를 만들면 기존 메모와 멤버 권한이 이곳으로 함께 이동합니다.'}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {createParent ? '서브프로젝트 이름' : '프로젝트 이름'}
            </label>
            <Input
              value={projectName}
              onChange={setProjectName}
              placeholder={createParent ? '서브프로젝트 이름을 입력하세요' : '프로젝트 이름을 입력하세요'}
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

          {projectActionError && (
            <p className="text-sm text-red-600">{projectActionError}</p>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={handleCreateProject}>생성</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setCreateParent(null);
                setProjectActionError('');
              }}
            >
              취소
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !isDeletingProject && setDeleteTarget(null)}
        title="프로젝트 삭제"
        size="sm"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              <strong>{deleteTarget.name}</strong>은 목록과 모든 멤버의 화면에서 사라집니다.
              메모와 버전은 복구를 위해 DB에 보존됩니다.
            </p>
            {deleteTarget.isGroup && (
              <p className="text-sm text-gray-600">포함된 서브프로젝트도 함께 숨겨집니다.</p>
            )}
            <label className="block text-sm text-gray-700">
              확인하려면 프로젝트 이름을 그대로 입력하세요.
            </label>
            <Input
              value={deleteConfirmation}
              onChange={setDeleteConfirmation}
              placeholder={deleteTarget.name}
              autoFocus
            />
            {projectActionError && (
              <p className="text-sm text-red-600">{projectActionError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleDeleteProject}
                disabled={
                  isDeletingProject || deleteConfirmation !== deleteTarget.name
                }
              >
                {isDeletingProject ? '삭제 중...' : '삭제'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                취소
              </Button>
            </div>
          </div>
        )}
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
