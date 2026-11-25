import { useOutletContext } from "react-router";
import type { ProjectDetail } from "@/lib/types";

// ProjectLayout loads the project once and gives it to the board, list and settings pages.
export const useProjectContext = () => useOutletContext<ProjectDetail>();
