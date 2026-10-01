# Bandstand 3: the house tiers' recall rules, before and after (2026-10-01)

Companion to [`bandstand-3-2026-10-01.md`](bandstand-3-2026-10-01.md). Each checked-in schema kept every
rule object except its recall rules, which were replaced by the rules a fresh `compile.py --backend ollama`
made of the new wording. Per instrument, the first sample of the final wording whose new questions name only
what Jev's description states was kept. "Drifted" counts the untouched rules the same compile
reworded; those rewordings were not taken.

## `prompts/pilots/house-hard.schemas.json`

Source `prompts/pilots/house-hard.prose.md`; samples kept: drums s1, keytar s1, violin s1.

**drums, low-hp**

- was `recall_low_hp`: "is this bot's hp below 90?" → recall
- now `recall_hp_low_enemy_present`: "is this bot's hp below 90 and is an enemy minion, enemy tower, or enemy bearbot in sight?" → move home
- now `recall_hp_low_no_enemy`: "is this bot's hp below 90 and are no enemy units in sight?" → recall
- drums: 10 untouched rule(s) reworded in the sample (old kept)

**keytar, low-hp**

- was `recall_low_hp`: "is this bot's hp below 90?" → recall
- now `recall_low_hp_threat`: "is this bot's hp below 90 and is an enemy minion, enemy tower, or enemy bearbot in sight?" → move home
- now `recall_low_hp_safe`: "is this bot's hp below 90 and are no enemies in sight?" → recall
- keytar: 6 untouched rule(s) reworded in the sample (old kept)

**violin, low-hp**

- was `recall_low_hp`: "is this bot's hp below 90?" → recall
- now `recall_hp_low_threat`: "is this bot's hp below 90 and is an enemy minion, enemy tower, or enemy bearbot in sight?" → move home
- now `recall_hp_low_safe`: "is this bot's hp below 90 and no enemy is in sight?" → recall
- violin: 7 untouched rule(s) reworded in the sample (old kept)

## `prompts/pilots/house-medium.schemas.json`

Source `prompts/pilots/house-violet.md`; samples kept: drums s5, keytar s5, violin s5.

**drums, low-hp**

- was `low_hp_retreat`: "is this bot's hp below 75 of its max?" → recall
- now `low_hp_enemy_present`: "is this bot's hp below 75% of its max AND is an enemy bearbot, minion, or tower in sight?" → move home
- now `low_hp_no_enemy`: "is this bot's hp below 75% of its max AND are there NO enemies in sight?" → recall
- drums: 6 untouched rule(s) reworded in the sample (old kept)

**keytar, low-hp**

- was `low_hp_retreat`: "is this bot's hp below 75% of its max?" → recall
- now `low_hp_enemy_sight`: "is this bot's hp below 75% of its max AND is an enemy bearbot, minion, or tower in sight?" → move home
- now `low_hp_no_enemy`: "is this bot's hp below 75% of its max AND are there NO enemies in sight?" → recall
- keytar: 7 untouched rule(s) reworded in the sample (old kept)

**violin, low-hp**

- was `low_hp_retreat`: "is this bot's hp below 75% of its max?" → recall
- now `low_hp_enemy_sight`: "is this bot's hp below 75% of its max AND is an enemy bearbot, minion, or tower in sight?" → move home
- now `low_hp_no_enemy`: "is this bot's hp below 75% of its max AND is NO enemy in sight?" → recall
- violin: 7 untouched rule(s) reworded in the sample (old kept)

## `prompts/pilots/house-easy.schemas.json`

Source `prompts/pilots/house-easy.prose.md`; samples kept: drums s1, keytar s1, violin s1.

**drums, low-hp**

- was `low_hp_recall`: "is this bot's hp below 100?" → recall
- now `retreat_hp_low_threat`: "is this bot's hp below 100 AND (an enemy minion OR an enemy tower OR an enemy bearbot is in sight)?" → move home
- now `retreat_hp_low_no_threat`: "is this bot's hp below 100 AND no enemy is in sight?" → recall
- drums: 4 untouched rule(s) reworded in the sample (old kept)

**keytar, low-hp**

- was `hp_low_recall`: "is this bot's hp below 100?" → recall
- now `retreat_hp_low_threat`: "is this bot's hp below 100 and is an enemy minion, enemy tower, or enemy bearbot in sight?" → move home
- now `retreat_hp_low_no_threat`: "is this bot's hp below 100 and no enemy is in sight?" → recall
- keytar: 2 untouched rule(s) reworded in the sample (old kept)

**violin, low-hp**

- was `low_hp_recall`: "is this bot's hp below 100?" → recall
- now `retreat_hp_low_threat`: "is this bot's hp below 100 AND (an enemy minion OR an enemy tower OR an enemy bearbot is in sight)?" → move home
- now `recall_hp_low_safe`: "is this bot's hp below 100 AND no enemy is in sight?" → recall
- violin: 4 untouched rule(s) reworded in the sample (old kept)

## `prompts/pilots/house-hard-eco.schemas.json`

Source `prompts/pilots/house-hard-eco.prose.md`; samples kept: drums s1, keytar s1, violin s1.

**drums, low-hp**

- was `recall_low_hp`: "is this bot's hp below 90?" → recall
- now `recall_low_hp_threat`: "is this bot's hp below 90 and is an enemy minion, tower, or bearbot in sight?" → move home
- now `recall_low_hp_safe`: "is this bot's hp below 90 and no enemy is in sight?" → recall
**drums, shopping**

- was `buy_item`: "can this bot afford the next item on its shopping list and are no enemy bearbots in sight?" → recall
- now `shop_home_threat`: "can afford next item and no enemy bearbot in sight and enemy minion/tower in sight?" → move home
- now `shop_home_safe`: "can afford next item and no enemy in sight?" → recall
**drums, fortune**

- was `spend_gold_safety`: "does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot?" → recall
- now `spend_gold_low_hp_enemy`: "carry >= 300 gold and enemy bearbot in sight has more hp than this bot?" → move home
- drums: 10 untouched rule(s) reworded in the sample (old kept)

**keytar, low-hp**

- was `recall_low_hp`: "is this bot's hp below 90?" → recall
- now `recall_hp_low_threat`: "is this bot's hp below 90 and is an enemy minion, enemy tower, or enemy bearbot in sight?" → move home
- now `recall_hp_low_safe`: "is this bot's hp below 90 and are no enemies in sight?" → recall
**keytar, shopping**

- was `buy_item_if_safe`: "can this bot afford the next item on its shopping list and is no enemy bearbot in sight?" → recall
- now `buy_home_threat`: "can afford next item and no enemy bearbot in sight and enemy minion/tower in sight?" → move home
- now `buy_home_safe`: "can afford next item and no enemies in sight?" → recall
**keytar, fortune**

- was `spend_gold_if_weak`: "does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot?" → recall
- now `spend_gold_hp_low`: "carry >= 300 gold and enemy bearbot in sight has more hp than this bot?" → move home
- keytar: 10 untouched rule(s) reworded in the sample (old kept)

**violin, low-hp**

- was `recall_low_hp`: "is this bot's hp below 90?" → recall
- now `recall_low_hp_threat`: "is this bot's hp below 90 and is an enemy minion, enemy tower, or enemy bearbot in sight?" → move home
- now `recall_low_hp_safe`: "is this bot's hp below 90 and no enemy is in sight?" → recall
**violin, shopping**

- was `buy_item_if_safe`: "can this bot afford the next item on its shopping list AND is no enemy bearbot in sight?" → recall
- now `shop_home_threat`: "can afford next item and no enemy bearbot in sight and enemy minion or tower in sight?" → move home
- now `shop_home_safe`: "can afford next item and no enemy in sight?" → recall
**violin, fortune**

- was `spend_gold_if_weak`: "does this bot carry at least 300 gold AND is there an enemy bearbot in sight with more hp than this bot?" → recall
- now `spend_gold_low_hp_enemy`: "carry >= 300 gold and enemy bearbot in sight has more hp than this bot?" → move home
- violin: 10 untouched rule(s) reworded in the sample (old kept)

## `prompts/pilots/house-medium-eco.schemas.json`

Source `prompts/pilots/house-eco-violet.md`; samples kept: drums s32, keytar s37, violin s29.

- drums: samples set aside before the kept one: 6 names a worksheet key; 1 the move does not ask about an enemy in sight.
- keytar: samples set aside before the kept one: 9 names a worksheet key; 3 the move does not ask about an enemy in sight.
- violin: samples set aside before the kept one: 1 the move does not ask about an enemy in sight; 3 names a worksheet key.

**drums, low-hp**

- was `low_hp_retreat`: "is this bot's hp below 75?" → recall
- now `low_hp_enemy_sight`: "is this bot's hp below 75 and is an enemy bearbot, minion or tower in sight?" → move home
- now `low_hp_no_enemy`: "is this bot's hp below 75 and is no enemy in sight?" → recall
**drums, shopping**

- was `shop_ready`: "is the next item affordable (gold >= cost) and no enemy bearbot present?" → recall
- now `afford_shop_tower_sight`: "can this bot afford its next item and is there no enemy bearbot or minion in sight and is an enemy tower in sight?" → move home
- now `afford_shop_no_enemy`: "can this bot afford its next item and is there no enemy in sight?" → recall
- drums: the sample's other rules came out in a different cascade shape (old kept)

**keytar, low-hp**

- was `low_hp_retreat`: "is this bot's hp below 75% of its max?" → recall
- now `low_hp_reach`: "is this bot's hp below 75 and is an enemy bearbot, minion or tower in sight?" → move home
- now `low_hp_safe`: "is this bot's hp below 75 and is no enemy in sight?" → recall
**keytar, shopping**

- was `shop_ready`: "is the next item affordable and no enemy bearbot present?" → recall
- now `afford_shop_reach`: "can this bot afford its next item and is there no enemy bearbot or minion in sight and is an enemy tower in sight?" → move home
- now `afford_shop_home`: "can this bot afford its next item and is there no enemy in sight?" → recall
- keytar: the sample's other rules came out in a different cascade shape (old kept)

**violin, low-hp**

- was `low_hp_retreat`: "is this bot's hp below 75?" → recall
- now `low_hp_reach`: "is this bot's hp below 75 and is an enemy bearbot, minion or tower in sight?" → move home
- now `low_hp_safe`: "is this bot's hp below 75 and is no enemy in sight?" → recall
**violin, shopping**

- was `shop_ready_home`: "is the next item affordable and no enemy bearbot present?" → recall
- now `afford_shop_reach`: "can this bot afford its next item and is there no enemy bearbot or minion but an enemy tower is in sight?" → move home
- now `afford_shop_home`: "can this bot afford its next item and is there no enemy in sight?" → recall
- violin: the sample's other rules came out in a different cascade shape (old kept)

## `prompts/pilots/house-easy-eco.schemas.json`

Source `prompts/pilots/house-easy-eco.prose.md`; samples kept: drums s2, keytar s1, violin s2.

- drums: samples set aside before the kept one: 1 the cascade had no such pair.
- violin: samples set aside before the kept one: 1 the cascade had no such pair.

**drums, low-hp**

- was `retreat_low_hp`: "is this bot's hp below 100?" → recall
- now `retreat_low_hp_threat`: "is this bot's hp below 100 AND (an enemy minion OR an enemy tower OR an enemy bearbot is in sight)?" → move home
- now `recall_low_hp_safe`: "is this bot's hp below 100 AND no enemy is in sight?" → recall
- drums: 4 untouched rule(s) reworded in the sample (old kept)

**keytar, low-hp**

- was `retreat_low_hp`: "is this bot's hp below 100?" → recall
- now `retreat_low_hp_threat`: "is this bot's hp below 100 AND (an enemy minion OR an enemy tower OR an enemy bearbot is in sight)?" → move home
- now `recall_low_hp_safe`: "is this bot's hp below 100 AND no enemy is in sight?" → recall
- keytar: 4 untouched rule(s) reworded in the sample (old kept)

**violin, low-hp**

- was `retreat_hp_low`: "is this bot's hp below 100?" → recall
- now `retreat_low_hp_enemy_present`: "is this bearbot's hp below 100 and is an enemy minion, tower, or bearbot in sight?" → move home
- now `retreat_low_hp_no_enemy`: "is this bearbot's hp below 100 and are no enemies in sight?" → recall
- violin: 3 untouched rule(s) reworded in the sample (old kept)

## Samples of earlier wordings, set aside

Medium's worksheet lines were reworded twice and medium-eco's three times before a sample came out clean
(the translator copied `foe or tower is not null`, then `self.hp` or `next is not null`, into Jev's questions). Samples
compiled from an earlier wording were set aside whatever their result: 28 of them.
