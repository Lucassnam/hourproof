export type ActivityType = "work" | "volunteer" | "school" | "training";

export type ActivityEntry = {
  id: string;
  date: string;
  type: ActivityType;
  title: string;
  hours: number;
  grossEarnings: number;
  proofFileName?: string;
  proofFileId?: string;
  source: "manual" | "shiftcred";
  verified: boolean;
};

export type WeekSummary = {
  start: string;
  end: string;
  label: string;
  hours: number;
  earnings: number;
  status: "on-track" | "gap" | "upcoming";
};

