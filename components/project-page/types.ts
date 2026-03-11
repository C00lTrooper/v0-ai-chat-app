export type Section = "overview" | "tasks" | "timeline" | "budget" | "chat" | "settings";

export type ProjectData = {
  _id: string;
  slug: string;
  projectName: string;
  summaryName: string;
  objective: string;
  targetDate: string;
  data: string;
  isOwner: boolean;
};

