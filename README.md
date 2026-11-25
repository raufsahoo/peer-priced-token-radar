# peer-priced-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/raufsahoo/peer-priced-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/raufsahoo/peer-priced-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that prices every pre-token protocol off its own traded peers: implied value = TVL x the category's market-cap-to-TVL multiple (from the snapshot's traded protocols) x a 7-day growth factor x a no-token runway factor. A sortable, filterable dashboard with a detail view and a costed farm plan for each protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=4zb5rsph&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
