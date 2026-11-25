# Third-party notices

Crawlspace is original work by mtblck under the MIT license (see LICENSE).

Crawlspace was written from scratch after surveying SEO skills on GitHub
(2026-11-11); no text or code was copied. Ideas taken: treating fetched pages as
untrusted data and splitting the audit into parallel specialist passes
(AgriciDaniel/claude-seo, MIT); the crawl → technical → on-page → content →
authority order and the warning that raw fetches can't see JavaScript-injected
JSON-LD (coreyhaines31/marketingskills, MIT); reading the code and the served
site together, classifying routes as public-index / public-noindex / private,
fixing shared infrastructure first and proving fixes by re-fetching
(umutxyp/Seo-Promt-Master, MIT); not inventing ranking weights
(addyosmani/web-quality-skills, MIT); reviewing a page against the live top
results (inhouseseo/superseo-skills, Apache-2.0); separating AI search crawlers
from training crawlers (zubair-trabzada/geo-seo-claude, MIT). The plugin's
README has the full survey.

At run time the checker uses Playwright and its Chromium when they're already
installed (Apache-2.0). Nothing is downloaded or bundled by this repo.
