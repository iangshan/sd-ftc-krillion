# San Diego FTC Krillion

A rare-answer game for the San Diego FIRST Tech Challenge community. Anyone can play as a guest. The results show each answer and its points, plus a score distribution and average from rounds saved in that browser. This is an independent fan project.

## Publish on GitHub Pages

This repository publishes the root of `main` to [iangshan.github.io/sd-ftc-krillion](https://iangshan.github.io/sd-ftc-krillion/). In **Settings → Pages**, use **Deploy from a branch**, `main`, and **/(root)**. The site needs no build step. [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Manage questions

Edit `game.json` in GitHub with your repository account, or open the standalone HTML on your computer with `#admin` at the end of the address. The local editor lets you set prompts, accepted answers and aliases, and the names and points for rarity tiers. Export `game.json` and commit it to your Pages branch to publish the changes. GitHub repository write access controls who can publish edits.

The top-level `revision` separates score comparisons. Increase it when you publish a new set of questions or change how answers score. Because Pages serves the answer key as part of the game, treat everything in `game.json` as public. Score history stays in each player’s browser.

## Sound effects

Correct answers play a short, original sound based on their rarity tier, from lowest to highest. The sounds evoke FTC’s three auto-end buzzes, three teleop bells, final-seconds train whistle, match-end buzzer, and match-start charge. The corner sound button remembers each player's preference. [FTC competition manual](https://ftc-resources.firstinspires.org/ftc/game/manual)

## Preview and test

Run these commands from the repository root with Node.js 22 or newer, then open `http://127.0.0.1:8783/` to preview.

```sh
node --test core.test.mjs tier-sounds.test.mjs
node preview.mjs
```
