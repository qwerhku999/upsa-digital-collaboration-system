import { prisma } from "@/lib/prisma";

/** Atomic fixed-window counter shared by all server instances. Returns the count in the current window. */
export async function hit(key: string, windowSeconds: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, (now() AT TIME ZONE 'UTC'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSeconds}::double precision)
                     THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSeconds}::double precision)
                           THEN (now() AT TIME ZONE 'UTC') ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return Number(rows[0]?.count ?? 0);
}

export async function resetLimit(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
