# Cryptofloricon

**Cryptofloricon** is a modern interpretation of the Victorian language of flowers (floriography), in which each flower carried a meaning and a bouquet could send a message (Ed, 2026-11-23). What form it takes, and the first piece of work, are Ed's to decide with the coordinator in its session.

- **Owner:** Ed (`edsaperia`). Repository `edsaperia/cryptofloricon`, public; it held only a placeholder `index.html` ("Hello world!", 2023-08-04) when the coordinator was started.
- **Deploys:** none. GitHub Pages does not serve this repository: `https://edsaperia.github.io/cryptofloricon/` returns GitHub's 404 *Site not found*, and the repository has no `CNAME` and no workflows (checked 2026-11-23). So a merge to `main` deploys nothing today. If Ed chooses a site, turning Pages on (or another host) is his decision, and this line is updated the day it changes.
- **Tests:** none yet. When code arrives, the tests and how to run them are written here, and the dev-ops rules *Tests that tell the truth* and *Done means seen working* apply.
- **How the project is run:** by the Cryptofloricon Coordinator, under the shared rules in `edsaperia/dev-ops` (AGENTS.md, then owner/PROFILE.md, which is Ed; CONVENTIONS.md; claude/QUESTIONS-PAGE.md). Cryptofloricon's row is in dev-ops `owner/projects.md`, which records that it is **off the page**: Ed works with the coordinator directly in its session, not through his questions page (Ed, 2026-11-23). It asks him everything there, one decision at a time, multiple choice with the recommended option first, and puts nothing on the page until he says otherwise. Each builder brief carries the coordinator's session link so a finished builder can wake it.
- **Deferred work:** a register, once there is any (item, why deferred, condition to act, where).

## The original Cryptofloricon (2011–2015), and where its materials are

Ed ran Cryptofloricon before, through Original Content London, and is resurrecting it (Ed, 2026-11-23). What the Dropbox shows (read 2026-11-23):

- **The idea:** a lexicon of about 200 "flower codes" (177 in `messages.csv`, March 2013). Each message ("I love you", "Someone else?", "Creep!") is a bouquet of up to six stems drawn from five flowers (chrysanthemum, lily, gerbera, rose, carnation, coded 1 to 5). Each entry has a title, a written passage that cross-references other codes, and tags. Written by Sasha Garwood and Grant Howitt; invented and produced by Ed.
- **History:** pop-up florist near Brick Lane for Valentine's Day, 8–10 Feb 2013; a website at cryptofloricon.com to decode and encode; a book proposal (2013) and drafts; real bouquets sold online through Stripe for Valentine's Day 2014 (about 20 orders at £19.50–£24.50, Feb–Mar 2014), delivered in London postcodes.
- **Dropbox folders** (all read-only sources; nothing has been copied into this public repository):
  - `/Cryptofloricon`: materials (book drafts, symbols, codes, `messages.csv`, design, PR, photos, delivery, franchise).
  - `/Cryptofloricon Dev` and `/Dev/Cryptofloricon`: the PHP and MySQL website as of Sept 2015; they appear to be duplicates, not yet compared by content.
  - `/Original Content London Accounting/.../Cryptofloricon` (two folders): Stripe and bank records, 2014.
- **Never copy into this repository:** database credential files (`DB.php`, `sDB.php`, `private/`), `edit password.txt`, financial records, personal documents.
- **cryptofloricon.com** still resolves in DNS (2026-11-23); what it serves is unchecked, since this session's network refuses the host.

## Glossary

Names for the parts of Cryptofloricon, literal and stable, added as they are decided.

- **language of flowers / floriography**: the Victorian practice of giving each flower a meaning, so that flowers and bouquets carry messages.
