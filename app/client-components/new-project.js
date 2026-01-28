"use client";
import Add from "../../public/add-icon.svg";
const AllIcons = [
  "Beer",
  "Cake",
  "Flash",
  "IceCream",
  "Idea",
  "King",
  "Mountain",
  "Nut",
  "Pizza",
  "Plant",
  "Radio",
  "Skull",
];

export default function NewProject({ addProjectList }) {
  const baseURL =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:20022";
  const newProject = async () => {
    let name = prompt("프로젝트 명을 입력해주세요");

    try {
      const random = Math.floor(Math.random() * AllIcons.length);
      console.log(AllIcons[random]);
      const response = await fetch(`${baseURL}/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, icon: AllIcons[random] }),
      });

      const data = await response.json();
      console.log("Server Response:", data);
      if (data?.id) {
        addProjectList(data);
      }
    } catch (error) {
      console.error("Error submitting data:", error);
      alert("네트워크 오류 발생!");
    }
  };
  return (
    <div className="left-sidebar-footer">
      <div className="new-project" onClick={newProject}>
        <div className="new-project-icon">
          <Add width="20px" height="20px" />
        </div>
        <div className="new-project-label">New Project</div>
      </div>
    </div>
  );
}
