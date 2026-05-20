import data from "../data/tariffs.json";

export type Rating = {
  id: string;
  source: string;
  targetType: "fund" | "insurance" | "credit";
  targetId: string;
  rating: string;
  ratingNumeric?: number;
  ratingDate: string;
  url?: string;
};

export type TecisFundFlags = {
  vermittelbar?: boolean;
  kernEmpfehlung?: boolean;
  sparplanFaehig?: boolean;
  riesterFondsAuswahl?: boolean;
  ruerupFondsAuswahl?: boolean;
  fondsgebundeneLvAuswahl?: boolean;
};

export type Fund = {
  isin: string;
  wkn?: string;
  name: string;
  provider: string;
  fundType: "etf" | "mutual-fund";
  assetClass: string;
  region?: string;
  index?: string;
  ter: number;
  replicationMethod?: "physical-full" | "physical-sampling" | "synthetic";
  distribution: "distributing" | "accumulating";
  domicile?: string;
  currency: string;
  fundSize?: number;
  inception?: string;
  sfdr?: string;
  tags?: string[];
  documents?: Record<string, string>;
  notes?: string;
  tecisFlags?: TecisFundFlags;
  lastReviewedAt?: string;
  reviewedBy?: string;
  _ratings?: Rating[];
};

export type TecisInsuranceFlags = {
  vermittelbar?: boolean;
  kernEmpfehlung?: boolean;
  provisionsoptimiert?: boolean;
  nettotarif?: boolean;
};

export type Insurance = {
  id: string;
  category: "life" | "occupational-disability" | "health" | "property" | "liability" | "accident" | "car" | "legal";
  subCategory?: string;
  productLines?: string[];
  taxFavored?: boolean;
  guaranteedInterest?: number;
  provider: string;
  name: string;
  shortDescription?: string;
  minPremium?: number;
  entryAge?: { min?: number; max?: number };
  term?: { min?: number; max?: number };
  features?: string[];
  documents?: Record<string, string>;
  ratings?: string[];
  tags?: string[];
  notes?: string;
  tecisFlags?: TecisInsuranceFlags;
  lastReviewedAt?: string;
  reviewedBy?: string;
  _ratings?: Rating[];
};

export type TecisCreditFlags = {
  vermittelbar?: boolean;
  kernEmpfehlung?: boolean;
};

export type Credit = {
  id: string;
  type: "mortgage" | "installment" | "personal";
  provider: string;
  name: string;
  minAmount?: number;
  maxAmount?: number;
  minTermMonths?: number;
  maxTermMonths?: number;
  effectiveRate?: { from?: number; to?: number };
  fixationPeriodsYears?: number[];
  maxLtv?: number;
  features?: string[];
  tags?: string[];
  notes?: string;
  tecisFlags?: TecisCreditFlags;
  lastReviewedAt?: string;
  reviewedBy?: string;
  _ratings?: Rating[];
};

export type Bundle = {
  version: number;
  updatedAt: string;
  counts: {
    funds: number;
    insurance: number;
    credit: number;
    ratings: number;
    overrides?: { funds: number; insurance: number; credit: number };
  };
  funds: Fund[];
  insurance: Insurance[];
  credit: Credit[];
  ratings: Rating[];
};

export const bundle = data as Bundle;
export const funds = bundle.funds;
export const insurance = bundle.insurance;
export const credit = bundle.credit;
export const ratings = bundle.ratings;

export const INSURANCE_CATEGORY_LABELS: Record<Insurance["category"], string> = {
  life: "Lebensvers.",
  "occupational-disability": "BU",
  health: "Kranken",
  property: "Sach",
  liability: "Haftpflicht",
  accident: "Unfall",
  car: "Kfz",
  legal: "Rechtsschutz",
};

export const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: "Aktien",
  bond: "Anleihen",
  mixed: "Mischfonds",
  commodity: "Rohstoffe",
  "money-market": "Geldmarkt",
  "real-estate": "Immobilien",
};

export const CREDIT_TYPE_LABELS: Record<Credit["type"], string> = {
  mortgage: "Baufinanzierung",
  installment: "Ratenkredit",
  personal: "Privatkredit",
};

export function formatEur(value: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    ...opts,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 2): string {
  return `${value.toFixed(fractionDigits).replace(".", ",")} %`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
}
