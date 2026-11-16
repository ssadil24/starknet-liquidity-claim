import fs from "node:fs";
import { RpcProvider, hash } from "starknet";

const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
const txHash = process.argv[2];
if (!txHash) { console.error("Usage: node find-from-tx.mjs <txHash>"); process.exit(1); }
const provider = new RpcProvider({ nodeUrl: cfg.rpc });

const hex = (x) => "0x" + BigInt(x).toString(16).padStart(64, "0");
const names = ["approve", "transfer", "addLiquidity", "add_liquidity",
  "removeLiquidity", "remove_liquidity", "swapExactTokensForTokens", "swap_exact_tokens_for_tokens"];
const known = {};
for (const n of names) known[BigInt(hash.getSelectorFromName(n)).toString()] = n;

const tx = await provider.getTransactionByHash(txHash);
const receipt = await provider.getTransactionReceipt(txHash);
const cd = tx.calldata.map(BigInt);

let calls = null;
try { // newer accounts: [n, (to, selector, len, ...data)*]
  let i = 1; const out = [];
  for (let k = 0; k < Number(cd[0]); k++) {
    const len = Number(cd[i + 2]);
    out.push({ to: cd[i], sel: cd[i + 1], data: cd.slice(i + 3, i + 3 + len) });
    i += 3 + len;
  }
  if (i === cd.length) calls = out;
} catch {}
if (!calls) { // older accounts: [n, (to, selector, offset, len)*, total_len, ...data]
  const n = Number(cd[0]);
  const all = cd.slice(2 + 4 * n);
  calls = [];
  for (let k = 0; k < n; k++) {
    const b = 1 + 4 * k, off = Number(cd[b + 2]), len = Number(cd[b + 3]);
    calls.push({ to: cd[b], sel: cd[b + 1], data: all.slice(off, off + len) });
  }
}

console.log("Sender wallet:", tx.sender_address, "\n");
let router = null, tokens = [];
for (const c of calls) {
  const fn = known[c.sel.toString()] ?? hex(c.sel);
  console.log(`CALL ${fn} on ${hex(c.to)}`);
  if (fn === "addLiquidity" || fn === "add_liquidity") {
    router = hex(c.to);
    tokens = [hex(c.data[0]), hex(c.data[1])];
  }
}

if (!router) {
  console.log("\nNo add-liquidity call recognised. Paste this output into the chat.");
  process.exit(0);
}

const skip = new Set([router, ...tokens, hex(tx.sender_address)]);
const pairs = [...new Set(receipt.events.map((e) => hex(e.from_address)))].filter((a) => !skip.has(a));

console.log("\nRouter:", router, "\nTokens:", tokens.join(" / "));
console.log("Pair candidates (the LP token you saw in your wallet):", pairs);
console.log("\nPaste into config.json -> pools:");
console.log(JSON.stringify({ name: "my-pool", router, pair: pairs[0] ?? "<fill in>" }, null, 2));
