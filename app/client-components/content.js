"use client";
import { useState, useEffect, useRef } from "react";

export default function Content({ project, tasks, setTasks }) {
  const baseURL =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:20022";
  const inputRef = useRef(null);
  const detailRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [applyAvailable, setApply] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState(
    tasks.reduce((prev, task) => ({ ...prev, [task.id]: task.task_status }), {})
  );

  // const timeoutRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setCheckedTasks(
      tasks.reduce(
        (prev, task) => ({ ...prev, [task.id]: task.task_status }),
        {}
      )
    );
    setApply(false);
  }, [project]);

  useEffect(() => {
    async function fetchDetail() {
      if (selectedId !== null) {
        try {
          const response = await fetch(
            `${baseURL}/project/${project.id}/task/${selectedId}`
          );
          if (!response.ok) throw new Error("Failed to save");
          const detail = await response.json();
          if (detail) {
            setDetail(detail.content);
          } else {
            setDetail("");
          }
          detailRef.current.style.display = "block";
        } catch (error) {
          console.error(error);
        }
      } else if (detailRef.current) {
        detailRef.current.style.display = "none";
        setDetail("");
      }
    }
    fetchDetail();
  }, [selectedId]);
  const applyHandler = async () => {
    setIsSaving(true);
    let tasksData = [];
    for (const [key, value] of Object.entries(checkedTasks)) {
      tasksData.push({ id: key, task_status: value });
    }
    try {
      const response = await fetch(`${baseURL}/project/${project.id}/task`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: tasksData }),
      });
      if (!response.ok) throw new Error("Failed to save");
      setApply(false);

      // if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };
  const saveData = async () => {
    if (selectedId != null) {
      setIsSaving(true);
      try {
        const response = await fetch(
          `${baseURL}/project/${project.id}/task/${selectedId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: detail }),
          }
        );
        if (!response.ok) throw new Error("Failed to save");
        // if (timeoutRef.current) clearTimeout(timeoutRef.current);
      } catch (error) {
        console.error(error);
      } finally {
        setIsSaving(false);
      }
    }
  };
  const checkHandler = (e, key) => {
    let data = { ...checkedTasks };
    data[key] = data[key] == 1 ? 0 : 1;
    setCheckedTasks(data);
    setApply(true);
    e.stopPropagation();
  };
  const keyDownHandler = (e) => {
    if (
      e.keyCode == 83 &&
      (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)
    ) {
      e.preventDefault();
      saveData();
    }
  };
  const addDetail = (e) => {
    setDetail(e.target.value);
    // if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // timeoutRef.current = setTimeout(() => {
    //     saveData();
    // }, 3000);
  };
  const addTaskData = (newItem) => {
    setTasks([...tasks, newItem]);
  };
  const newTask = async (e) => {
    if (e.key == "Enter" && !isSaving) {
      let title = inputRef.current.value;
      if (title != "") {
        try {
          setIsSaving(true);
          const response = await fetch(
            `${baseURL}/project/${project.id}/task`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: title }),
            }
          );

          const data = await response.json();
          console.log("Server Response:", data);
          if (data?.id) {
            addTaskData(data);
            inputRef.current.value = "";
          }
          setIsSaving(false);

          //   if (response.ok) {
          //     alert("서버로 데이터 전송 성공!");
          //     setInputValue(""); // 입력 필드 초기화
          //   } else {
          //     alert("서버 오류 발생!");
          //   }
        } catch (error) {
          console.error("Error submitting data:", error);
          alert("네트워크 오류 발생!");
        }
      }
    }
  };
  if (!project) return <div></div>;
  return (
    <div className="content">
      <div className="main-container">
        <div className="title-container">
          <span>{project.name}</span>
          {isSaving && <p className="save-status">saving..</p>}
        </div>
        <div className="main">
          <div style={{ paddingTop: "40px" }}>
            <span style={{ fontWeight: "bold", fontSize: "20px" }}>Tasks</span>{" "}
            <span className="task-count">({tasks.length})</span>
            <button
              style={{ float: "right" }}
              disabled={!applyAvailable}
              onClick={(e) => {
                applyHandler(e);
              }}>
              apply
            </button>
          </div>
          <div className="new-task-container">
            <input
              type="text"
              className="new-task"
              placeholder="Type a new task!"
              ref={inputRef}
              onKeyUp={(e) => {
                newTask(e);
              }}
            />
            <span className="guide-text">Enter!</span>
          </div>
          <div className="task-container">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`task ${
                  selectedId == task.id ? "task-selected" : ""
                }`}
                onClick={(e) =>
                  setSelectedId(selectedId == task.id ? null : task.id)
                }>
                <span>
                  <input
                    type="checkbox"
                    checked={checkedTasks?.[task.id] == 1}
                    onChange={(e) => {
                      checkHandler(e, task.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  />
                </span>
                <span className="task-content">{task.title}</span>
                <span>{task.reg_dtm}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="detail" ref={detailRef}>
          <textarea
            value={detail}
            onChange={(e) => {
              addDetail(e);
            }}
            onKeyDown={(e) => {
              keyDownHandler(e);
            }}
          />
        </div>
      </div>
    </div>
  );
}
