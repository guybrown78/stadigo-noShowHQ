export const DEFAULT_TIMEZONE = "Europe/London";

export const EVENT_STATUSES = [
  "PLANNED",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
] as const;

export type EventStatusValue = (typeof EVENT_STATUSES)[number];

export const DEFAULT_WARNING_FILL_RATE = 90;
export const DEFAULT_CRITICAL_FILL_RATE = 85;

export type EventTypeSeed = {
  name: string;
  code: string;
  subtypes: { name: string; code: string }[];
};

export const EVENT_TYPE_CATALOG: EventTypeSeed[] = [
  {
    name: "Sporting",
    code: "sporting",
    subtypes: [
      { name: "Football Match", code: "football-match" },
      { name: "Rugby Match", code: "rugby-match" },
      { name: "Cricket", code: "cricket" },
      { name: "Boxing/MMA", code: "boxing-mma" },
      { name: "Other Sporting Event", code: "other-sporting" },
    ],
  },
  {
    name: "Music and Entertainment",
    code: "music-and-entertainment",
    subtypes: [
      { name: "Concert", code: "concert" },
      { name: "Arena Show", code: "arena-show" },
      { name: "Theatre/Performance", code: "theatre-performance" },
      { name: "Other Entertainment Event", code: "other-entertainment" },
    ],
  },
  {
    name: "Festival",
    code: "festival",
    subtypes: [
      { name: "Music Festival", code: "music-festival" },
      { name: "Food and Drink Festival", code: "food-and-drink-festival" },
      { name: "Community Festival", code: "community-festival" },
      { name: "Other Festival", code: "other-festival" },
    ],
  },
  {
    name: "Community and Gathering",
    code: "community-and-gathering",
    subtypes: [
      { name: "Conference", code: "conference" },
      { name: "Exhibition", code: "exhibition" },
      { name: "Corporate Event", code: "corporate-event" },
      { name: "Public Gathering", code: "public-gathering" },
      { name: "Other Gathering", code: "other-gathering" },
    ],
  },
  {
    name: "Other",
    code: "other",
    subtypes: [{ name: "Other", code: "other" }],
  },
];

export type VenueSeed = {
  name: string;
  addressLine1?: string;
  townCity?: string;
  postcode?: string;
};

export const CENTRE_CIRCLE_VENUES: VenueSeed[] = [
  {
    name: "West Ham",
    addressLine1: "London Stadium",
    townCity: "London",
    postcode: "E20 2ST",
  },
  {
    name: "Tottenham Hotspur Stadium",
    townCity: "London",
    postcode: "N17 0BX",
  },
  {
    name: "Wembley Stadium",
    townCity: "London",
    postcode: "HA9 0WS",
  },
  {
    name: "Wembley Arena",
    addressLine1: "OVO Arena",
    townCity: "London",
    postcode: "HA9 0AA",
  },
  {
    name: "Brentford",
    addressLine1: "Gtech Community Stadium",
    townCity: "London",
    postcode: "TW8 0RU",
  },
];

export function isCentreCircleTenant(tenant: {
  name: string;
  slug: string;
}): boolean {
  const slug = tenant.slug.toLowerCase();
  const name = tenant.name.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    slug === "centre-circle" ||
    slug === "center-circle" ||
    slug === "centrecircle" ||
    name.includes("centre circle") ||
    name.includes("center circle")
  );
}
