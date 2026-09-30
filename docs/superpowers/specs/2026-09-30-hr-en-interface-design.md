# Croatian and English interfaces

## User requirements

- Module source identifiers, comments and developer/public documentation stay English.
- The website is bilingual Croatian/English.
- The application's commerce interface also includes Croatian translations.
- Publication remains the MIT WSCommerce repository under Websolutions.

## Scope decision

The deliverable covers the WSCommerce reference shop and its commerce merchant interfaces. Separate client shops own their authored content and must keep private source and data outside this public repository. Language is a presentation preference and must never change financial snapshots, persisted IDs, SKUs, permission checks or protocol/API status values.

## Reference shop

Provide explicit EN/HR switching and persist the selected preference. Translate authored interface/navigation/form/error/status/confirmation copy, accessible labels, country names and formatted money consistently. Preserve canonical commerce URLs, private capability query parameters and existing origin checks. Reject external/invalid language return targets. CMS product titles/descriptions and merchant-authored instructions are content, not interface messages to translate by dictionary substitution.

## Merchant application

Provide EN/HR presentation in commerce React pages with a visible language choice and a stable preference. Translate fixed labels, instructions, action/validation/confirmation messages and human-facing status labels. Keep action IDs, enum/option values, idempotency keys and native/provider records unchanged. Default English preserves existing consumer behavior. Translation must target authored UI copy explicitly, never traverse arbitrary customer/product/note data.

## Shared rules

Locale values are `en` and `hr`; normalize BCP-47 variants, fall back safely, retain named interpolation and Croatian plural forms where quantities are displayed. Keep dictionaries and presentation helpers dependency-free where shared. No new provider calls or storage migrations are required. Test locale switching/persistence, unsafe redirects, formatting, missing/invalid locale handling and unchanged mutations. Document the extension pattern and accepted evidence in English.
