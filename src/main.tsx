import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OnlineApp from "./product/OnlineApp.tsx";
import { StudentEntry, hasStudentRoom } from "./product/LiveRoom.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {hasStudentRoom() ? <StudentEntry /> : <OnlineApp />}
  </StrictMode>,
);
