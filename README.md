# San Diego FTC Krillion

A rare-answer game for the San Diego FIRST Tech Challenge community. Players can play as guests and see their answers, points, and score comparison at the end. The owner manages questions and rarity tiers through a private sign-in. This is an independent fan project.

## Run locally

Use Node.js 22.13 or newer. From the repository root, run the preview and open `http://127.0.0.1:8783/`.

```sh
node preview.mjs
```

Run the game logic and Worker tests from the same directory.

```sh
node --test core.test.mjs backend/*.test.mjs
```

## Publish the website

In the repository, open **Settings → Pages** and set the source to **Deploy from a branch**, branch **main**, and folder **/(root)**. The frontend uses relative file paths and needs no build step.

With `API_ORIGIN` empty in `config.mjs`, the site runs in practice mode. Its comparison uses rounds completed in the current browser. If you entered questions in an earlier preview, open the same preview with `#admin` at the end of its address and export the saved questions for import into the shared game.

## Enable shared play and admin

GitHub Pages serves the frontend. A separate Cloudflare Worker stores the shared game and scores in D1. Players can use a nickname, team number, or generated guest name. The server scores their answers, saves the score upon round completion, and does not retain the text of their guesses. The results screen shows a distribution and average for the same round after at least three completed rounds. Individual scores and nicknames are visible only in the authenticated owner view.

1. From `backend/`, copy `wrangler.example.toml` to `wrangler.toml`. Sign in to Cloudflare and create a database for this game.

   ```sh
   npx wrangler login
   npx wrangler d1 create sdftc-krillion
   ```

2. In `wrangler.toml`, replace the example database ID with the returned D1 database ID. Set `ALLOWED_ORIGINS` to the Pages origin, for example `https://YOUR-GITHUB-USERNAME.github.io`, without a repository path or trailing slash. Add `http://127.0.0.1:8783` to the comma-separated list if the local preview should use the same API.
3. Apply the database schema, deploy the Worker, and set the owner's username and a unique password of at least 16 characters as encrypted Worker secrets. Run the same schema command for an existing database to add the new tables and index.

   ```sh
   npx wrangler d1 execute sdftc-krillion --remote --file ./schema.sql
   npx wrangler deploy
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   ```

4. Set `API_ORIGIN` in `config.mjs` to the deployed Worker origin and publish that commit to Pages. Add `#admin` to the game URL and sign in with the owner's username and password. Save your questions and optional answer aliases, set each answer's tier, and rename the tiers whenever you're ready.

Keep the owner's password in a password manager and in the Worker secret. The only value needed in the published `config.mjs` is the API origin. The Worker starts with example questions, so replace them in the admin panel when your own question set is ready.

## Source layout

- `index.html`, `styles.css`, and `scene.mjs` define the site, pixel-art backdrop, and animated robot.
- `assets/` contains the edited backdrop and the locally hosted display typeface with its license.
- `app.mjs` runs play, `admin.mjs` runs the editor, and `store.mjs` connects them to browser storage or the API.
- `results.mjs`, `results.css`, and `round-stats.mjs` render the results and calculate score distributions.
- `core.mjs` validates questions and implements answer matching and scoring.
- `backend/` contains the Worker, D1 schema, configuration example, and API tests.
