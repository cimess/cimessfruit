# CimessFruit legal-content review

Prepared 4 November 2026. This is a drafting and implementation review, not a legal opinion or certification of compliance. Have Nigerian counsel review the text and actual operating practices before publication. No deployment or external publication was performed.

## Content and length

The supplied `mobile/src/app/privacy/index.tsx` contained a privacy redirect followed by a separate web-only CimessInvest terms component, two default exports, HTML elements, a missing animation dependency and platform-wide merchant clauses. Its visible JSX prose contained approximately 4,463 words.

The replacement terms have 34 sections and approximately 5,788 words of substantive paragraphs, excluding headings. Separate privacy (20 sections), refund (10 sections) and delivery (8 sections) documents bring substantive paragraphs to approximately 9,905 words. `CIMESSFRUIT_POLICIES.md` is the full readable review copy. Length is measured as legal text, not JSX markup or artificially padded source lines.

The canonical, editable content is `api/lib/legal/policies.json`. The website and public API read that same file. The mobile app fetches it instead of bundling a second policy copy. Edit the JSON and bump its version and revision date when publishing a revision; update the review copy to match.

## Organisation and factual assumptions

- Preserved the owner's stated relationship: CimessFruit is the food-shopping service within the CimessInvest organisation, accessible through its authorised subdomain and app. No claim that either brand is a separately incorporated entity or a registered investment business has been added.
- Preserved the supplied organisational address, email and telephone: 54, Olude Bustop, Ipaja, Lagos; cimessinvest@gmail.com; +234 808 927 3565. Confirm these are monitored and appropriate for formal privacy and consumer correspondence.
- The owner expressly requested exclusion of the payment beneficiary's account name. It is excluded from all policy text. Payment instructions are referred to the saved order; the policy does not repeat a receiving bank name, account holder or account number.
- Before publication, confirm the actual contracting legal person, registration details where relevant, and the responsible data controller. Describing a brand relationship does not resolve those legal facts. Do not infer the seller's legal identity from the bank beneficiary or claim a registration number that has not been supplied.
- No fixed refund completion time, guaranteed delivery time, universal change-of-mind return right, or fixed legal retention period has been invented.

## Main changes from the supplied platform terms

1. Replaced merchant onboarding, storefront licensing, platform fee, automated settlement, Paystack and escrow claims with the actual store workflow: stock review, saved orders, manual bank transfer, payment verification and delivery.
2. Retained organisation identity/contact, scope, age and authority, accounts, intellectual property, acceptable use, external providers, privacy, communications, interruption, termination, Nigerian law and complaint provisions.
3. Added produce variation, ingredients and allergies, food handling, missing or unsafe goods, practical delivery issues, mistaken transfers, order expiry and proportionate evidence requirements.
4. Explained approved return credit, the default buy-again option, the 20-minute spending window, reservations, refund locks and manual transfers. Distinguished this from complaint deadlines, money forfeiture and bank receipt timing.
5. Removed blanket platform disclaimers of retail responsibility, blanket exclusions of injury and direct losses, the USD liability cap, compulsory consumer arbitration/class-action restrictions, general consumer indemnities, unrestricted content licences and blanket consent to international transfers.
6. Distinguished disabled accounts from personal-data erasure, described current retained records, and provided an external request channel. Added notification choices, local storage, maps, private evidence, provider categories, retention criteria, privacy rights and review of automated checks.

## Operational matters the wording cannot solve

- Account disabling preserves the profile and financial/support history. The app does not implement a comprehensive automated erasure workflow or a complete retention schedule. The privacy document describes this and directs erasure requests to the organisation; establish and operate an actual request, retention and backup-deletion process.
- Confirm the active hosting regions, provider agreements, cross-border safeguards, notification configuration and staff access practices. Source code shows integrations, not proof that contractual and organisational safeguards have been completed.
- The existing refund flow starts the spending window on approval and defaults to credit/buy again. The text preserves refund rights and directs users to record their preference. Counsel and the operator should check whether operational changes are necessary for a particular mandatory remedy; wording cannot make an unlawful delay or forced credit lawful.
- Confirm operational responsibility for food handling, allergen descriptions and incident response. No certification, registration or allergy-free guarantee has been asserted.
- Signup now provides links for advance reading. No timestamped acceptance record, checkbox, age verification or acceptance-version migration was introduced. The draft deliberately does not pretend these controls already exist. Decide with counsel whether a recorded assent process is needed for launch.
- Confirm the deployment origin separately. No guessed or corrected subdomain is hardcoded into the policies or mobile client; mobile requests use the existing configured API origin.

## Sources consulted

- [Federal Competition and Consumer Protection Act, 2018, official FCCPC copy](https://fccpc.gov.ng/wp-content/uploads/2022/07/FCCPA-2018.pdf).
- [FCCPC consumer rights and responsibilities](https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/): clear descriptions and prices, cancellations, non-conforming goods, quality and service obligations.
- [Nigeria Data Protection Commission FAQs](https://ndpc.gov.ng/faqs/), [NDPC privacy policy](https://ndpc.gov.ng/our-data-privacy-policy/) and [NDPC data subject request information](https://forms.ndpc.gov.ng/dsar-request/): regulator-published explanations of purposes, lawful grounds, retention, rights and complaints under the Nigeria Data Protection Act 2023. Indexed text was available; direct retrieval returned HTTP 403. This is not an exhaustive review of every applicable regulation or subsequent guidance.

The draft is original wording adapted to the supplied app and policy, not a reproduction of regulator materials. Legal enforceability and actual compliance require review of the identified organisation and its real practices.

## API and reader behaviour

- `GET /api/policies/terms`, `/privacy`, `/refunds`, `/delivery` returns `{ policy: { id, title, version, updatedAt, summary, sections, links } }`.
- The API reads only the local policy dataset. Unknown keys, including inherited object property names, return 404.
- Public policy GET/HEAD requests bypass session lookup; neighbouring API paths and writes remain protected. Forwarded identity hints are stripped.
- Web pages remain `/terms`, `/privacy`, `/refunds`, `/delivery`, with contents navigation and the complete same text.
- Mobile `/privacy` redirects to `/policies/privacy`. All four documents are linked from the policy reader. It validates the response, times out stalled requests, supports retry/refresh, labels a previously loaded copy when refresh fails, and never treats a cached policy as a new consent.
- No persistent bundled fallback is presented as a current policy. When no document has loaded, the reader shows an explicit error and contact details for requesting a copy.

## Verification completed

- 24 API policy/access-control tests and 3 mobile response/client tests passed.
- API and mobile TypeScript checks passed.
- API lint and lint of all changed mobile files passed. Full mobile lint remains blocked by four existing unescaped-quote JSX errors and two unused-variable warnings in `mobile/src/features/chat/ChatScreen.tsx`; that file was not changed.
- The Next.js production build passed. Expo exported both iOS and Android bundles successfully using a single worker after the sandboxed multi-worker run stalled.
- A temporary loopback-only production server returned all four policy API responses and full web pages successfully as a guest, and returned 404 for an unknown policy. It was shut down after verification.
- No native-device visual interaction was performed and no deployment was made.
- Workspace limitation: `api` is recorded as a Git submodule but currently lacks its `.git` metadata. API edits are saved on disk, but do not appear as ordinary file changes in the parent repository diff. Restore the submodule's proper Git working-copy metadata before committing those changes; do not assume the parent commit will include them automatically.
