import type { Request, Response, NextFunction } from "express";
import { detectLocale, dirFor, t, type Locale } from "./i18n";

export type I18nLocals = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
};

export function i18nMiddleware(req: Request, res: Response, next: NextFunction) {
  const locale = detectLocale(req);
  const dir = dirFor(locale);

  const locals: I18nLocals = {
    locale,
    dir,
    t: (key: string) => t(locale, key)
  };

  res.locals.locale = locals.locale;
  res.locals.dir = locals.dir;
  res.locals.t = locals.t;

  res.setHeader("Content-Language", locale);
  res.setHeader("X-Content-Dir", dir);

  next();
}
