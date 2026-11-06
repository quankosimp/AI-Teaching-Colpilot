import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OnlineApp from "./product/OnlineApp.tsx";
import { StudentEntry, hasStudentRoom } from "./product/LiveRoom.tsx";
import { HandoffEntry, StudentLinkEntry, studentPage } from "./product/StudentLink.tsx";
import "./index.css";
import "./product/lively.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {studentPage() === "link" ? (
      <StudentLinkEntry />
    ) : studentPage() === "submit" ? (
      <HandoffEntry />
    ) : hasStudentRoom() ? (
      <StudentEntry />
    ) : (
      <OnlineApp />
    )}
  </StrictMode>,
);
