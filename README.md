# 月夜狼人殺 — Online Werewolf (Traditional Chinese)

Real-time multiplayer 狼人殺 for phones and desktop, in a dark gothic style. The host creates a room and shares a 4-character code; everyone joins with the code and a nickname. The server is the moderator: it deals roles, runs every night step with its own animation, handles the sheriff election, speaking order, votes, PK rounds and skill triggers, and announces the winner.

This project uses the Google AI Studio full-stack layout: `server.ts` (Express + Socket.io) at the root serves the React app in `src/`.

## Voice (按住說話)

There is no voice switch: a player's first tap in a room connects voice and asks for the microphone once (if they refuse, they can still listen). Then:
- **Lobby and after the game:** everyone in voice can hold the mic button to talk freely.
- **Day speeches, PK and 遺言:** only the player whose turn it is can talk; everyone else listens. Their seat glows while they speak.
- **Night:** wolves can hold to talk during the wolf step, heard only by other wolves in voice. Nobody else hears them or sees that they are talking.
- In a game the talk button is a slim bar pinned to the bottom of the screen (about 6% of its height, never more than 8%), so it is always within thumb reach without covering the table.
- Your role's character stands bottom-left, beside the action panel and above the bar; tap it to see your skills.
- **免按住** (the lock beside the bar) turns the button into a tap-on / tap-off switch for long speeches.

The server decides who may talk and who hears it; when your turn ends your mic is cut off.

Audio goes directly between players' devices (WebRTC). If a network blocks that (some mobile carriers, strict Wi-Fi), audio for that pair is relayed through the game server automatically as 16 kHz μ-law (about 128 kbps per listener). To add a TURN relay instead, set `VOICE_ICE_SERVERS` to a JSON array of ICE servers. `metadata.json` requests microphone permission for the AI Studio preview.

## 測試模式 (test mode)

In the lobby the host can switch on 測試模式:
- **加入 1 位電腦 / 補滿至 N 人** adds computer players (named 電腦・…). They run on the server, so this works in AI Studio and on any host with no extra scripts. They speak, vote, run for sheriff and use their skills on their own.
- **我想當** lets each human pick the role they'll be dealt (or 隨機分配). If more people want a role than the pack has, whoever picked first gets it.
- Switching test mode off removes the computers and clears role picks. A 測試模式 tag shows in the game toolbar.

## Character transitions

Night role calls and the opening role reveal use the 「角色轉場」 pack: `src/transitions/werewolfTransitions.js` (the drop-in module) with the cut-out art in `public/characters/`. Every role has art; only the 幸運兒 step (a gift, not a role) falls back to the tarot-card cut-in. The server sizes each night role-call intro to the transition's length (`CHARACTER_ART` in `shared/roles.ts`).

The same pack's 18 **回合動畫** (turn animations, scene backgrounds in `public/turns/bg/`) play at the matching moments:

| When | Who sees it | Animation |
| --- | --- | --- |
| Night role call for 狼人、守衛、預言家、通靈師、石像鬼、狼美人、機械狼（學習）、守墓人、奇蹟商人 | only the players acting in that step (everyone else gets the role call) | 狼人獵殺、守護、查驗、通靈… |
| 女巫's turn | the witch | 解藥 (with who fell tonight) or 毒藥 |
| 獵人／狼王 may shoot | the shooter | 開槍 (tap to skip) |
| 白狼王 chooses who to take | the white wolf king | 自爆 |
| 騎士 presses 騎士決鬥 | the knight | 決鬥 |
| 白痴 is revealed, 熊 roars | everyone | 翻牌, 咆哮 |
| The day's exile vote opens | everyone | 投票時間 |

## Run in Google AI Studio

1. Open AI Studio → **Build**. Start a new app and stop the agent once it begins generating.
2. Open the **Code** tab and delete the generated starter files.
3. Click **+** → **Upload** and choose this zip (`package.json`, `server.ts` and `index.html` sit at the top level of the zip). Save.
4. The preview starts the server with `npm run dev`. Open the preview in two tabs to try a room.
5. **Publish** deploys it to Cloud Run and gives you a public link to share.

Alternatively push this folder to GitHub and use **+** → **Import from GitHub**.

No API keys or secrets are needed — the game doesn't call Gemini.

## Run anywhere else

Requires Node 18+.

```bash
npm install
npm run dev        # development: http://localhost:3000 (Vite middleware)
npm run build      # build the client into dist/
npm start          # production: serves dist/ on $PORT (default 3000)
```

Test on your own: create a room in the browser, then `npm run bots ABCD 11` fills room ABCD with 11 bot players.
`npm test` runs the rule scenarios and 120 simulated bot games; `npm run lint` typechecks.

`render.yaml` is included if you'd rather deploy on Render (New → Blueprint).

## Hosting notes

- Rooms live in server memory. A restart, redeploy or scale-to-zero clears open rooms, so don't redeploy mid-game.
- All players must reach the same server instance. Keep the deployment at a single instance (Cloud Run: max instances = 1) if you change scaling settings.
- The client connects over WebSocket and falls back to HTTP long-polling if a proxy blocks WebSockets. Dropped connections resume automatically into the same seat.

## Project layout

```
server.ts            Express + Socket.io: rooms, lobby, start, reconnect; serves the client
server/game.ts       game engine (one async script; phases with timers)
shared/roles.ts      roles, packs, default rules (used by server and client)
src/                 React client; components/Cinematic.tsx + cinematic.css hold the animations
scripts/             simulate.ts (bot soak test), scenario.ts (rule checks), bots.ts (live bots)
metadata.json        AI Studio app metadata
```

## Game flow

Lobby → host picks a pack (or custom roles) and rules → 確認身分 → night (奇蹟商人 → 攝夢人 → 機械狼 → 守衛 → 狼人 → 狼美人 → 女巫 → 預言家 → 通靈師 → 石像鬼 → 獵魔人 → 守墓人 → 幸運兒) → dawn → day 1 警長競選 (if on) → 公佈死訊 (and the bear's roar) → triggers (獵人/狼王開槍, 移交警徽, 遺言) → speeches → 放逐投票 (PK on ties) → win check → next night.

**Speaking order**
- 警長局: players opt in (上警) during sign-up, candidates speak in a random order and can 退水 at any time during speeches or the vote; non-candidates vote. A tie goes to PK, a second tie loses the badge. Each day the sheriff picks 順序 or 逆序 and speaks last.
- 無警長局 (or badge lost): the system picks a random starting seat and a random ascending/descending direction.

**Packs (28 + 自訂)**, filterable by player count in the lobby:
- 小型: 新手入門局 (6), 七人速戰 (7), 八人預女獵 (8), 標準局 (9), 九人守衛局 (9)
- 中型: 進階局 (10), 十人狼王局 (10), 十人奇蹟商人 (10), 十一人熊局 (11)
- 12人: 預女獵白, 預女獵守, 狼王守衛, 白狼王騎士, 白狼王守衛, 狼美人騎士, 石像鬼守墓人, 預女獵熊, 奇蹟商人, 攝夢人, 獵魔人, 惡靈騎士, 隱狼, 機械狼通靈師
- 大型: 十四人狼美人局 (14), 十五人大型局 (15), 十六人全明星 (16), 十六人奇蹟夜 (16), 十八人滿房局 (18)

**Roles (21)**: 狼人, 狼王, 白狼王, 狼美人, 惡靈騎士, 機械狼, 石像鬼, 隱狼, 預言家, 通靈師, 女巫, 獵人, 守衛, 白痴, 騎士, 守墓人, 熊, 奇蹟商人, 攝夢人, 獵魔人, 村民.
- 狼美人 charms a player each night; if she goes out, the charmed player dies with her (no shot, no last words). She can't self-destruct.
- 石像鬼 doesn't meet the wolves, checks one player's exact role each night, and gains the kill once the other wolves are out.
- 隱狼 knows the wolves but doesn't open eyes with them or kill; seer, bear, knight, demon hunter and gravekeeper all see him as good. Gains the kill once the other wolves are out.
- 惡靈騎士 kills with the wolves and is immune to every night death. One-time reflect: the seer who checks him, or the witch who poisons him, dies that night.
- 守墓人 learns, from night 2, whether the previous day's exiled player was a wolf.
- 熊: at each dawn the moderator announces whether the bear roared (a wolf sits on either side among living players).
- 奇蹟商人 acts first each night. Once per game she gives another player (the 幸運兒) a one-time 查驗, 毒藥 or 守護, used that night or any later night. Trading with a wolf gives nothing and the merchant dies at dawn.
- 攝夢人 must pick a 夢遊者 each night, who is immune to night deaths. If the dreamweaver dies at night the dreamer dies too; the same dreamer two nights running dies.
- 獵魔人 hunts from night 2: a wolf target dies, a good target costs the hunter his life. Immune to witch poison.

**Host rules**: 警長競選, 屠邊/屠城, 女巫自救 (僅首夜/不可/全程可), 同守同救, 夜晚死亡遺言, 隨機座位, and timers for every phase. The host can also skip a stuck phase or end the game.

**Fairness details**: roles and night actions never leave the server; night steps for dead or absent roles still play for a random time; every death gets a skill window so hunters can't be spotted.

**Notes**: tap any seat to tag it (狼, 好人, 金水, 查殺, 銀水, role guesses) and add a remark. Notes stay on the player's device only.

Speeches are meant for voice (in person or a call). Speakers can also type, and wolves get a private chat during their night step.

## Project layout

```
shared/roles.js       roles, packs, default rules (used by server and client)
server/game.js        game engine (one async script; phases with timers)
server/index.js       Express + Socket.io: rooms, lobby, start, reconnect
client/src/           React UI; components/Cinematic.jsx + cinematic.css hold the animations
scripts/simulate.js   plays hundreds of random bot games against the engine
scripts/scenario.js   scripted checks for tricky rules
scripts/bots.js       bot players for live testing
```

`npm run test:engine` runs the soak test. `WW_TEST_ROLE=witch npm start` gives the host a chosen role (testing only — never set it in production).

## Customising

- Add or edit a pack: `PACKS` in `shared/roles.js`.
- Animation lengths: `CINE` in `server/game.js` (the CSS uses the phase length, so they stay in sync).
- Colours and fonts: top of `client/src/styles.css`.

## Wolf kill (no confirm)

Wolves get no panel and no text chat (they talk with the mic). They tap a player — that is their choice; tap again to clear it, or press 空刀 (top-left). Every proposed victim gets a pulsing red ring with the seat numbers of the wolves who chose them. Choices can change until the wolf step ends. The kill is whoever has the most wolf votes (空刀 counts as a vote for nobody; a tie between players is settled at random). If every wolf agrees, the step ends about 4 seconds later. For the rest of that night each wolf sees 「今晚狼隊擊殺 N號」 in their panel.

## 擲物 (second » tab)

The red 「» 擲物」 tab (under the left seat column, below 「» 提示」) opens a small fly-out over the left seat column with just an egg, a mouldy tomato and a poop. Tap one and every other player's seat starts blinking; tap a seat to throw (tap the tab again to cancel). Everyone sees it arc from your seat and splat on theirs. Living players can throw by day (not at night, and not once out, so nobody can pass hidden information); there is a short cooldown between throws.

## Seating plan (lobby)

Before the game starts the lobby shows the table as chairs in two rows facing each other — one chair per role in the chosen setup (e.g. 2 × 6 for 12 players). New players take the first free chair; anyone can press **站起來** and tap an empty chair to move. The host can still **打亂座位** or remove players with ×. The game can't start while anyone is standing. (If 隨機座位 is on in the settings, seats are shuffled again at the start.)

## 動畫 / 簡易 switch

The round button at the bottom-left (next to the talk bar) switches animations off: no character transitions, turn animations or full-screen cinematics — each one becomes a short plain notice (e.g. 「預言家請睜眼」, 「3號 被放逐」). It is remembered on that device and can be switched back any time.

## 票型 (vote records)

Every vote result pops up as a 票型 card and stays until the player presses 確認. Vote lines in the judge's feed are tappable (查看票型 ›) to reopen that record.

## Speaking panel

On your turn to speak, the text panel has a » button that tucks it into a 「發言 «」 tab under the right seat column, so the whole table stays visible while you talk; tap the tab to bring it back. It stays minimised for later turns until reopened. 結束發言 is a separate button that stays in the same place (bottom right, above the talk bar) either way.

## Speech timer and 延長發言

While someone speaks, a ring draws itself around their portrait; a full circle means their time is up (it turns red for the last 10 seconds). If the room setting 延長發言 is on (lobby rules, on by default), the host or the sheriff can add 30 seconds to the current speech — including their own — up to 3 times per speech; the judge's feed notes each extension.

Transitions play over the table with a see-through backdrop and let taps through, so seats, notes, the » tabs and the talk bar stay usable while they run (the bottom-left 動畫/簡易 switch still turns them off entirely).
