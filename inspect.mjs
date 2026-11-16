import fs from "node:fs";
import { RpcProvider, shortString } from "starknet";

const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
const poolName = process.argv[2] ?? cfg.pools[0].name;
const pool = cfg.pools.find((p) => p.name === poolName);
if (!pool) {
  console.error(`Pool "${poolName}" not found. Available: ${cfg.pools.map((p) => p.name).join(", ")}`);
  process.exit(1);
}
const provider = new RpcProvider({ nodeUrl: cfg.rpc });

const u256 = (lo, hi) => BigInt(lo) + (BigInt(hi) << 128n);
const call = (contractAddress, entrypoint, calldata = []) =>
  provider.callContract({ contractAddress, entrypoint, calldata });

async function tryCall(address, names, calldata = []) {
  for (const entrypoint of names) {
    try { return { entrypoint, result: await call(address, entrypoint, calldata) }; } catch {}
  }
  return null;
}
const collectFns = (abi, out = []) => {
  for (const i of abi) {
    if (i.type === "function") out.push(i);
    if (i.items) collectFns(i.items, out);
  }
  return out;
};
const fmt = (v, d) => {
  if (d === 0) return v.toString();
  const s = v.toString().padStart(d + 1, "0");
  return s.slice(0, -d) + "." + s.slice(-d);
};

// 1) Router functions (follows proxies to the real implementation)
let cls = await provider.getClassAt(pool.router);
let fns = collectFns(cls.abi);
if (fns.some((f) => f.name === "get_implementation_hash")) {
  const [implHash] = await call(pool.router, "get_implementation_hash");
  cls = await provider.getClassByHash(implHash);
  fns = collectFns(cls.abi);
  console.log("Router is a proxy, implementation class:", implHash);
}
const removeFn = fns.find((f) => f.name === "remove_liquidity" || f.name === "removeLiquidity");
if (!removeFn) {
  console.error("No remove-liquidity function found. Functions:", fns.map((f) => f.name));
  process.exit(1);
}
console.log("Remove function:", removeFn.name,
  "(" + removeFn.inputs.map((i) => i.name + ":" + i.type).join(", ") + ")");
if (removeFn.inputs.length !== 7) {
  console.error("Unexpected parameter list (expected 7). Paste this output into the chat before going on.");
  process.exit(1);
}

// 2) Pool state
const bal = await tryCall(pool.pair, ["balanceOf", "balance_of"], [cfg.wallet]);
const sup = await tryCall(pool.pair, ["totalSupply", "total_supply"]);
const res = await tryCall(pool.pair, ["getReserves", "get_reserves"]);
const t0 = await tryCall(pool.pair, ["token0"]);
const t1 = await tryCall(pool.pair, ["token1"]);
if (!bal || !sup || !res || !t0 || !t1) {
  console.error("Could not read the pair contract. Is the pair address correct?");
  process.exit(1);
}

const lp = u256(bal.result[0], bal.result[1]);
const ts = u256(sup.result[0], sup.result[1]);
if (lp === 0n) { console.log("LP balance is 0 for this wallet. Nothing to withdraw."); process.exit(0); }

const r = res.result; // felts: [r0, r1, ts]  |  Uint256: [r0lo, r0hi, r1lo, r1hi, ts]
const r0 = r.length >= 5 ? u256(r[0], r[1]) : BigInt(r[0]);
const r1 = r.length >= 5 ? u256(r[2], r[3]) : BigInt(r[1]);
const exp0 = (lp * r0) / ts;
const exp1 = (lp * r1) / ts;

async function tokenInfo(address) {
  const dec = await tryCall(address, ["decimals"]);
  const sym = await tryCall(address, ["symbol"]);
  let symbol = address;
  try {
    const raw = sym.result.length > 1 ? sym.result[1] : sym.result[0];
    symbol = shortString.decodeShortString(raw) || address;
  } catch {}
  return { address, symbol, decimals: dec ? Number(dec.result[0]) : 18 };
}
const tok0 = await tokenInfo(t0.result[0]);
const tok1 = await tokenInfo(t1.result[0]);

const bps = BigInt(Math.round((cfg.slippagePercent ?? 2) * 100));
const minOf = (v) => (v * (10000n - bps)) / 10000n;

const plan = {
  name: pool.name,
  rpc: cfg.rpc,
  wallet: cfg.wallet,
  router: pool.router,
  pair: pool.pair,
  removeEntrypoint: removeFn.name,
  lp: lp.toString(),
  token0: tok0,
  token1: tok1,
  expected0: exp0.toString(),
  expected1: exp1.toString(),
  min0: minOf(exp0).toString(),
  min1: minOf(exp1).toString(),
  readable: `${fmt(exp0, tok0.decimals)} ${tok0.symbol} + ${fmt(exp1, tok1.decimals)} ${tok1.symbol}`,
  createdAt: new Date().toISOString(),
};
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/plan.json", JSON.stringify(plan, null, 2));

console.log("\nPool        :", pool.name);
console.log("LP balance  :", lp.toString(), `(${(Number(lp) / Number(ts) * 100).toFixed(4)}% of pool)`);
console.log("You receive :", plan.readable);
console.log("Slippage    :", cfg.slippagePercent ?? 2, "%");
console.log("\nWrote public/plan.json. Now run: npm run dev");
