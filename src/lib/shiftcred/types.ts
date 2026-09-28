export type ShiftLanguage = "English" | "Spanish" | "Mandarin";

export type Shift = {
  id: string;
  kitchen: string;
  address: string;
  date: string;
  dateLabel: string;
  time: string;
  startTime: string;
  endTime: string;
  hours: number;
  role: string;
  spotsLeft: number;
  languages: readonly ShiftLanguage[];
  transit: string;
  transitMinutes: number;
  accessibility: string;
  description: string;
  supervisor: string;
  organizationPhone: string;
  coordinates: readonly [number, number];
};

export type KitchenProfile = {
  name: string;
  representative: string;
  email: string;
  phone: string;
  address: string;
};

export type ShiftStatus = "reserved" | "checked-in" | "verified";

export type ShiftRecord = {
  shiftId: string;
  status: ShiftStatus;
  reservedAt: string;
  checkedInAt?: string;
  verifiedAt?: string;
};
