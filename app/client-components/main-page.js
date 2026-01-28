"use client";
import Content from "./content";
import Sidebar from "./left-sidebar";
import { useState, useEffect } from "react";
export default function MainPage({projects}) {
  const [taskData, setTask] = useState([]);
  const [projectSelected, setProject] = useState(null);

  return ( 
    <div>
      <Sidebar projects={projects} setTask={setTask} setProject={setProject}/>
      <Content project={projectSelected} tasks={taskData} setTasks={setTask}/>
    </div>
  );
}
