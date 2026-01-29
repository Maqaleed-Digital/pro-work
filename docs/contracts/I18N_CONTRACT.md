# i18n Contract — Sprint S7

## Supported Locales
- en (LTR)
- ar (RTL)

## Detection Order
1) Query parameter: ?lang=en|ar
2) Header: accept-language (first match)
3) Fallback: en

## Runtime Guarantees
- res.locals.locale is set to "en" or "ar"
- res.locals.dir is set to "ltr" or "rtl"
- res.locals.t(key) returns string; missing keys return key name

## Ping Endpoint
GET /api/i18n/ping returns:
- locale
- dir
- message = translation of i18n.hello
