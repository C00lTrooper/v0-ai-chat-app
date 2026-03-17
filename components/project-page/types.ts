export type Section =
  | "overview"
  | "features"
  | "tasks"
  | "timeline"
  | "budget"
  | "chat"
  | "settings";

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

