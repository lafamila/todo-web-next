'use client';

import { useEffect, useMemo, useRef } from 'react';
import Icon from '@/components/ui/Icon';
import type { ProjectInterface } from '@/lib/types';
import { buildProjectTree, movedBeyondLongPressTolerance } from '@/lib/projectHierarchy';
import styles from './ProjectTree.module.css';

interface ProjectTreeProps {
  projects: ProjectInterface[];
  selectedProjectId?: string;
  expandedIds: Set<string>;
  issueFor: (projectId: string) => boolean;
  onActivate: (project: ProjectInterface) => void;
  onToggle: (projectId: string) => void;
  onOpenMenu: (project: ProjectInterface, x: number, y: number) => void;
}

const LONG_PRESS_MS = 550;

export function ProjectTree({
  projects,
  selectedProjectId,
  expandedIds,
  issueFor,
  onActivate,
  onToggle,
  onOpenMenu,
}: ProjectTreeProps) {
  const tree = useMemo(() => buildProjectTree(projects), [projects]);
  const timerRef = useRef<number | null>(null);
  const pressRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  const cancelPress = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pressRef.current = null;
  };

  useEffect(() => {
    const cancelOnScroll = () => cancelPress();
    document.addEventListener('scroll', cancelOnScroll, true);
    return () => {
      document.removeEventListener('scroll', cancelOnScroll, true);
      cancelPress();
    };
  }, []);

  const pressHandlers = (project: ProjectInterface) => ({
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if ((event.target as Element).closest('button')) return;
      cancelPress();
      suppressClickRef.current = null;
      pressRef.current = { id: project.id, x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        const press = pressRef.current;
        if (!press || press.id !== project.id) return;
        suppressClickRef.current = project.id;
        onOpenMenu(project, press.x, press.y);
        cancelPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      if (
        press?.id === project.id &&
        movedBeyondLongPressTolerance(press.x, press.y, event.clientX, event.clientY)
      ) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      cancelPress();
      onOpenMenu(project, event.clientX, event.clientY);
    },
    onClick: () => {
      if (suppressClickRef.current === project.id) {
        suppressClickRef.current = null;
        return;
      }
      onActivate(project);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate(project);
      }
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onOpenMenu(project, rect.right, rect.top + rect.height / 2);
      }
    },
  });

  const row = (project: ProjectInterface, child = false) => (
    <div
      key={project.id}
      className={`${styles.row} project${child ? ` ${styles.childRow}` : ''}${
        selectedProjectId === project.id ? ` ${styles.selected}` : ''
      }`}
      role="treeitem"
      tabIndex={0}
      aria-level={child ? 2 : 1}
      aria-expanded={project.isGroup ? expandedIds.has(project.id) : undefined}
      aria-selected={selectedProjectId === project.id}
      {...pressHandlers(project)}
    >
      <div className="project-icon">
        {project.isSecret && <span className="project-secret">🔒</span>}
        <Icon icon={project.icon} />
      </div>
      <div className="project-name">
        {project.isGroup && (
          <button
            type="button"
            className={styles.chevron}
            aria-label={expandedIds.has(project.id) ? '서브프로젝트 접기' : '서브프로젝트 펼치기'}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(project.id);
            }}
          >
            {expandedIds.has(project.id) ? '▾' : '▸'}
          </button>
        )}
        <span className={issueFor(project.id) ? 'sync-issue-dim' : ''}>{project.name}</span>
        {(project.canManage || project.canDelete) && (
          <button
            type="button"
            className={styles.menuTrigger}
            aria-label={`${project.name} 프로젝트 메뉴`}
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenMenu(project, rect.right, rect.bottom);
            }}
          >
            ⋯
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.tree} role="tree" aria-label="프로젝트 목록">
      {tree.map(({ project, children }) => (
        <div className={styles.node} key={project.id}>
          {row(project)}
          {project.isGroup && expandedIds.has(project.id) && (
            <div className={styles.childList} role="group">
              {children.map((child) => row(child, true))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
