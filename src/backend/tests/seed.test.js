const fs = require("fs");
const os = require("os");
const path = require("path");
const bcrypt = require("bcrypt");
const { query } = require("../db/pool");
const { getMatchThreshold } = require("../services/matchingService");
const { LISTINGS, seed } = require("../scripts/seed");

const PASSWORD_VARS = {
  DEMO_PASSWORD_STUDENT: "Student-Test-Pass-1",
  DEMO_PASSWORD_FINDER: "Finder-Test-Pass-2",
  DEMO_PASSWORD_MODERATOR: "Moderator-Test-Pass-3",
};

async function runSeed() {
  const lines = [];
  await seed({ log: (line) => lines.push(line) });
  return lines.join("\n");
}

describe("demo seed", () => {
  let passwordFile;
  let saved;

  beforeEach(() => {
    saved = { ...process.env };
    Object.assign(process.env, PASSWORD_VARS);
    delete process.env.DEMO_PASSWORD_ADMIN;
    delete process.env.SEED_RESET_PASSWORDS;
    passwordFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seed-")), "passwords.txt");
    process.env.SEED_PASSWORD_FILE = passwordFile;
  });

  afterEach(() => {
    process.env = saved;
    fs.rmSync(path.dirname(passwordFile), { recursive: true, force: true });
  });

  test("is idempotent and creates users, listings, matches and notifications", async () => {
    const first = await runSeed();
    const second = await runSeed();

    const users = await query("SELECT email, role, isEmailVerified, isActive FROM dbo.Users ORDER BY email");
    expect(users).toHaveLength(4);
    const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
    expect(byEmail["demo.student@my.unt.edu"].role).toBe("user");
    expect(byEmail["demo.finder@my.unt.edu"].role).toBe("user");
    expect(byEmail["demo.moderator@unt.edu"].role).toBe("moderator");
    expect(byEmail["demo.admin@unt.edu"].role).toBe("admin");
    for (const user of users) {
      expect(user.isEmailVerified).toBe(true);
      expect(user.isActive).toBe(true);
    }

    const listings = await query("SELECT title, createdBy, type FROM dbo.Listings");
    expect(listings).toHaveLength(LISTINGS.length);
    expect(new Set(listings.map((l) => `${l.createdBy}|${l.type}|${l.title}`)).size).toBe(LISTINGS.length);

    const withPhotos = await query("SELECT COUNT(*) AS n FROM dbo.Listings WHERE imagesJson <> '[]'");
    expect(withPhotos[0].n).toBe(LISTINGS.length);

    const matches = await query("SELECT score FROM dbo.Matches WHERE score >= @t", { t: getMatchThreshold() });
    expect(matches.length).toBeGreaterThanOrEqual(3);

    const categories = await query("SELECT COUNT(*) AS n FROM dbo.Categories");
    expect(categories[0].n).toBe(9);

    const claims = await query("SELECT COUNT(*) AS n FROM dbo.Claims");
    expect(claims[0].n).toBe(0);

    const unread = await query(
      `SELECT COUNT(*) AS n FROM dbo.Notifications n JOIN dbo.Users u ON u.id = n.userId
       WHERE u.email = 'demo.student@my.unt.edu' AND n.isRead = 0`
    );
    expect(unread[0].n).toBeGreaterThanOrEqual(2);

    // The admin password was unset, so it was generated into the file only.
    const fileText = fs.readFileSync(passwordFile, "utf8");
    expect(fileText).toContain("demo.admin@unt.edu: ");
    const adminPassword = fileText.trim().split(": ")[1];
    const output = `${first}\n${second}`;
    for (const secret of [...Object.values(PASSWORD_VARS), adminPassword]) {
      expect(output).not.toContain(secret);
    }
    expect(fileText.trim().split("\n")).toHaveLength(1);
  });

  test("keeps existing passwords unless SEED_RESET_PASSWORDS=true", async () => {
    await runSeed();
    process.env.DEMO_PASSWORD_STUDENT = "Changed-Student-Pass-9";
    await runSeed();

    const [row] = await query("SELECT passwordHash FROM dbo.Users WHERE email = 'demo.student@my.unt.edu'");
    expect(await bcrypt.compare(PASSWORD_VARS.DEMO_PASSWORD_STUDENT, row.passwordHash)).toBe(true);

    process.env.SEED_RESET_PASSWORDS = "true";
    await runSeed();
    const [reset] = await query("SELECT passwordHash FROM dbo.Users WHERE email = 'demo.student@my.unt.edu'");
    expect(await bcrypt.compare("Changed-Student-Pass-9", reset.passwordHash)).toBe(true);
  });

  test("errors when no password source is available", async () => {
    delete process.env.DEMO_PASSWORD_STUDENT;
    delete process.env.SEED_PASSWORD_FILE;
    await expect(runSeed()).rejects.toThrow(/DEMO_PASSWORD_STUDENT/);
  });
});
