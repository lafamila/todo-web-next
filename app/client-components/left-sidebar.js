// import styles from "./page.module.css";
"use client";
// import Beer from "../../public/icons/beer-svgrepo-com.svg";
// import Coffee from "../../public/icons/coffee-svgrepo-com.svg";
import Icon from "./svg-icon";
import NewProject from "./new-project";

import { useState, useEffect } from "react";

export default function Sidebar({ projects = [], setTask, setProject }) {
  const baseURL =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:20022";
  const [projectList, setProjectList] = useState(projects);
  const addProjectList = (newItem) => {
    console.log("addProjectList");
    setProjectList([...projectList, newItem]);
  };

  useEffect(() => {
    console.log("🔥 items 변경됨:", projectList); // 상태 변경 감지
  }, [projectList]);
  const loadProject = async (project) => {
    try {
      const response = await fetch(`${baseURL}/project/${project.id}/task`); // 예시 API
      if (!response.ok) {
        throw new Error("데이터를 불러오는 데 실패했습니다.");
      }
      const result = await response.json();
      console.log(result);
      setTask(result); // 데이터를 상태에 저장
      setProject(project);
    } catch (error) {
      console.error("에러 발생:", error);
    }
  };
  return (
    <div className="left-sidebar">
      <div>TD</div>
      <div className="project-container">
        {projectList.map((project) => (
          <div
            key={project.id}
            className="project"
            onClick={() => {
              loadProject(project);
            }}>
            <div className="project-icon">
              <Icon icon={project.icon} />
            </div>
            <div className="project-name">{project.name}</div>
          </div>
        ))}
      </div>
      <NewProject addProjectList={addProjectList} />
    </div>
  );
}
