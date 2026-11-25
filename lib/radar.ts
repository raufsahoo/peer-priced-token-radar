// Peer-priced token radar: the value model and the farm plans.
//
// implied value = TVL x peer multiple(category) x growth factor(7d change) x runway factor(days with no token)
//
// - peer multiple: the median market-cap-to-TVL ratio of the snapshot's own traded protocols in the same
//   category, shrunk toward the median of every traded protocol (a category with few traded peers leans on
//   the market as a whole). No hardcoded names and no outside prices: every number comes from the snapshot.
// - growth factor: exp(2 x clamp(change_7d, -30, 30) / 100), so -30% a week reads 0.55x and +30% reads 1.82x.
// - runway factor: 0.85 at launch rising to 1.15 at two years with no token: a longer record earns a firmer price.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: unknown;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Step {
  text: string;
  cost: string;
  time: string;
}

export interface PeerMultiple {
  category: string;
  peers: number;
  median: number;
  multiple: number;
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  multiple: number;
  peers: number;
  growth: number;
  runway: number;
  plan: Step[];
}

export interface Traded {
  slug: string;
  name: string;
  category: string;
  symbol: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export const SHRINK_K = 5; // pseudo-peers pulling a category toward the market-wide median
export const MULT_MIN = 0.03;
export const MULT_MAX = 3;
export const GROWTH_CLAMP = 30;
export const RUNWAY_DAYS = 730;

/** Categories that are custody or a wrapper of an existing asset, not a protocol that may launch a token. */
const NOT_A_LAUNCH = new Set(['CEX', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Bridge']);
const WRAPPED = /\b(wrapped|staked|staking)\b/i;

export const hasToken = (p: Protocol): boolean => p.gecko_id !== null || p.symbol !== null;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listedAt}T00:00:00Z`)) / 86_400_000);
  return days >= 0 ? days : null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Each category's peer multiple, from the traded protocols of the snapshot itself. */
export function peerMultiples(snapshot: Snapshot): { byCategory: Map<string, PeerMultiple>; market: number; traded: Traded[] } {
  const traded: Traded[] = snapshot.protocols
    .filter((p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category ?? 'Other', symbol: p.symbol ?? '', tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, ratio: p.mcap_usd! / p.tvl_usd }));
  const market = median(traded.map((t) => t.ratio));
  const groups = new Map<string, number[]>();
  for (const t of traded) groups.set(t.category, [...(groups.get(t.category) ?? []), t.ratio]);
  const byCategory = new Map<string, PeerMultiple>();
  for (const [category, ratios] of groups) {
    const med = median(ratios);
    const n = ratios.length;
    const blended = Math.exp((n * Math.log(med) + SHRINK_K * Math.log(market)) / (n + SHRINK_K));
    byCategory.set(category, { category, peers: n, median: med, multiple: Math.min(MULT_MAX, Math.max(MULT_MIN, blended)) });
  }
  traded.sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1));
  return { byCategory, market, traded };
}

/** A protocol the radar ranks: no token recorded, and not custody or a wrapper. The watchlist is always in. */
export function isCandidate(p: Protocol, watch: Set<string>): boolean {
  if (watch.has(p.slug)) return true;
  if (hasToken(p) || p.tvl_usd <= 0) return false;
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return false;
  return !WRAPPED.test(p.name);
}

// ---------------------------------------------------------------- farm plans

interface ChainCost { gas: string; bridge: string; }
const CHAIN_COST: Record<string, ChainCost> = {
  Ethereum: { gas: '$2-15 a transaction on Ethereum mainnet', bridge: 'no bridge needed from an exchange withdrawal to Ethereum' },
  Arbitrum: { gas: '$0.02-0.20 a transaction on Arbitrum', bridge: 'withdraw from an exchange straight to Arbitrum (about $0.10-1, 2-10 minutes)' },
  Base: { gas: '$0.01-0.10 a transaction on Base', bridge: 'withdraw from an exchange straight to Base (about $0.10-1, 2-10 minutes)' },
  'OP Mainnet': { gas: '$0.01-0.10 a transaction on OP Mainnet', bridge: 'withdraw from an exchange straight to OP Mainnet (about $0.10-1, 2-10 minutes)' },
  Solana: { gas: 'under $0.01 a transaction on Solana', bridge: 'withdraw SOL and USDC from an exchange to a Solana wallet (about $0.01-1, 1-5 minutes)' },
  BSC: { gas: '$0.05-0.30 a transaction on BNB Chain', bridge: 'withdraw from an exchange straight to BNB Chain (about $0.10-1, 2-5 minutes)' },
  Hyperliquid: { gas: 'near-zero fees on Hyperliquid L1', bridge: 'deposit USDC to Hyperliquid through its Arbitrum bridge (about $1, 1-5 minutes)' },
  Bitcoin: { gas: '$1-10 a Bitcoin transaction, depending on the mempool', bridge: 'withdraw BTC from an exchange (one confirmation, 10-60 minutes)' },
};
const costOf = (chain: string): ChainCost => CHAIN_COST[chain] ?? { gas: `cents to a few dollars a transaction on ${chain}; check its explorer first`, bridge: `bridge to ${chain} with its official bridge (check the fee it quotes; usually 5-30 minutes)` };

type Action = { deposit: string; activity: string; risk: string };
function actionFor(category: string, name: string, chain: string): Action {
  const c = category.toLowerCase();
  if (c.includes('curator') || c.includes('capital allocator') || c === 'yield' || c.includes('yield aggregator'))
    return { deposit: `Deposit USDC or ETH into one of ${name}'s flagship vaults on ${chain} (read the vault page: strategy, fee and withdrawal delay)`, activity: `Keep the position open and add once a month rather than cycling it: curated-vault programs usually weight time-weighted deposits`, risk: `Vault risk stacks the curator's strategy on the underlying lending markets; prefer vaults with a public risk report and keep each vault under 10% of your stack` };
  if (c.includes('lending') || c === 'cdp')
    return { deposit: `Supply USDC (or ETH) on ${name} and, if you borrow, keep the loan under 40% of collateral so a 30% drawdown cannot liquidate you`, activity: `Use both sides once a month (supply, then a small borrow repaid within the week): lending programs often count borrowers as well as suppliers`, risk: `Liquidation and oracle risk: set a price alert at 60% loan-to-value and never loop borrowing to inflate points` };
  if (c.includes('dex') || c.includes('liquidity'))
    return { deposit: `Provide liquidity to a deep pair on ${name} (a stable pair keeps impermanent loss near zero) or route your usual swaps through it`, activity: `Swap at least weekly in modest size and keep the liquidity position in range; volume and liquidity-days are the usual measures`, risk: `Impermanent loss on volatile pairs and thin-pool slippage: quote every swap and stay on pools with more than $1M of depth` };
  if (c.includes('rwa'))
    return { deposit: `Pass ${name}'s onboarding (KYC can take 1-3 days), then buy its tokenized product with USDC; note the minimum ticket and redemption window`, activity: `Hold through at least one distribution period and use the token as collateral where ${name} lists an integration`, risk: `Issuer, custody and redemption risk: read the offering terms, the jurisdiction and how quickly you can redeem before sizing up` };
  if (c.includes('basis') || c.includes('stablecoin') || c.includes('cedefi'))
    return { deposit: `Mint or buy ${name}'s yield-bearing stablecoin with USDC and stake it in ${name}'s own vault`, activity: `Keep it staked and use it in one listed integration (a lending market or a stable pool) to show broader use`, risk: `Depeg and funding-rate risk: basis yields turn negative in a falling market; check the peg and the reserve report weekly` };
  if (c.includes('restak') || c.includes('collateral'))
    return { deposit: `Restake ETH or a liquid staking token in one of ${name}'s vaults and delegate to an operator with a public track record`, activity: `Keep the stake through the operator's next reward epochs; switching operators often resets accrual`, risk: `Slashing and long withdrawal queues (often 7+ days): only stake what you can leave locked` };
  if (c.includes('chain'))
    return { deposit: `Bridge a small balance to ${name} and keep a native gas balance there`, activity: `Use three or more of its native apps across different weeks (a swap, a lend, a mint): chain programs reward repeat activity over volume`, risk: `Bridge risk and thin liquidity: bridge in two tranches and keep the exit route tested` };
  if (c.includes('payment'))
    return { deposit: `Open a wallet that uses ${name} and fund it with a small balance`, activity: `Make real payments with it, several a month, rather than one large transfer`, risk: `Payment channels need liquidity management: keep amounts small and back up the wallet's recovery data` };
  if (c.includes('staking pool') || c.includes('governance'))
    return { deposit: `Stake through ${name}'s pool or lock into its incentive programme`, activity: `Vote or claim in each period it runs; programmes like this usually weight active participants`, risk: `Lock-ups and validator performance: check the unlock period before depositing` };
  return { deposit: `Open ${name}'s app on ${chain} and make its core deposit or trade with a small first ticket`, activity: `Return weekly and repeat the core action; record each transaction`, risk: `Read the audits and docs first: a protocol with no token has no market price to warn you of trouble` };
}

/** A costed, timed plan in 6 steps; each step reads as one 20-600 character sentence on the board. */
export function farmPlan(p: Protocol, age: number | null): Step[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const cc = costOf(chain);
  const a = actionFor(p.category ?? 'Other', p.name, chain);
  const tvlM = p.tvl_usd / 1e6;
  const young = age !== null && age < 365;
  const hold = young ? '8-12 weeks' : '4-8 weeks';
  return [
    { text: `Fund a fresh wallet on ${chain}: ${cc.bridge}`, cost: cc.gas.split(' a ')[0]!, time: '10-30 min' },
    { text: a.deposit, cost: `${cc.gas}; start with $500-5,000`, time: '15 min' },
    { text: `Size it to the pool: ${p.name} holds $${tvlM.toFixed(0)}M, so $1,000 is about ${(1000 / p.tvl_usd * 1e6).toFixed(1)} parts per million of it; scale up only after the first withdrawal test works`, cost: 'a second transaction to test the exit', time: '5 min' },
    { text: a.activity, cost: `${cc.gas}, 2-4 transactions a month`, time: '10 min a week' },
    { text: `Hold ${hold}: ${young ? `it has run ${age} days with no token, early enough that time in counts most` : age === null ? 'its start date is unrecorded, so assume a normal 4-12 week snapshot window' : `it has run ${age} days with no token, so a launch could come sooner; keep the position live`} and log each deposit's date and size`, cost: 'none beyond gas', time: hold },
    { text: `Risk check: ${a.risk}`, cost: 'none', time: '10 min before depositing' },
  ];
}

export const stepLine = (s: Step): string => `${s.text}. Cost: ${s.cost}. Time: ${s.time}.`;

// ---------------------------------------------------------------- the board

export function buildBoard(snapshot: Snapshot): { rows: Row[]; multiples: PeerMultiple[]; market: number; traded: Traded[] } {
  const watch = new Set(snapshot.watchlist);
  const { byCategory, market, traded } = peerMultiples(snapshot);
  const scored = snapshot.protocols.filter((p) => isCandidate(p, watch)).map((p) => {
    const category = p.category ?? 'Other';
    const peer = byCategory.get(category);
    const multiple = peer?.multiple ?? market;
    const g = Math.max(-GROWTH_CLAMP, Math.min(GROWTH_CLAMP, p.change_7d ?? 0));
    const growth = Math.exp((2 * g) / 100);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const runway = 0.85 + 0.3 * Math.min(1, (age ?? 0) / RUNWAY_DAYS);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * runway));
    const plan = farmPlan(p, age);
    return { slug: p.slug, name: p.name, rank: 0, implied_value_usd: implied, farm_steps: plan.map(stepLine), category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d, age_days: age, watchlist: watch.has(p.slug), multiple: round(multiple, 4), peers: peer?.peers ?? 0, growth: round(growth, 4), runway: round(runway, 4), plan };
  });
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  scored.forEach((r, i) => { r.rank = i + 1; });
  const multiples = [...byCategory.values()].sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  return { rows: scored, multiples, market, traded };
}

const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d;

/** Why the gate would refuse this board, or null. */
export function gateIssue(rows: Row[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows (100 to 4,000 needed)`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of rows) {
    if (!known.has(r.slug) || seen.has(r.slug)) return `slug ${r.slug} unknown or repeated`;
    seen.add(r.slug);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `${r.slug}: implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug}: a step of ${s.trim().length} characters`;
  }
  for (let i = 1; i < rows.length; i++) if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) return `rank ${i + 1} is worth more than rank ${i}`;
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1) return 'every implied value is the same';
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  return missing.length ? `watchlist not covered: ${missing.slice(0, 3).join(', ')}` : null;
}
