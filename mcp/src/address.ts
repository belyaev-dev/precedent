// The key the rate limiter counts a client under. Used for counting and for nothing else; never logged.

/**
 * An IPv4 address counts as itself. An IPv6 address counts as its /64, because one subscriber is
 * normally given at least a /64 and can pick any address in it: counting single addresses would let
 * one machine appear as millions of clients. Anything that does not parse is used as it stands.
 */
export function limiterKey(address: string | null): string {
  if (!address) return "unknown";
  const text = address.trim().toLowerCase();
  if (!text.includes(":")) return text;

  // An IPv4 address written inside an IPv6 one (::ffff:203.0.113.7) is that IPv4 client.
  const mapped = text.match(/^(?:0{0,4}:){2,6}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1]!;

  const halves = text.split("::");
  if (halves.length > 2) return text;
  const groups = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const [head, tail] = [groups(halves[0]!), groups(halves[1] ?? "")];
  // A trailing dotted quad stands for two groups.
  const written = head.length + tail.length + ([...head, ...tail].at(-1)?.includes(".") ? 1 : 0);
  const zeros = halves.length === 2 ? 8 - written : 0;
  const all = [...head, ...Array<string>(Math.max(0, zeros)).fill("0"), ...tail];
  if ((halves.length === 2 ? zeros < 1 : written !== 8) || all.slice(0, 4).some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return text;
  return `${all
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
