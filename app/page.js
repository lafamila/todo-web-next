// import Image from "next/image";
// import styles from "./page.module.css";
import MainPage from "./client-components/main-page";
export default async function Home() {
  const baseURL =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:20022";

  const data = await fetch(`${baseURL}/project`, {
    cache: "no-store",
  });
  console.log(data);
  const projects = await data.json();
  return <MainPage projects={projects} />;
}
