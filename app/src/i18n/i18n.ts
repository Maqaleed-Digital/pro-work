import type { Request } from "express";
import en from "../../locales/en/common.json";
import ar from "../../locales/ar/common.json";

export type Locale = "en" | "ar";

type Dict = Record<string, string>;

const DICTS: Record<Locale, Dict> = {
  en: en as Dict,
  ar: ar as Dict
};

export function normalizeLocale(x: unknown): Locale {
  if (typeof x !== "string") return "en";
  const v = x.trim().toLowerCase();
  if (v === "ar" || v.startsWith("ar-")) return "ar";
  return "en";
}

export function detectLocale(req: Request): Locale {
  const q = req.query?.lang;
  if (typeof q === "string" && q.trim().length > 0) return normalizeLocale(q);

  const h = req.header("x-locale");
  if (typeof h === "string" && h.trim().length > 0) return normalizeLocale(h);

  const al = req.header("accept-language");
  if (typeof al === "string" && al.trim().length > 0) {
    const first = al.split(",")[0]?.trim() ?? "";
    if (first.length > 0) return normalizeLocale(first);
  }

  return "en";
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function t(locale: Locale, key: string): string {
  const dict = DICTS[locale] ?? DICTS.en;
  const v = dict[key];
  if (typeof v === "string") return v;

  const fallback = DICTS.en[key];
  if (typeof fallback === "string") return fallback;

  return key;
}

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? DICTS.en;
}
